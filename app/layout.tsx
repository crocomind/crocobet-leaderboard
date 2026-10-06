import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Georgian } from "next/font/google";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import { getSessionUser } from "@/lib/auth/session";
import "./globals.css";

// Inter covers the UI. Georgian characters in what employees write (post
// titles and captions) fall through to Noto Sans Georgian, which only
// downloads when such text is on screen.
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
  description: "The post creators leaderboard for the Crocobet team.",
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
  const sessionUser = await getSessionUser();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${notoSansGeorgian.variable}`}
      suppressHydrationWarning
    >
      <body>
        <AppProviders sessionUser={sessionUser}>{children}</AppProviders>
      </body>
    </html>
  );
}
