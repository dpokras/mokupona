import type { TextCategory, TextEntry } from "../types";

import { aboutTexts } from "./about";
import { dinnerTexts } from "./dinner";
import { dinnersTexts } from "./dinners";
import { emailTexts } from "./emails";
import { faqTexts } from "./faq";
import { galleryTexts } from "./gallery";
import { globalTexts } from "./global";
import { impressumTexts } from "./impressum";
import { landingTexts } from "./landing";
import { privacyTexts } from "./privacy";

/** Every editable public text, by category. Order is the admin's order. */
export const TEXT_CATALOG = {
  global: globalTexts,
  landing: landingTexts,
  dinners: dinnersTexts,
  dinner: dinnerTexts,
  gallery: galleryTexts,
  about: aboutTexts,
  faq: faqTexts,
  impressum: impressumTexts,
  privacy: privacyTexts,
  emails: emailTexts,
} as const;

type Catalog = typeof TEXT_CATALOG;

export type TextCategoryId = keyof Catalog;

export type TextKey = {
  [C in TextCategoryId]: `${C}.${Extract<keyof Catalog[C]["entries"], string>}`;
}[TextCategoryId];

export type TextKeyIn<C extends TextCategoryId> = Extract<
  TextKey,
  `${C}.${string}`
>;

export const TEXT_CATEGORY_IDS = Object.keys(TEXT_CATALOG) as TextCategoryId[];

export function isTextCategoryId(value: string): value is TextCategoryId {
  return Object.hasOwn(TEXT_CATALOG, value);
}

export function getTextCategory(id: TextCategoryId): TextCategory {
  return TEXT_CATALOG[id];
}

export function getTextEntry(key: string): TextEntry | undefined {
  const dot = key.indexOf(".");
  const categoryId = key.slice(0, dot);
  if (dot < 0 || !isTextCategoryId(categoryId)) return undefined;
  const entries: Record<string, TextEntry> = TEXT_CATALOG[categoryId].entries;
  const entryKey = key.slice(dot + 1);
  return Object.hasOwn(entries, entryKey) ? entries[entryKey] : undefined;
}

export function getDefaultTexts(
  categoryIds: readonly TextCategoryId[],
): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const categoryId of categoryIds) {
    const entries: Record<string, TextEntry> = TEXT_CATALOG[categoryId].entries;
    for (const [entryKey, entry] of Object.entries(entries)) {
      texts[`${categoryId}.${entryKey}`] = entry.default;
    }
  }
  return texts;
}
