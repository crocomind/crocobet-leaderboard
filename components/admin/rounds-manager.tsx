"use client";

import { CalendarRange, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useRoundLabel } from "@/components/leaderboard/use-round-label";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MotionButton } from "@/components/ui/motion-button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api/errors";
import {
  useCreateRoundMutation,
  useDeleteRoundMutation,
  useGenerateRoundsMutation,
  useRoundsQuery,
  useUpdateChallengeMutation,
  useUpdateRoundMutation,
} from "@/lib/api/queries";
import type {
  ChallengeWindow,
  Round,
  RoundKind,
  RoundsResponse,
} from "@/lib/api/types";
import { useNow } from "@/lib/hooks/use-now";
import { addDays } from "@/lib/rounds";
import { cn } from "@/lib/utils";

type OnMessage = (text: string, tone?: "success" | "error") => void;

/** Turns an API error into the admin's message. */
function useErrorText() {
  const { t } = useI18n();
  const errors = t.admin.leaderboards.errors;
  return (error: unknown) =>
    isApiError(error) && error.code in errors
      ? errors[error.code as keyof typeof errors]
      : errors.generic;
}

/** Challenge dates and the weekly and monthly rounds admins define. */
export function RoundsManager({ onMessage }: { onMessage: OnMessage }) {
  const rounds = useRoundsQuery();
  const [dialog, setDialog] = useState<{
    kind: RoundKind;
    round: Round | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<Round | null>(null);
  const remove = useDeleteRoundMutation();
  const { t } = useI18n();
  const errorText = useErrorText();

  if (!rounds.data)
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <ChallengeCard challenge={rounds.data.challenge} onMessage={onMessage} />
      <div className="grid gap-5 lg:grid-cols-2">
        {(["week", "month"] as const).map((kind) => (
          <RoundList
            key={kind}
            kind={kind}
            data={rounds.data}
            onAdd={() => setDialog({ kind, round: null })}
            onEdit={(round) => setDialog({ kind, round })}
            onDelete={setDeleting}
            onMessage={onMessage}
          />
        ))}
      </div>

      <RoundDialog
        state={dialog}
        data={rounds.data}
        onClose={() => setDialog(null)}
        onMessage={onMessage}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t.admin.leaderboards.deleteTitle}
        confirmLabel={t.admin.leaderboards.deleteConfirm}
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              onMessage(t.admin.leaderboards.deleted);
            },
            onError: (error) => onMessage(errorText(error), "error"),
          })
        }
      />
    </div>
  );
}

