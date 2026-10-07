"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { ChipGroup } from "@/components/ui/chip-group";
import { Label } from "@/components/ui/label";
import { MotionButton } from "@/components/ui/motion-button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ModerationPayload, ModerationReason } from "@/lib/api/types";
import { MODERATION_REASONS, NOTE_MAX_LENGTH } from "@/lib/moderation";

/** Actions that need a reason, a note or a confirmation before they run. */
export type DialogAction = "reject" | "disqualify" | "reinstate";

interface ModerationDialogProps {
  action: DialogAction | null;
  /** More than one when rejecting in bulk. */
  count: number;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ModerationPayload) => void;
}

export function ModerationDialog({
  action,
  onOpenChange,
  ...props
}: ModerationDialogProps) {
  return (
    <ResponsiveDialog
      open={action !== null}
      onOpenChange={onOpenChange}
      aria-describedby={undefined}
    >
      {action && (
        <ModerationForm
          action={action}
          onCancel={() => onOpenChange(false)}
          {...props}
        />
      )}
    </ResponsiveDialog>
  );
}

function ModerationForm({
  action,
  count,
  pending,
  error,
  onCancel,
  onSubmit,
}: Omit<ModerationDialogProps, "action" | "onOpenChange"> & {
  action: DialogAction;
  onCancel: () => void;
}) {
  const { t, format } = useI18n();
  const ids = useId();
  const copy = t.admin.moderation;
  const [reason, setReason] = useState<ModerationReason | "">("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const needsReason = action === "reject" || action === "disqualify";
  const needsNote = action !== "reject";
  // The employee sees the reason and the note on rejected and disqualified posts.
  const visibleToEmployee = needsReason;
  const reasonError = needsReason && !reason ? copy.reasonMissing : null;
  const noteError = needsNote && !note.trim() ? copy.noteMissing : null;

  const title = {
    reject:
      count > 1 ? format(copy.bulkRejectTitle, { count }) : copy.rejectTitle,
    disqualify: copy.disqualifyTitle,
    reinstate: copy.reinstateTitle,
  }[action];
  const submitLabel = {
    reject: t.admin.actions.reject,
    disqualify: copy.continue,
    reinstate: t.admin.actions.reinstate,
  }[action];

  const payload = (): ModerationPayload => ({
    ...(reason ? { reason } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (reasonError || noteError || pending) return;
    if (action === "disqualify" && !confirming) return setConfirming(true);
    onSubmit(payload());
  };

  if (confirming) {
    return (
      <div className="px-5 pt-2 pb-6 md:px-7 md:pt-7">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/12 text-danger-text"
          >
            <TriangleAlert className="size-5" />
          </span>
          <div>
            <ResponsiveDialogTitle>{copy.confirmTitle}</ResponsiveDialogTitle>
          </div>
        </div>
        {error && <FormError message={error} />}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <MotionButton
            variant="secondary"
            onClick={() => setConfirming(false)}
          >
            {t.common.back}
          </MotionButton>
          <MotionButton
            variant="danger"
            loading={pending}
            onClick={() => onSubmit(payload())}
            autoFocus
          >
            {copy.confirm}
          </MotionButton>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <div className="flex items-start gap-3 px-5 pt-2 pb-4 md:px-7 md:pt-7">
        <div className="min-w-0 flex-1">
          <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
        </div>
        <ResponsiveDialogClose label={t.common.close} className="-mt-1 -mr-2" />
      </div>

      <div className="flex flex-col gap-5 px-5 pb-6 md:px-7 md:pb-7">
        {needsReason && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{copy.reason}</legend>
            <ChipGroup<ModerationReason | "">
              label={copy.reason}
              value={reason}
              onValueChange={setReason}
              options={MODERATION_REASONS.map((value) => ({
                value,
                label: t.admin.reasonLabels[value],
              }))}
              className="flex-wrap [&>button]:h-9 [&>button]:px-3.5"
            />
            {submitted && reasonError && (
              <p role="alert" className="mt-2 text-sm text-danger-text">
                {reasonError}
              </p>
            )}
            {reason && (
              <p className="mt-2 text-xs text-muted-foreground">
                “{t.reasons[reason]}”
              </p>
            )}
          </fieldset>
        )}

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <Label htmlFor={`${ids}-note`}>
              {copy.note}{" "}
              <span className="font-normal text-muted-foreground">
                ({needsNote ? copy.noteRequired : t.submit.optional})
              </span>
            </Label>
            {visibleToEmployee && (
              <span className="text-xs font-medium text-warning-text">
                {copy.noteVisible}
              </span>
            )}
          </div>
          <Textarea
            id={`${ids}-note`}
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            aria-invalid={(submitted && Boolean(noteError)) || undefined}
            aria-describedby={
              submitted && noteError ? `${ids}-note-error` : undefined
            }
          />
          {submitted && noteError && (
            <p
              id={`${ids}-note-error`}
              role="alert"
              className="mt-2 text-sm text-danger-text"
            >
              {noteError}
            </p>
          )}
        </div>

        {error && <FormError message={error} />}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <MotionButton variant="secondary" onClick={onCancel}>
            {t.common.cancel}
          </MotionButton>
          <MotionButton
            type="submit"
            variant={needsReason ? "danger" : "primary"}
            loading={pending}
          >
            {submitLabel}
          </MotionButton>
        </div>
      </div>
    </form>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger-text"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
