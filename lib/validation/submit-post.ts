import { z } from "zod";
import { analyzePostUrl } from "@/lib/platforms";
import { toIsoDate } from "@/lib/utils";

export const TITLE_MAX_LENGTH = 120;

/**
 * Validation errors are stable codes, not sentences. The UI translates them
 * (see `validation` in lib/i18n/dictionaries.ts), so a language switch
 * re-translates errors already on screen.
 */
export const SUBMIT_POST_ERROR_CODES = [
  "required",
  "invalidUrl",
  "unsupportedPlatform",
  "notAPost",
  "duplicate",
  "titleTooLong",
  "dateInvalid",
  "dateInFuture",
] as const;

export type SubmitPostErrorCode = (typeof SUBMIT_POST_ERROR_CODES)[number];

export function isSubmitPostErrorCode(
  value: unknown,
): value is SubmitPostErrorCode {
  return (
    typeof value === "string" &&
    (SUBMIT_POST_ERROR_CODES as readonly string[]).includes(value)
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

export interface SubmitPostSchemaOptions {
  /** Receives the normalized URL. Return true if it was already submitted. */
  isDuplicate?: (normalizedUrl: string) => boolean;
  /** Today's date as YYYY-MM-DD. Injectable for tests. */
  today?: () => string;
}

export function createSubmitPostSchema({
  isDuplicate = () => false,
  today = () => toIsoDate(new Date()),
}: SubmitPostSchemaOptions = {}) {
  return z.object({
    url: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const fail = (message: SubmitPostErrorCode) =>
          ctx.addIssue({ code: "custom", message });

        const result = analyzePostUrl(value);
        switch (result.status) {
          case "empty":
            return fail("required");
          case "invalid-url":
            return fail("invalidUrl");
          case "unsupported-platform":
            return fail("unsupportedPlatform");
          case "not-a-post":
            return fail("notAPost");
          case "valid":
            if (isDuplicate(result.normalizedUrl)) fail("duplicate");
        }
      }),
    title: z.string().trim().max(TITLE_MAX_LENGTH, "titleTooLong"),
    postedAt: z
      .string()
      .trim()
      .refine((value) => value === "" || isRealIsoDate(value), "dateInvalid")
      .refine((value) => value === "" || value <= today(), "dateInFuture"),
  });
}

export type SubmitPostFormValues = z.input<
  ReturnType<typeof createSubmitPostSchema>
>;
