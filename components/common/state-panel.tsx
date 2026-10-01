import { RefreshCw, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { MotionButton } from "@/components/ui/motion-button";
import { cn } from "@/lib/utils";

interface StatePanelProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "danger";
  className?: string;
  role?: "status" | "alert";
}

export function StatePanel({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
  role,
}: StatePanelProps) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center rounded-card border border-border bg-surface/70 px-6 py-12 text-center shadow-soft",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mb-4 inline-flex size-14 items-center justify-center rounded-full [&_svg]:size-6",
          tone === "danger"
            ? "bg-danger/12 text-danger-text"
            : "bg-brand/12 text-brand-text",
        )}
      >
        {icon}
      </span>
      <p className="text-lg font-semibold text-balance">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
  retrying?: boolean;
  /** Shown next to the spinner while retrying. */
  retryingLabel?: string;
  className?: string;
}

export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  retrying = false,
  retryingLabel,
  className,
}: ErrorStateProps) {
  return (
    <StatePanel
      role="alert"
      tone="danger"
      icon={<WifiOff />}
      title={title}
      description={description}
      className={className}
      action={
        <MotionButton
          variant="secondary"
          onClick={onRetry}
          loading={retrying}
          loadingLabel={retryingLabel}
        >
          <RefreshCw />
          {retryLabel}
        </MotionButton>
      }
    />
  );
}
