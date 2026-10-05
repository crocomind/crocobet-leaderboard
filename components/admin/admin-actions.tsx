"use client";

import { Ban, Check, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import type { AdminAction, AdminPost } from "@/lib/api/types";
import { availableAdminActions } from "@/lib/moderation";
import { cn } from "@/lib/utils";

export type OnAdminAction = (action: AdminAction, post: AdminPost) => void;

const ICONS = {
  approve: Check,
  reject: X,
  disqualify: Ban,
  reinstate: ShieldCheck,
  reopen: RotateCcw,
} as const satisfies Record<AdminAction, unknown>;

/** The moderation actions that apply to the post's status. */
export function AdminActions({
  post,
  onAction,
  busy,
  compact,
  className,
}: {
  post: AdminPost;
  onAction: OnAdminAction;
  busy?: boolean;
  /** Smaller buttons for table rows. */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const actions = availableAdminActions(post.status);

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {actions.map((action) => {
        const Icon = ICONS[action];
        const anyway = action === "approve" && post.check.status !== "passed";
        const label = anyway
          ? t.admin.actions.approveAnyway
          : t.admin.actions[action];
        const destructive = action === "reject" || action === "disqualify";
        return (
          <MotionButton
            key={action}
            size="sm"
            variant={
              destructive
                ? "danger"
                : action === "approve" && !anyway
                  ? "primary"
                  : "secondary"
            }
            disabled={busy}
            onClick={() => onAction(action, post)}
            className={compact ? "h-8 px-2.5 text-xs" : undefined}
            // In table rows, say whose post it is (the visible label stays first).
            aria-label={compact ? `${label}: ${post.employee.name}` : undefined}
          >
            <Icon aria-hidden="true" />
            {label}
            {anyway && "…"}
            {destructive && "…"}
          </MotionButton>
        );
      })}
    </div>
  );
}
