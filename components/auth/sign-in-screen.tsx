"use client";

import { CircleAlert, CircleCheck, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { GlowBackdrop } from "@/components/common/glow-backdrop";
import { MicrosoftLogo } from "@/components/icons/microsoft-logo";
import { Logo } from "@/components/layout/logo";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import { signInWithMicrosoft } from "@/lib/auth/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { DURATION, REDUCED_FADE, springGentle, tween } from "@/lib/motion";

type AuthErrors = Dictionary["auth"]["errors"];

/** Maps Better Auth / Microsoft / our own error codes to a message. */
function errorMessageKey(code: string): keyof AuthErrors {
  switch (code) {
    case "domain_not_allowed":
      return "domainNotAllowed";
    case "wrong_tenant":
      return "wrongTenant";
    case "access_denied":
    case "consent_required":
      return "cancelled";
    case "state_not_found":
    case "state_mismatch":
    case "state_invalid":
    case "state_security_mismatch":
    case "invalid_code":
    case "no_code":
      return "expired";
    case "auth_not_configured":
      return "notConfigured";
    default:
      return "generic";
  }
}

interface SignInScreenProps {
  returnTo: string;
  error: string | null;
  signedOut: boolean;
  allowedDomains: string[];
  /** Missing env variable names (only passed in development). */
  missingConfig: string[];
  configured: boolean;
}

export function SignInScreen({
  returnTo,
  error: initialError,
  signedOut,
  allowedDomains,
  missingConfig,
  configured,
}: SignInScreenProps) {
  const { t, format, formatList } = useI18n();
  const reduceMotion = useReducedMotion() ?? false;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    configured ? initialError : "auth_not_configured",
  );

  const domains = formatList(
    allowedDomains.map((domain) => `@${domain}`),
    "or",
  );
  const errorText = error
    ? format(t.auth.errors[errorMessageKey(error)], { domains })
    : null;

  const signIn = async () => {
    setPending(true);
    setError(null);
    // On success the browser leaves for Microsoft, so pending stays on.
    const result = await signInWithMicrosoft(returnTo).catch(() => null);
    if (!result || result.error) {
      setPending(false);
      setError(
        result?.error?.status === 503 ? "auth_not_configured" : "generic",
      );
    }
  };

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      <GlowBackdrop className="top-1/2 -translate-y-1/2" />

      <motion.div
        className="w-full max-w-md"
        initial={
          reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduceMotion ? REDUCED_FADE : springGentle}
      >
        <div className="rounded-panel border border-border bg-elevated/85 p-7 shadow-lifted backdrop-blur-2xl sm:p-9">
          <Logo label={t.app.name} />

          <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">
            {t.auth.title}
          </h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            {t.auth.subtitle}
          </p>

          {errorText && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0, transition: tween(DURATION.base) }}
              className="mt-6 flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger-text"
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                {errorText}
                {missingConfig.length > 0 && (
                  <span className="mt-1 block font-mono text-xs opacity-80">
                    {format(t.auth.missingConfig, {
                      names: missingConfig.join(", "),
                    })}
                  </span>
                )}
              </span>
            </motion.p>
          )}
          {signedOut && !errorText && (
            <p
              role="status"
              className="mt-6 flex items-center gap-2 rounded-control border border-brand/25 bg-brand/10 p-3.5 text-sm text-brand-text"
            >
              <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
              {t.auth.signedOut}
            </p>
          )}

          <MotionButton
            variant="secondary"
            size="lg"
            className="mt-8 w-full"
            onClick={() => void signIn()}
            loading={pending}
            loadingLabel={t.auth.redirecting}
            disabled={!configured}
          >
            <MicrosoftLogo className="size-5" />
            {t.auth.signInWithMicrosoft}
          </MotionButton>

          <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck
              className="size-4 shrink-0 text-brand-text"
              aria-hidden="true"
            />
            {format(t.auth.onlyEmployees, { domains })}
          </p>
        </div>
      </motion.div>
    </main>
  );
}
