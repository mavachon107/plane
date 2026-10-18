# GitHub integration: branches, PRs and state transitions

Status: draft, nothing implemented. Base branch: `preview` (feature branch `feat/github-integration`).

## Goal

1. Branches and pull requests from GitHub appear on the work item they reference.
2. Branch/PR lifecycle events move the work item between states (outbound transition).
3. Self-hosted friendly: no GitHub App registration; one webhook per repository with a shared secret.

## Findings that shape the design

- The only GitHub code today is OAuth login and dead legacy issue-sync models (`plane/db/models/integration/github.py`). Do not reuse them: they model GitHub _issues_, and no views exist.
- `IssueLink` is generic (title, url, metadata) and has no state. Keep it as-is.
- Work item key = `Project.identifier` + `Issue.sequence_id` (e.g. `PARCOURS-123`). Identifier is unique per workspace, uppercase, max 12 chars.
- State changes already flow through `issue_activity` (`plane/bgtasks/issue_activities_task.py`), so a transition made by a bot user gets activity, notifications and webhooks for free.
- `State.group` (backlog, unstarted, started, completed, cancelled) is the stable hook for transitions; state names are user-defined.
- Latest migration is `0125`. Migrations are append-only (CI-enforced).

## Data model (apps/api/plane/db/models/)

New file `git_integration.py`, exported from `models/__init__.py`. All project-scoped (`ProjectBaseModel`), same pattern as `IssueLink`.

- `GitRepository`: project, `provider` (`github`), `owner`, `name`, `url`, `webhook_secret` (encrypted, see Security), `is_active`, and `state_mapping` JSON (see Transitions). One active repository per project: unique on (project) when `deleted_at` is null (conditional `UniqueConstraint`, as `State` does). A repository (provider, owner, name) can still be connected to different projects.
- `IssueGitReference`: issue FK (`related_name="git_references"`), repository FK, `kind` (`branch` | `pull_request`), `external_id` (PR number, or branch name), `url`, `title`, `state` (`open` | `draft` | `merged` | `closed` for PRs; `active` | `deleted` for branches), `source_branch`, `target_branch`, `author_login`, `author_avatar_url`, `merged_at`, `metadata` JSON. Unique on (repository, kind, external_id, issue).

One PR can reference several work items; one row per issue.

Migration `0126_gitrepository_issuegitreference.py`.

## Backend

### Inbound webhook

- Route: `POST /api/public/git/github/<uuid:repository_id>/webhook/` (mounted under the anonymous `plane.space`-style surface, but with signature auth, not session auth). New view in `plane/api/views/` or a small new module; copy `BaseAPIView` conventions of the surface it lands in.
- Verify `X-Hub-Signature-256` (HMAC SHA-256 over raw body) with `hmac.compare_digest`. Reject missing or invalid signatures with 401 before parsing JSON. Respond 200 fast and hand off to Celery.
- Handle `X-GitHub-Event`: `ping` (return 200), `create` / `delete` (branch only; `ref_type == "branch"`), `push` (new branch detection and commit messages), `pull_request` (`opened`, `reopened`, `edited`, `ready_for_review`, `converted_to_draft`, `closed` with `merged` flag, `synchronize`). Ignore everything else.
- Dedupe with `X-GitHub-Delivery` in Redis (TTL 24h); GitHub retries.

### Key parsing

`plane/utils/git_references.py`: `extract_issue_keys(text, identifiers)`.

- Regex built from the workspace's project identifiers, case-insensitive: `\b(IDENT)-(\d+)\b`.
- Sources in priority order: branch name, PR title, PR body, commit messages (push).
- Resolve to `Issue` by (project identifier, `sequence_id`) within the repository's workspace. Only link issues in the repository's own project unless the repo is flagged workspace-wide (v2; out of scope).
- Closing keywords in the PR body (`closes`, `fixes`, `resolves` + key) mark the reference as `closes=True` in `metadata`; this decides the merge transition.

### Celery task `plane/bgtasks/git_webhook_task.py`

`process_github_event(repository_id, event, payload)`:

1. Resolve keys, upsert `IssueGitReference` rows (idempotent).
2. If a reference's keys changed after an `edited` event, add/remove rows accordingly.
3. Call the transition service (below).
4. Emit `issue_activity(type="git_reference.activity.created|updated", ...)` so it appears in the Activity tab and History. Add the new activity handlers to the `ACTIVITY_MAPPER` in `issue_activities_task.py`.

### Outbound: state transitions

`plane/utils/git_transitions.py`, called from the task. Default mapping (overridable per repository in `state_mapping`):

| Event                                       | Target state group                                              | Condition                                                             |
| ------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| Branch created or first push naming the key | `started`                                                       | issue currently in `backlog` or `unstarted`                           |
| PR opened (not draft)                       | `started` ("In review" state if mapped)                         | issue not already `completed`/`cancelled`                             |
| PR converted to draft                       | no change                                                       |                                                                       |
| PR merged                                   | `completed`                                                     | PR body has a closing keyword, or repo setting `close_on_merge` is on |
| PR closed unmerged                          | revert to previous group only if no other open PR/branch exists | optional, off by default                                              |

Rules:

- Never move an issue backwards out of `completed`/`cancelled`, except via an explicit reopen mapping.
- Pick the target state by group; if the group has several states, use `state_mapping[event]` (a state id) when set, otherwise the lowest-`sequence` state in that group.
- The change is attributed to a per-instance bot user (`git-bot`, created lazily, `is_bot=True`), so activity shows "GitHub" rather than a person. Check what `User.is_bot` already supports before adding a field.
- Apply through the same code path as a normal issue update (`issue_activity` with `track_state`), not a raw `save()`, so `completed_at`, notifications and outbound webhooks fire.
- Idempotent: a re-delivered event does not re-transition.

