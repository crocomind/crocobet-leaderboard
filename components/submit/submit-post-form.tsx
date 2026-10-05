"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CircleAlert,
  Lock,
  RefreshCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useI18n } from "@/components/providers/i18n-provider";
import { PostPreviewCard } from "@/components/submit/post-preview-card";
import { PostUrlField } from "@/components/submit/post-url-field";
import { MotionButton } from "@/components/ui/motion-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isApiError } from "@/lib/api/errors";
import { useMyPostsQuery, useSubmitPostMutation } from "@/lib/api/queries";
import type { SubmitPostPayload, Post } from "@/lib/api/types";
import { analyzePostUrl, PLATFORM_LIST, PLATFORMS } from "@/lib/platforms";
import { DURATION, exitTween, tween } from "@/lib/motion";
import { cn, toIsoDate } from "@/lib/utils";
import {
  createSubmitPostSchema,
  isSubmitPostErrorCode,
  type SubmitPostErrorCode,
  type SubmitPostFormValues,
  TITLE_MAX_LENGTH,
} from "@/lib/validation/submit-post";

/** Server errors shown under the link field; the rest are form-level. */
const FIELD_ERRORS: Partial<Record<string, SubmitPostErrorCode>> = {
  duplicate_post: "duplicate",
  invalid_url: "notAPost",
  unsupported_platform: "unsupportedPlatform",
  unsupported_content: "unsupportedContent",
};

/** Height opens smoothly, then the content fades in; the exit is quicker. */
const reveal = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: "auto",
    opacity: 1,
    transition: {
      height: tween(DURATION.slow),
      opacity: { ...tween(DURATION.base), delay: 0.08 },
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: exitTween(DURATION.slow),
      opacity: exitTween(DURATION.fast),
    },
  },
};

/** Messages under a field crossfade (and drift a few px) as they change. */
const message = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: tween(DURATION.base) },
  exit: { opacity: 0, transition: exitTween(DURATION.fast) },
};

/** The label floats up a touch and tints green while its field has focus. */
const floatingLabel =
  "transition-[translate,color] duration-(--dur-base) ease-(--ease-out-soft) group-focus-within/field:text-brand-text motion-safe:group-focus-within/field:-translate-y-0.5";

interface SubmitPostFormProps {
  onSubmitted: (post: Post) => void;
  /** Focus the link field on mount (desktop, or after "Submit another"). */
  autoFocus: boolean;
}

