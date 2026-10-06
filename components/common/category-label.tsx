"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import type { ContentCategory } from "@/lib/platforms";

/** "Video content", shortened to "Video" on phones so two of them fit side by side. */
export function CategoryLabel({ category }: { category: ContentCategory }) {
  const { t } = useI18n();
  return (
    <>
      <span className="sm:hidden">{t.categories.short[category]}</span>
      <span className="hidden sm:inline">{t.categories[category]}</span>
    </>
  );
}