### First-party API (session auth, `plane/app`)

- `GET/POST /workspaces/<slug>/projects/<id>/git-repositories/` and `PATCH/DELETE .../<pk>/`: admin-only (project admin permission). `POST` returns the webhook URL and the secret exactly once.
- `GET /workspaces/<slug>/projects/<id>/issues/<issue_id>/git-references/` and an inline `git_references` field on the single-issue retrieve serializer (same approach as `release_ids`; not in list endpoints).
- Manual link: `POST .../git-references/` with a PR or branch URL, for repos without a webhook. Validates host is `github.com` and the repo is registered.

### Security

- Webhook secret stored encrypted (reuse the encryption helper used for instance config if one exists; otherwise Fernet keyed by `SECRET_KEY`). Never returned after creation.
- Constant-time signature compare; body size cap; do not log payloads.
- URL fields rendered on the frontend must be validated as `https://github.com/...` to avoid `javascript:` URLs.
- Rate limit the endpoint by repository id.

## Frontend

- Types: `packages/types` (`TGitReference`, `TGitRepository`).
- Service: `packages/services` (`GitRepositoryService`), grouped by domain like existing ones; stores call services.
- Store: `store/git-integration.store.ts` (MobX), hook in `hooks/store/`.
- Work item detail: a collapsible "Development" section in `components/issues/issue-detail/properties-sections.tsx` (same file that holds Details and Project structure). Rows show a PR/branch icon, `#123 title`, state badge (open/draft/merged/closed), author avatar, and an external link. Peek view reuses it. Empty state is hidden entirely when there are no references.
- Activity tab: render `git_reference` activities in the Activity and Transition filters.
- Project settings: new "GitHub" page under project settings with repository list, add-repository form (owner/name, mapping, `close_on_merge`), and a one-time reveal of webhook URL and secret with copy buttons and setup instructions.
- Branch name helper: "Copy branch name" button in the work item quick actions generating `feat/PARCOURS-123-short-title`, so the convention that makes linking work is one click.
- i18n: add all new keys to every locale in `packages/i18n/src/locales/` (22), using the `translate` skill.

## Testing

- Unit: key extraction (case, multiple keys, identifier boundaries, false positives like `UTF-8`), signature verification, transition rules table (each row above, including no-backward-move and idempotency).
- Contract: webhook endpoint with fixture payloads for `ping`, `create`, `push`, `pull_request` opened/merged/closed; assert references and state changes and activity rows. Fixtures under `plane/tests/`.
- Frontend: vitest for the Development section rendering states; manual browser check on full page and peek.
- End to end locally: expose the local stack with a tunnel, point a real GitHub test repo webhook at it, push a branch and open and merge a PR.

## Delivery order

1. Models, migration, key parser, signature check (+ tests).
2. Webhook endpoint, Celery task, reference upsert, activity.
3. Transition service and bot user (+ tests).
4. First-party API and serializer field.
5. Frontend: types, service, store, Development section.
6. Project settings page and branch-name helper.
7. i18n, lint (`pnpm check`), copyright headers, `makemigrations --check`.

Each step is independently committable; steps 1 to 4 deliver a working backend before any UI.

## Decisions (confirmed)

- Per-repository webhook with a shared secret; no GitHub App.
- PR opened (non-draft) moves the work item to the `started` group.
- One repository per project, and the integration is configured per project. `GitRepository` is unique on (project) among active rows, and keys are only resolved within that project's identifier.

## Still open (defaults proposed)

- Closed-unmerged PRs do not revert state.
- Bot user: reuse `is_bot` users if the model supports it, else add a dedicated system user.

## Implementation notes (backend, steps 1-4)

- Migration is `0125_gitrepository_issuegitreference` on this branch (cut from `preview`, latest was 0124). `feat/releases-backend` also adds a `0125`: renumber one of them (and its dependency) when the branches meet.
- Webhook route is `POST /api/git/github/<repository_id>/webhook/` (session-less, HMAC-authenticated), not under `/api/public/`.
- `webhook_secret` is stored in plaintext (like `Webhook.secret_key`): HMAC verification needs the raw value. It is never serialized after creation.
- Push events link branches only; commit messages are not scanned.
- Manual link (`POST .../git-references/`) records the URL with `metadata.manual` and cannot fetch PR title/state (no GitHub API token).
- References are served by `GET .../issues/<id>/git-references/` rather than embedded in the issue detail serializer.
- Bot user: `git_integration_bot` with `bot_type=GIT_INTEGRATION`, created lazily.

## Implementation notes (frontend, steps 5-6)

- No MobX store: reference and repository data are fetched with SWR through `apps/web/services/git-integration.service.ts` (the plan's store/hook layer was dropped as unnecessary for read-mostly data).
- "Development" section is `IssueGitReferences`, rendered inside `IssueDetailWidgets`, so it appears in both the full page and the peek view. It renders nothing when a work item has no references. `preview` has no Details/Project structure sections (those live on `develop`), so it is not placed inside them.
- Project settings page lives at `/settings/projects/:projectId/github` (Execution group, admin only).
- "Copy branch name" button sits next to "Copy link" in the work item header.
- i18n: `git_integration.*` and `project_settings.github.label` in `project-settings.json`, all 22 locales (sync check passes). Translations are AI-drafted and need native review per the `translate` skill.
- Not done: manual "link PR" UI (API exists), per-event state mapping UI (`state_mapping` is API-only), browser verification.