export function SubmitPostForm({
  onSubmitted,
  autoFocus,
}: SubmitPostFormProps) {
  const { t, format, formatList } = useI18n();
  const ids = useId();
  const urlId = `${ids}-url`;
  const urlHintId = `${ids}-url-hint`;
  const urlErrorId = `${ids}-url-error`;

  // Already-submitted links power the instant duplicate check; the server re-checks.
  const myPosts = useMyPostsQuery();
  const submittedUrls = useMemo(
    () => new Set(myPosts.data?.posts.map((post) => post.url)),
    [myPosts.data],
  );
  const schema = useMemo(
    () =>
      createSubmitPostSchema({ isDuplicate: (url) => submittedUrls.has(url) }),
    [submittedUrls],
  );

  const form = useForm<SubmitPostFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { url: "", title: "", postedAt: "" },
  });
  const { errors } = form.formState;
  const [url = "", title = "", postedAt = ""] = useWatch({
    control: form.control,
    name: ["url", "title", "postedAt"],
  });

  useEffect(() => {
    if (autoFocus) form.setFocus("url");
  }, [autoFocus, form]);

  const analysis = useMemo(() => analyzePostUrl(url), [url]);
  const platform =
    analysis.status === "valid" ||
    analysis.status === "not-a-post" ||
    analysis.status === "unsupported-content"
      ? analysis.platform
      : null;
  const urlValid = analysis.status === "valid" && !errors.url;
  const contentType = urlValid ? analysis.contentType : null;

  const mutation = useSubmitPostMutation();
  const serverCode = isApiError(mutation.error) ? mutation.error.code : null;
  const closed = serverCode === "challenge_closed";
  const serverFailed =
    mutation.isError && !closed && !(serverCode && FIELD_ERRORS[serverCode]);

  const platformNames = PLATFORM_LIST.map((definition) => definition.name);
  const messageFor = (code: string | undefined): string | undefined => {
    if (!code) return undefined;
    if (!isSubmitPostErrorCode(code)) return code;
    const messages: Record<SubmitPostErrorCode, string> = {
      ...t.validation,
      unsupportedPlatform: format(t.validation.unsupportedPlatform, {
        platforms: formatList(platformNames, "and"),
      }),
      notAPost: format(t.validation.notAPost, {
        platform: platform ? PLATFORMS[platform].name : "",
      }),
      titleTooLong: format(t.validation.titleTooLong, {
        max: TITLE_MAX_LENGTH,
      }),
    };
    return messages[code];
  };
  const urlError = messageFor(errors.url?.message);
  const titleError = messageFor(errors.title?.message);
  const postedAtError = messageFor(errors.postedAt?.message);

  const onSubmit = form.handleSubmit((values) => {
    if (mutation.isPending) return;
    const result = analyzePostUrl(values.url);
    if (result.status !== "valid") return;

    // The server derives the platform and content type itself.
    const payload: SubmitPostPayload = {
      url: result.normalizedUrl,
      ...(values.title ? { title: values.title } : {}),
      ...(values.postedAt ? { postedAt: values.postedAt } : {}),
    };

    mutation.mutate(payload, {
      onSuccess: onSubmitted,
      onError: (error) => {
        const code = isApiError(error) ? FIELD_ERRORS[error.code] : undefined;
        if (!code) return;
        form.setError(
          "url",
          { type: "server", message: code },
          { shouldFocus: true },
        );
      },
    });
  });

  // Validate right away on paste instead of waiting for blur.
  const validateUrlNow = () =>
    setTimeout(() => {
      form.setValue("url", form.getValues("url"), {
        shouldTouch: true,
        shouldValidate: true,
      });
    }, 0);

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="group/field">
        <Label htmlFor={urlId} className={cn("mb-2 block", floatingLabel)}>
          {t.submit.urlLabel}
        </Label>
        <PostUrlField
          id={urlId}
          registration={form.register("url")}
          platform={platform}
          contentType={contentType}
          valid={urlValid}
          invalid={Boolean(urlError)}
          describedBy={urlError ? urlErrorId : urlHintId}
          onPasteText={(text) => {
            form.setValue("url", text, {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            });
            form.setFocus("url");
          }}
          onNativePaste={validateUrlNow}
        />
        <div className="mt-2 min-h-5">
          <AnimatePresence mode="wait" initial={false}>
            {urlError ? (
              <motion.p
                key="error"
                id={urlErrorId}
                role="alert"
                {...message}
                className="flex items-start gap-1.5 text-sm text-danger-text"
              >
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {urlError}
              </motion.p>
            ) : (
              <motion.p
                key="hint"
                id={urlHintId}
                {...message}
                className="text-sm text-muted-foreground"
              >
                {format(t.submit.supported, {
                  platforms: formatList(platformNames, "and"),
                })}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {analysis.status === "valid" && !errors.url && (
          <motion.div
            key="preview"
            className="-mt-1 overflow-hidden"
            {...reveal}
          >
            <div className="pt-1">
              <PostPreviewCard
                platform={analysis.platform}
                contentType={analysis.contentType}
                url={analysis.normalizedUrl}
                title={title.trim()}
                postedAt={postedAt}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="group/field">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <Label htmlFor={`${ids}-title`} className={floatingLabel}>
              {t.submit.titleLabel}{" "}
              <span className="font-normal text-muted-foreground">
                ({t.submit.optional})
              </span>
            </Label>
            <span
              className="text-xs text-muted-foreground tabular-nums"
              aria-hidden="true"
            >
              {format(t.submit.characterCount, {
                count: title.length,
                max: TITLE_MAX_LENGTH,
              })}
            </span>
          </div>
          <Input
            id={`${ids}-title`}
            placeholder={t.submit.titlePlaceholder}
            maxLength={TITLE_MAX_LENGTH}
            enterKeyHint="go"
            aria-invalid={Boolean(titleError) || undefined}
            aria-describedby={titleError ? `${ids}-title-error` : undefined}
            {...form.register("title")}
          />
          <AnimatePresence initial={false}>
            {titleError && (
              <motion.p
                key="title-error"
                {...message}
                id={`${ids}-title-error`}
                role="alert"
                className="mt-1.5 text-sm text-danger-text"
              >
                {titleError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="group/field">
          <Label
            htmlFor={`${ids}-posted`}
            className={cn("mb-2 block", floatingLabel)}
          >
            {t.submit.postedAtLabel}{" "}
            <span className="font-normal text-muted-foreground">
              ({t.submit.optional})
            </span>
          </Label>
          <Input
            id={`${ids}-posted`}
            type="date"
            max={toIsoDate(new Date())}
            aria-invalid={Boolean(postedAtError) || undefined}
            aria-describedby={
              postedAtError ? `${ids}-posted-error` : `${ids}-posted-hint`
            }
            {...form.register("postedAt")}
          />
          {!postedAtError && (
            <p
              id={`${ids}-posted-hint`}
              className="mt-1.5 text-xs text-muted-foreground"
            >
              {t.submit.postedAtHint}
            </p>
          )}
          <AnimatePresence initial={false}>
            {postedAtError && (
              <motion.p
                key="posted-error"
                {...message}
                id={`${ids}-posted-error`}
                role="alert"
                className="mt-1.5 text-sm text-danger-text"
              >
                {postedAtError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {closed && (
          <motion.div key="closed" className="overflow-hidden" {...reveal}>
            <div
              role="alert"
              className="flex items-start gap-3 rounded-control border border-warning/30 bg-warning/10 p-3.5"
            >
              <Lock
                className="mt-0.5 size-5 shrink-0 text-warning-text"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold">{t.submit.closedTitle}</p>
                <p className="text-sm text-muted-foreground">
                  {t.submit.closedDescription}
                </p>
              </div>
            </div>
          </motion.div>
        )}
        {serverFailed && (
          <motion.div
            key="server-error"
            className="overflow-hidden"
            {...reveal}
          >
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-control border border-danger/30 bg-danger/10 p-3.5 sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-start gap-3">
                <TriangleAlert
                  className="mt-0.5 size-5 shrink-0 text-danger-text"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold">{t.submit.errorTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.submit.errorDescription}
                  </p>
                </div>
              </div>
              <MotionButton
                variant="secondary"
                size="sm"
                onClick={() => void onSubmit()}
                className="self-start sm:self-auto"
              >
                <RefreshCw aria-hidden="true" />
                {t.common.retry}
              </MotionButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The label crossfades into a spinner while submitting. */}
      <MotionButton
        type="submit"
        size="lg"
        className="w-full"
        disabled={closed}
        loading={mutation.isPending}
        loadingLabel={t.submit.submitting}
      >
        <Send aria-hidden="true" />
        {t.submit.submit}
      </MotionButton>
    </form>
  );
}
