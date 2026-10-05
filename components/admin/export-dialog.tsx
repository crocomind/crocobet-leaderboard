"use client";

import { Download } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MotionButton } from "@/components/ui/motion-button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useExportStandingsMutation } from "@/lib/api/queries";
import type { ContentCategory, ExportQuery } from "@/lib/api/types";
import { standingsFilename } from "@/lib/standings-csv";
import {
  fromLocalDateTimeInput,
  toIsoDate,
  toLocalDateTimeInput,
} from "@/lib/utils";

/** CSV standings for any week or month, as they stood at a chosen time. */
export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      {open && <ExportForm onDone={() => onOpenChange(false)} />}
    </ResponsiveDialog>
  );
}

function ExportForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const ids = useId();
  const copy = t.admin.export;
  const [category, setCategory] = useState<ContentCategory>("video");
  const [period, setPeriod] = useState<ExportQuery["period"]>("week");
  const [day, setDay] = useState(() => toIsoDate(new Date()));
  const [asOf, setAsOf] = useState(() => toLocalDateTimeInput(new Date()));
  const exportStandings = useExportStandingsMutation();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query: ExportQuery = {
      category,
      period,
      ...(period !== "all" && day ? { periodStart: day } : {}),
      ...(fromLocalDateTimeInput(asOf)
        ? { asOf: fromLocalDateTimeInput(asOf)! }
        : {}),
    };
    exportStandings.mutate(query, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = standingsFilename(
          category,
          period,
          period === "all" ? toIsoDate(new Date()) : day,
        );
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
        onDone();
      },
    });
  };

  return (
    <form noValidate onSubmit={handleSubmit}>
      <div className="flex items-start gap-3 px-5 pt-2 pb-4 md:px-7 md:pt-7">
        <div className="min-w-0 flex-1">
          <ResponsiveDialogTitle>{copy.title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="mt-1">
            {copy.description}
          </ResponsiveDialogDescription>
        </div>
        <ResponsiveDialogClose label={t.common.close} className="-mt-1 -mr-2" />
      </div>

      <div className="flex flex-col gap-5 px-5 pb-6 md:px-7 md:pb-7">
        <div>
          <p className="mb-2 text-sm font-medium" aria-hidden="true">
            {copy.category}
          </p>
          <SegmentedControl
            label={copy.category}
            value={category}
            onValueChange={setCategory}
            options={[
              { value: "video", label: t.categories.video },
              { value: "static", label: t.categories.static },
            ]}
            className="w-full"
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium" aria-hidden="true">
            {copy.period}
          </p>
          <SegmentedControl
            label={copy.period}
            value={period}
            onValueChange={setPeriod}
            options={[
              { value: "week", label: copy.week },
              { value: "month", label: copy.month },
              { value: "all", label: copy.all },
            ]}
            className="w-full"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {period !== "all" && (
            <div>
              <Label htmlFor={`${ids}-day`} className="mb-2 block">
                {copy.periodDate}
              </Label>
              <Input
                id={`${ids}-day`}
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
            </div>
          )}
          <div className={period === "all" ? "sm:col-span-2" : ""}>
            <Label htmlFor={`${ids}-as-of`} className="mb-2 block">
              {copy.asOf}
            </Label>
            <Input
              id={`${ids}-as-of`}
              type="datetime-local"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
            />
          </div>
        </div>

        {exportStandings.isError && (
          <p role="alert" className="text-sm text-danger-text">
            {copy.error}
          </p>
        )}

        <MotionButton
          type="submit"
          size="lg"
          className="w-full"
          loading={exportStandings.isPending}
        >
          <Download aria-hidden="true" />
          {copy.download}
        </MotionButton>
      </div>
    </form>
  );
}
