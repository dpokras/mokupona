import type { ReactNode } from "react";

import {
  getDefaultTexts,
  TEXT_CATEGORY_IDS,
} from "~/features/site-content/catalog";
import { SiteTextProvider } from "~/features/site-content/site-text";

/** Every catalog default, for rendering components that call `useText()`. */
export const DEFAULT_SITE_TEXTS = getDefaultTexts(TEXT_CATEGORY_IDS);

export function SiteTextsWrapper({ children }: { children: ReactNode }) {
  return (
    <SiteTextProvider texts={DEFAULT_SITE_TEXTS}>{children}</SiteTextProvider>
  );
}
