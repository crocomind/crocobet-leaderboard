import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Georgian } from "next/font/google";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/i18n/config";
import "./globals.css";

// Inter covers Latin; Georgian characters fall through to Noto Sans Georgian.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansGeorgian = Noto_Sans_Georgian({
  subsets: ["georgian"],
  variable: "--font-georgian",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Croco Creators",
  description: "The video creators leaderboard for the Crocobet team.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Rendering in the saved language avoids a flash of English for Georgian users.
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerList.get("accept-language"),
  );

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${notoSansGeorgian.variable}`}
      suppressHydrationWarning
    >
      <body>
        <AppProviders locale={locale}>{children}</AppProviders>
      </body>
    </html>
  );
}
