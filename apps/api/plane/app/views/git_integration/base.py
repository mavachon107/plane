# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import re

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import GitRepositorySerializer, IssueGitReferenceSerializer
from plane.bgtasks.git_webhook_task import process_github_event
from plane.db.models import GitRepository, Issue, IssueGitReference, Project
from plane.settings.redis import redis_instance
from plane.utils.git_references import verify_github_signature

GITHUB_URL_PATTERN = re.compile(
    r"^https://github\.com/(?P<owner>[\w.-]+)/(?P<name>[\w.-]+)/(?:(?P<pr>pull)/(?P<number>\d+)|tree/(?P<branch>.+))/?$"
)
HANDLED_EVENTS = {"ping", "create", "delete", "push", "pull_request"}
MAX_PAYLOAD_BYTES = 5 * 1024 * 1024


class GitRepositoryEndpoint(BaseAPIView):
    """Connect a GitHub repository to a project (one per project)."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        repository = GitRepository.objects.filter(workspace__slug=slug, project_id=project_id).first()
        if repository is None:
            return Response(None, status=status.HTTP_200_OK)
        return Response(GitRepositorySerializer(repository).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN])
    def post(self, request, slug, project_id):
        if GitRepository.objects.filter(workspace__slug=slug, project_id=project_id).exists():
            return Response(
                {"error": "A repository is already connected to this project"}, status=status.HTTP_409_CONFLICT
            )
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        serializer = GitRepositorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        repository = serializer.save(
            project=project,
            workspace=project.workspace,
            url=f"https://github.com/{serializer.validated_data['owner']}/{serializer.validated_data['name']}",
        )
        data = GitRepositorySerializer(repository).data
        # The secret is only returned here, once
        data["webhook_secret"] = repository.webhook_secret
        data["webhook_path"] = f"/api/git/github/{repository.id}/webhook/"
        return Response(data, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=[ROLE.ADMIN])
    def patch(self, request, slug, project_id):
        repository = GitRepository.objects.get(workspace__slug=slug, project_id=project_id)
        serializer = GitRepositorySerializer(repository, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN])
    def delete(self, request, slug, project_id):
        repository = GitRepository.objects.get(workspace__slug=slug, project_id=project_id)
        repository.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueGitReferenceEndpoint(BaseAPIView):
    """Branches and pull requests linked to a work item."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        references = IssueGitReference.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).order_by("-created_at")
        return Response(IssueGitReferenceSerializer(references, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        """Manually link a PR or branch of the project's repository by URL."""
        repository = GitRepository.objects.filter(workspace__slug=slug, project_id=project_id).first()
        if repository is None:
            return Response({"error": "No repository is connected to this project"}, status=status.HTTP_400_BAD_REQUEST)

        match = GITHUB_URL_PATTERN.match((request.data.get("url") or "").strip())
        if (
            match is None
            or match.group("owner").lower() != repository.owner.lower()
            or match.group("name").lower() != repository.name.lower()
        ):
            return Response(
                {"error": "URL must be a pull request or branch of the connected repository"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue = Issue.issue_objects.get(pk=issue_id, project_id=project_id, workspace__slug=slug)
        if match.group("pr"):
            kind, external_id, state = IssueGitReference.Kind.PULL_REQUEST, match.group("number"), "open"
        else:
            kind, external_id, state = IssueGitReference.Kind.BRANCH, match.group("branch"), "active"

        reference, _ = IssueGitReference.objects.get_or_create(
            repository=repository,
            issue=issue,
            kind=kind,
            external_id=external_id,
            defaults={
                "project_id": project_id,
                "url": match.group(0),
                "title": external_id if kind == IssueGitReference.Kind.BRANCH else f"#{external_id}",
                "state": state,
                "metadata": {"manual": True},
            },
        )
        return Response(IssueGitReferenceSerializer(reference).data, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        IssueGitReference.objects.get(pk=pk, workspace__slug=slug, project_id=project_id, issue_id=issue_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GithubWebhookEndpoint(APIView):
    """Receives GitHub webhooks. Authenticated by HMAC signature only (no session)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, repository_id):
        body = request.body
        if len(body) > MAX_PAYLOAD_BYTES:
            return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        repository = GitRepository.objects.filter(pk=repository_id, is_active=True).first()
        # Identical response for unknown repository and bad signature, to avoid probing
        if repository is None or not verify_github_signature(
            repository.webhook_secret, body, request.headers.get("X-Hub-Signature-256")
        ):
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        event = request.headers.get("X-GitHub-Event", "")
        if event == "ping":
            return Response({"message": "pong"}, status=status.HTTP_200_OK)
        if event not in HANDLED_EVENTS:
            return Response(status=status.HTTP_204_NO_CONTENT)

        # GitHub retries deliveries: process each delivery id once
        delivery = request.headers.get("X-GitHub-Delivery")
        if delivery:
            try:
                if not redis_instance().set(f"git:delivery:{repository.id}:{delivery}", 1, nx=True, ex=86400):
                    return Response(status=status.HTTP_200_OK)
            except Exception:
                pass

        try:
            payload = json.loads(body)
        except ValueError:
            return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)

        process_github_event.delay(str(repository.id), event, payload)
        return Response(status=status.HTTP_202_ACCEPTED)