function Card({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface/80 p-4 shadow-soft backdrop-blur sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold [&_svg]:size-4 [&_svg]:text-brand-text">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChallengeCard({
  challenge,
  onMessage,
}: {
  challenge: ChallengeWindow;
  onMessage: OnMessage;
}) {
  const { t, formatDateRange } = useI18n();
  const copy = t.admin.leaderboards;
  const ids = useId();
  const update = useUpdateChallengeMutation();
  const errorText = useErrorText();
  const [editing, setEditing] = useState(false);
  const [startDate, setStartDate] = useState(challenge.startDate);
  const [endDate, setEndDate] = useState(challenge.endDate);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate(
      { startDate, endDate },
      {
        onSuccess: () => {
          setEditing(false);
          onMessage(copy.saved);
        },
      },
    );
  };

  return (
    <Card
      title={copy.challenge}
      icon={<CalendarRange />}
      action={
        !editing && (
          <MotionButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setStartDate(challenge.startDate);
              setEndDate(challenge.endDate);
              update.reset();
              setEditing(true);
            }}
          >
            <Pencil aria-hidden="true" />
            {copy.editDates}
          </MotionButton>
        )
      }
    >
      {editing ? (
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${ids}-start`} className="mb-1.5 block">
                {copy.firstDay}
              </Label>
              <Input
                id={`${ids}-start`}
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-10"
              />
            </div>
            <div>
              <Label htmlFor={`${ids}-end`} className="mb-1.5 block">
                {copy.lastDay}
              </Label>
              <Input
                id={`${ids}-end`}
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-10"
              />
            </div>
          </div>
          {update.isError && (
            <p role="alert" className="text-sm text-danger-text">
              {errorText(update.error)}
            </p>
          )}
          <div className="flex gap-2">
            <MotionButton type="submit" size="sm" loading={update.isPending}>
              {copy.save}
            </MotionButton>
            <MotionButton
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
            >
              {t.common.cancel}
            </MotionButton>
          </div>
        </form>
      ) : (
        <div>
          <p className="text-lg font-bold">
            {formatDateRange(
              challenge.startsAt,
              challenge.endsAt,
              challenge.timeZone,
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={challenge.source === "admin" ? "brand" : "neutral"}>
              {challenge.source === "admin"
                ? copy.sourceAdmin
                : copy.sourceDefault}
            </Badge>
          </p>
        </div>
      )}
    </Card>
  );
}

function RoundList({
  kind,
  data,
  onAdd,
  onEdit,
  onDelete,
  onMessage,
}: {
  kind: RoundKind;
  data: RoundsResponse;
  onAdd: () => void;
  onEdit: (round: Round) => void;
  onDelete: (round: Round) => void;
  onMessage: OnMessage;
}) {
  const { t, formatDateRange } = useI18n();
  const copy = t.admin.leaderboards;
  const roundLabel = useRoundLabel();
  const now = useNow();
  const generate = useGenerateRoundsMutation();
  const errorText = useErrorText();
  const { timeZone } = data.challenge;
  const rounds = data.rounds.filter((round) => round.kind === kind);

  return (
    <Card
      title={kind === "week" ? copy.weeklyTitle : copy.monthlyTitle}
      icon={<CalendarRange />}
      action={
        <MotionButton variant="secondary" size="sm" onClick={onAdd}>
          <Plus aria-hidden="true" />
          {copy.add}
        </MotionButton>
      }
    >
      {rounds.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            {kind === "week" ? copy.weeklyEmpty : copy.monthlyEmpty}
          </p>
          <MotionButton
            size="sm"
            loading={generate.isPending}
            onClick={() =>
              generate.mutate(kind, {
                onSuccess: () => onMessage(copy.generated),
                onError: (error) => onMessage(errorText(error), "error"),
              })
            }
          >
            <Sparkles aria-hidden="true" />
            {kind === "week" ? copy.generateWeeks : copy.generateMonths}
          </MotionButton>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rounds.map((round) => {
            const status =
              now > 0 && now < Date.parse(round.startsAt)
                ? "upcoming"
                : now >= Date.parse(round.endsAt)
                  ? "finished"
                  : "current";
            const label = roundLabel(round, round.startsAt, timeZone);
            return (
              <li key={round.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2 font-medium">
                    <span className="truncate">{label}</span>
                    <Badge
                      variant={status === "current" ? "brand" : "neutral"}
                      className={cn(
                        "px-2",
                        status === "finished" && "opacity-70",
                      )}
                    >
                      {copy.status[status]}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateRange(round.startsAt, round.endsAt, timeZone)}
                  </p>
                </div>
                <MotionButton
                  variant="icon"
                  size="icon-sm"
                  aria-label={`${copy.edit}: ${label}`}
                  onClick={() => onEdit(round)}
                >
                  <Pencil aria-hidden="true" />
                </MotionButton>
                <MotionButton
                  variant="icon"
                  size="icon-sm"
                  aria-label={`${copy.delete}: ${label}`}
                  onClick={() => onDelete(round)}
                  className="text-danger-text"
                >
                  <Trash2 aria-hidden="true" />
                </MotionButton>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The next free dates for a new round: right after the last one, or at the challenge start. */
function suggestedDates(kind: RoundKind, data: RoundsResponse) {
  const last = data.rounds.filter((round) => round.kind === kind).at(-1);
  const startDate = last ? addDays(last.endDate, 1) : data.challenge.startDate;
  if (kind === "week") return { startDate, endDate: addDays(startDate, 6) };
  const [year, month] = startDate.split("-").map(Number);
  const lastOfMonth = new Date(Date.UTC(year!, month!, 0))
    .toISOString()
    .slice(0, 10);
  return {
    startDate,
    endDate:
      lastOfMonth < data.challenge.endDate
        ? lastOfMonth
        : data.challenge.endDate,
  };
}

function RoundDialog({
  state,
  data,
  onClose,
  onMessage,
}: {
  state: { kind: RoundKind; round: Round | null } | null;
  data: RoundsResponse;
  onClose: () => void;
  onMessage: OnMessage;
}) {
  return (
    <ResponsiveDialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-describedby={undefined}
    >
      {state && (
        <RoundForm
          kind={state.kind}
          round={state.round}
          data={data}
          onDone={onClose}
          onMessage={onMessage}
        />
      )}
    </ResponsiveDialog>
  );
}

function RoundForm({
  kind,
  round,
  data,
  onDone,
  onMessage,
}: {
  kind: RoundKind;
  round: Round | null;
  data: RoundsResponse;
  onDone: () => void;
  onMessage: OnMessage;
}) {
  const { t, format } = useI18n();
  const copy = t.admin.leaderboards;
  const ids = useId();
  const roundLabel = useRoundLabel();
  const create = useCreateRoundMutation();
  const update = useUpdateRoundMutation();
  const errorText = useErrorText();
  const initial = round ?? suggestedDates(kind, data);
  const [name, setName] = useState(round?.name ?? "");
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const mutation = round ? update : create;

  const automatic = roundLabel(
    {
      id: round?.id ?? "new",
      kind,
      name: null,
      number:
        round?.number ??
        data.rounds.filter((candidate) => candidate.kind === kind).length + 1,
    },
    `${startDate}T12:00:00Z`,
    data.challenge.timeZone,
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const done = {
      onSuccess: () => {
        onMessage(copy.saved);
        onDone();
      },
    };
    if (round)
      update.mutate(
        {
          roundId: round.id,
          patch: { name: name.trim() || null, startDate, endDate },
        },
        done,
      );
    else
      create.mutate(
        { kind, name: name.trim() || null, startDate, endDate },
        done,
      );
  };

  return (
    <form noValidate onSubmit={submit}>
      <div className="flex items-start gap-3 px-5 pt-2 pb-4 md:px-7 md:pt-7">
        <div className="min-w-0 flex-1">
          <ResponsiveDialogTitle>
            {round
              ? copy.editTitle
              : kind === "week"
                ? copy.addWeekTitle
                : copy.addMonthTitle}
          </ResponsiveDialogTitle>
        </div>
        <ResponsiveDialogClose label={t.common.close} className="-mt-1 -mr-2" />
      </div>
      <div className="flex flex-col gap-4 px-5 pb-6 md:px-7 md:pb-7">
        <div>
          <Label htmlFor={`${ids}-name`} className="mb-1.5 block">
            {copy.name}
          </Label>
          <Input
            id={`${ids}-name`}
            value={name}
            maxLength={60}
            placeholder={format(copy.namePlaceholder, { label: automatic })}
            onChange={(event) => setName(event.target.value)}
            className="h-10"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${ids}-start`} className="mb-1.5 block">
              {copy.firstDay}
            </Label>
            <Input
              id={`${ids}-start`}
              type="date"
              value={startDate}
              min={data.challenge.startDate}
              max={data.challenge.endDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-10"
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-end`} className="mb-1.5 block">
              {copy.lastDay}
            </Label>
            <Input
              id={`${ids}-end`}
              type="date"
              value={endDate}
              min={startDate}
              max={data.challenge.endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-10"
            />
          </div>
        </div>
        {mutation.isError && (
          <p role="alert" className="text-sm text-danger-text">
            {errorText(mutation.error)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <MotionButton variant="secondary" onClick={onDone}>
            {t.common.cancel}
          </MotionButton>
          <MotionButton type="submit" loading={mutation.isPending}>
            {copy.save}
          </MotionButton>
        </div>
      </div>
    </form>
  );
}
