import { createContext, useCallback, useContext, useMemo } from "react";
import { useMatches } from "react-router";

import type { TextKey } from "./catalog";
import { globalTexts } from "./catalog/global";
import { interpolate } from "./text";
import type { SiteTexts, TextVariables } from "./types";

const SiteTextContext = createContext<SiteTexts | null>(null);

type MatchLike = { loaderData?: unknown } | undefined;

/** Merges `siteTexts` from every matched loader, deeper routes winning. */
export function mergeSiteTexts(matches: readonly MatchLike[]): SiteTexts {
  let merged: Record<string, string> = {};
  for (const match of matches) {
    const data = match?.loaderData as { siteTexts?: SiteTexts } | undefined;
    if (data?.siteTexts) merged = { ...merged, ...data.siteTexts };
  }
  return merged;
}

/**
 * The error page can render without any loader data (the root loader is the
 * thing that failed), so the small global category always has its defaults.
 */
const GLOBAL_FALLBACKS: SiteTexts = Object.fromEntries(
  Object.entries(globalTexts.entries).map(([key, entry]) => [
    `global.${key}`,
    entry.default,
  ]),
);

function resolve(
  texts: SiteTexts | null,
  key: TextKey,
  variables?: TextVariables,
): string {
  const value = texts?.[key] ?? GLOBAL_FALLBACKS[key];
  if (value === undefined) {
    if (import.meta.env.DEV) {
      console.error(
        `Site text "${key}" was not loaded. Is its category loaded by this page?`,
      );
    }
    return key;
  }
  return interpolate(value, variables);
}

export function SiteTextProvider({
  texts,
  children,
}: {
  texts: SiteTexts;
  children: React.ReactNode;
}) {
  return (
    <SiteTextContext.Provider value={texts}>
      {children}
    </SiteTextContext.Provider>
  );
}

/** Provides the texts every matched route loaded; used once, in root. */
export function MatchedSiteTextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const matches = useMatches();
  const texts = useMemo(() => mergeSiteTexts(matches), [matches]);
  return <SiteTextProvider texts={texts}>{children}</SiteTextProvider>;
}

export type TextFunction = (key: TextKey, variables?: TextVariables) => string;

/** `t("dinners.title")`, or `t("dinner.seatsLeft", { count: 3 })`. */
export function useText(): TextFunction {
  const texts = useContext(SiteTextContext);
  return useCallback(
    (key: TextKey, variables?: TextVariables) => resolve(texts, key, variables),
    [texts],
  );
}

/** The same lookup for `meta` functions, which can't use hooks. */
export function metaText(
  matches: readonly MatchLike[],
  key: TextKey,
  variables?: TextVariables,
): string {
  return resolve(mergeSiteTexts(matches), key, variables);
}
