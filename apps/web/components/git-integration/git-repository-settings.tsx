/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Copy } from "lucide-react";
// plane imports
import { API_BASE_URL } from "@plane/constants";
import { Button } from "@makeplane/propel/components/button";
import { Input, InputGroup } from "@makeplane/propel/components/input";
import { Switch } from "@makeplane/propel/components/switch";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TGitRepositoryCreated } from "@plane/types";
import { copyTextToClipboard } from "@plane/utils";
// services
import { GitIntegrationService } from "@/services/git-integration.service";

const gitIntegrationService = new GitIntegrationService();

type Props = {
  workspaceSlug: string;
  projectId: string;
};

function CopyField(props: { label: string; value: string; copiedMessage: string }) {
  const { label, value, copiedMessage } = props;
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-13 text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <Input size="md" readOnly value={value} />
        <Button
          variant="secondary"
          size="md"
          stretch="auto"
          label={t("git_integration.copy")}
          icon={<Copy className="size-3.5" />}
          iconPosition="start"
          onClick={async () => {
            await copyTextToClipboard(value);
            setToast({ type: "success", title: copiedMessage });
          }}
        />
      </div>
    </div>
  );
}

export const GitRepositorySettings = observer(function GitRepositorySettings(props: Props) {
  const { workspaceSlug, projectId } = props;
  // translation
  const { t } = useTranslation();
  // state
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // shown once, right after connecting
  const [created, setCreated] = useState<TGitRepositoryCreated | null>(null);
  // fetch
  const {
    data: repository,
    isLoading,
    mutate,
  } = useSWR(`PROJECT_GIT_REPOSITORY_${projectId}`, () =>
    gitIntegrationService.getRepository(workspaceSlug, projectId)
  );

  const webhookUrl = (path: string) => `${API_BASE_URL || window.location.origin}${path}`;

  const handleConnect = async () => {
    setIsSubmitting(true);
    try {
      const result = await gitIntegrationService.connectRepository(workspaceSlug, projectId, {
        owner: owner.trim(),
        name: name.trim(),
      });
      setCreated(result);
      await mutate();
    } catch (error) {
      setToast({
        type: "error",
        title: t("toast.error"),
        message: (error as { error?: string })?.error ?? t("git_integration.connect_error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseOnMerge = async (value: boolean) => {
    if (!repository) return;
    await mutate({ ...repository, close_on_merge: value }, false);
    try {
      await gitIntegrationService.updateRepository(workspaceSlug, projectId, { close_on_merge: value });
    } catch {
      setToast({ type: "error", title: t("toast.error") });
    }
    await mutate();
  };

  const handleDisconnect = async () => {
    try {
      await gitIntegrationService.disconnectRepository(workspaceSlug, projectId);
      setCreated(null);
      await mutate(null, false);
    } catch {
      setToast({ type: "error", title: t("toast.error") });
    }
  };

  if (isLoading) return null;

  if (!repository) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-13 text-secondary">{t("git_integration.description")}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-13 text-secondary">{t("git_integration.owner")}</span>
            <InputGroup size="md">
              <Input size="md" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="acme" />
            </InputGroup>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-13 text-secondary">{t("git_integration.repository")}</span>
            <InputGroup size="md">
              <Input size="md" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-repo" />
            </InputGroup>
          </div>
        </div>
        <div>
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            label={t("git_integration.connect")}
            loading={isSubmitting}
            disabled={!owner.trim() || !name.trim()}
            onClick={handleConnect}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-14 font-medium text-primary">
            {repository.owner}/{repository.name}
          </span>
          <a
            href={repository.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-12 text-tertiary hover:underline"
          >
            {repository.url}
          </a>
        </div>
        <Button
          variant="secondary"
          size="md"
          stretch="auto"
          label={t("git_integration.disconnect")}
          onClick={handleDisconnect}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-14 text-primary">{t("git_integration.close_on_merge")}</span>
          <span className="text-12 text-tertiary">{t("git_integration.close_on_merge_description")}</span>
        </div>
        <Switch
          size="sm"
          checked={repository.close_on_merge}
          onCheckedChange={handleCloseOnMerge}
          aria-label={t("git_integration.close_on_merge")}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-subtle p-4">
        <span className="text-14 font-medium text-primary">{t("git_integration.webhook_setup")}</span>
        <CopyField
          label={t("git_integration.payload_url")}
          value={webhookUrl(created?.webhook_path ?? `/api/git/github/${repository.id}/webhook/`)}
          copiedMessage={t("common.copied_to_clipboard")}
        />
        {created ? (
          <>
            <CopyField
              label={t("git_integration.secret")}
              value={created.webhook_secret}
              copiedMessage={t("common.copied_to_clipboard")}
            />
            <p className="text-12 text-warning-primary">{t("git_integration.secret_warning")}</p>
          </>
        ) : (
          <p className="text-12 text-tertiary">{t("git_integration.secret_hidden")}</p>
        )}
        <ol className="list-decimal pl-5 text-12 text-secondary">
          <li>{t("git_integration.step_1")}</li>
          <li>{t("git_integration.step_2")}</li>
          <li>{t("git_integration.step_3")}</li>
        </ol>
      </div>
    </div>
  );
});
