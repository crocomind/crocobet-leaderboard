"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import {
  ResponsiveDialog,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Optional; e.g. an error message after a failed attempt. */
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  /** Destructive actions get the danger button. */
  destructive?: boolean;
}

/** A small yes/no dialog for actions that can't be undone. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
  destructive,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      className="md:w-[min(calc(100vw-2rem),26rem)]"
      {...(description ? {} : { "aria-describedby": undefined })}
    >
      <div className="px-5 pt-2 pb-6 md:px-6 md:pt-6">
        <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
        {description && (
          <ResponsiveDialogDescription className="mt-2">
            {description}
          </ResponsiveDialogDescription>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <MotionButton variant="secondary" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </MotionButton>
          <MotionButton
            variant={destructive ? "danger" : "primary"}
            loading={pending ?? false}
            onClick={onConfirm}
          >
            {confirmLabel}
          </MotionButton>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
