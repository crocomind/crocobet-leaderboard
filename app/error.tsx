"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { StatePanel } from "@/components/common/state-panel";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <StatePanel
        role="alert"
        tone="danger"
        icon={<TriangleAlert />}
        title={t.errors.pageTitle}
        className="w-full"
        action={
          <MotionButton onClick={retry}>
            <RefreshCw />
            {t.common.retry}
          </MotionButton>
        }
      />
    </main>
  );
}
