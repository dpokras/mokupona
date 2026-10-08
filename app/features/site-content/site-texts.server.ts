import {
  getDefaultTexts,
  getTextEntry,
  TEXT_CATALOG,
  TEXT_CATEGORY_IDS,
  type TextCategoryId,
  type TextKey,
} from "./catalog";
import { interpolate, normalizeTextValue } from "./text";
import type { SiteTexts, TextEntry, TextVariables } from "./types";

import {
  listSiteTextOverrides,
  saveSiteTextOverrides,
} from "~/models/site-text.server";
import { singleton } from "~/utils/singleton.server";

/**
 * Overrides change only through the admin editor, which calls
 * `saveCategoryTexts` below, so one in-process copy stays current.
 */
const overrideCache = singleton("site-text-overrides", () => ({
  current: null as Promise<Map<string, string>> | null,
}));

function getOverrides(): Promise<Map<string, string>> {
  overrideCache.current ??= listSiteTextOverrides()
    .then((rows) => new Map(rows.map(({ key, value }) => [key, value])))
    .catch((error: unknown) => {
      overrideCache.current = null;
      throw error;
    });
  return overrideCache.current;
}

async function resolveCategories(
  categoryIds: readonly TextCategoryId[],
): Promise<SiteTexts> {
  const overrides = await getOverrides();
  const texts = getDefaultTexts(categoryIds);
  for (const key of Object.keys(texts)) {
    const override = overrides.get(key);
    if (override !== undefined) texts[key] = override;
  }
  return texts;
}

const ROOT_CATEGORY_IDS = TEXT_CATEGORY_IDS.filter(
  (id) => TEXT_CATALOG[id].scope === "root",
);

/** The texts every page can use; the root loader sends these. */
export function loadRootSiteTexts(): Promise<SiteTexts> {
  return resolveCategories(ROOT_CATEGORY_IDS);
}

/** A route-scoped category, for the one page that shows it. */
export function loadSiteTexts(
  ...categoryIds: TextCategoryId[]
): Promise<SiteTexts> {
  return resolveCategories(categoryIds);
}

/** A single text on the server, e.g. for an email. */
export async function getServerText(
  key: TextKey,
  variables?: TextVariables,
): Promise<string> {
  const entry = getTextEntry(key);
  if (!entry) throw new Error(`Unknown site text "${key}"`);
  const overrides = await getOverrides();
  return interpolate(overrides.get(key) ?? entry.default, variables);
}

export interface EditableText {
  key: string;
  entry: TextEntry;
  value: string;
  isCustomized: boolean;
}

export async function getEditableCategory(
  categoryId: TextCategoryId,
): Promise<EditableText[]> {
  const overrides = await getOverrides();
  const entries: Record<string, TextEntry> = TEXT_CATALOG[categoryId].entries;
  return Object.entries(entries).map(([key, entry]) => {
    const override = overrides.get(`${categoryId}.${key}`);
    return {
      key,
      entry,
      value: override ?? entry.default,
      isCustomized: override !== undefined,
    };
  });
}

export async function countCustomizedTexts(): Promise<
  Record<TextCategoryId, number>
> {
  const overrides = await getOverrides();
  const counts = Object.fromEntries(
    TEXT_CATEGORY_IDS.map((id) => [id, 0]),
  ) as Record<TextCategoryId, number>;
  for (const key of overrides.keys()) {
    const categoryId = key.slice(0, key.indexOf("."));
    if (getTextEntry(key) && categoryId in counts) {
      counts[categoryId as TextCategoryId] += 1;
    }
  }
  return counts;
}

/**
 * Stores a category's submitted values. A value equal to the code default
 * clears the override, so later changes to the default reach the site.
 * Values must already be validated with `findTextProblem`.
 */
export async function saveCategoryTexts(
  categoryId: TextCategoryId,
  values: Readonly<Record<string, string>>,
): Promise<{ changed: number }> {
  const overrides = await getOverrides();
  const entries: Record<string, TextEntry> = TEXT_CATALOG[categoryId].entries;
  const set: { key: string; value: string }[] = [];
  const clear: string[] = [];

  for (const [entryKey, entry] of Object.entries(entries)) {
    const rawValue = values[entryKey];
    if (rawValue === undefined) continue;
    const key = `${categoryId}.${entryKey}`;
    const value = normalizeTextValue(rawValue);
    const current = overrides.get(key);

    if (value === entry.default) {
      if (current !== undefined) clear.push(key);
    } else if (value !== current) {
      set.push({ key, value });
    }
  }

  if (set.length > 0 || clear.length > 0) {
    try {
      await saveSiteTextOverrides({ set, clear });
    } finally {
      overrideCache.current = null;
    }
  }

  return { changed: set.length + clear.length };
}
