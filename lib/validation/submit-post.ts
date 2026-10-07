import { z } from "zod";
import { analyzePostUrl } from "@/lib/platforms";

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
  "unsupportedContent",
  "duplicate",
  "titleTooLong",
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

export interface SubmitPostSchemaOptions {
  /** Receives the normalized URL. Return true if it was already submitted. */
  isDuplicate?: (normalizedUrl: string) => boolean;
}

export function createSubmitPostSchema({
  isDuplicate = () => false,
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
          case "unsupported-content":
            return fail("unsupportedContent");
          case "valid":
            if (isDuplicate(result.normalizedUrl)) fail("duplicate");
        }
      }),
    title: z.string().trim().max(TITLE_MAX_LENGTH, "titleTooLong"),
  });
}

export type SubmitPostFormValues = z.input<
  ReturnType<typeof createSubmitPostSchema>
>;
