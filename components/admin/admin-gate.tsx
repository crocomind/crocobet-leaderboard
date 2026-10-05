"use client";

import { ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { StatePanel } from "@/components/common/state-panel";
import { ListSkeleton } from "@/components/leaderboard/leaderboard-skeleton";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import { useCurrentUserQuery } from "@/lib/api/queries";
import { useAppUrlState } from "@/lib/hooks/use-app-url-state";

/**
 * Renders the admin panel only for admins, so other employees never download
 * it. Hiding it is a convenience: the server enforces access on every call.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const currentUser = useCurrentUser();
  const me = useCurrentUserQuery(currentUser.status === "signed-in");
  const { setView } = useAppUrlState();

  if (me.isPending)
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t.leaderboard.updating}</span>
        <ListSkeleton />
      </div>
    );
  if (currentUser.user?.role !== "admin")
    return (
      <StatePanel
        icon={<ShieldX />}
        title={t.admin.forbidden.title}
        description={t.admin.forbidden.description}
        action={
          <MotionButton
            variant="secondary"
            onClick={() => setView("leaderboard")}
          >
            {t.admin.forbidden.back}
          </MotionButton>
        }
      />
    );
  return children;
}
