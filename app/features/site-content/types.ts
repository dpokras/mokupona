/**
 * - `line`: one line of text, no line breaks (labels, titles, buttons)
 * - `paragraph`: plain text, line breaks kept as typed
 * - `rich`: formatted text, see `RichText` for the supported syntax
 */
export type TextKind = "line" | "paragraph" | "rich";

/**
 * - `root`: loaded once by the root loader, available on every page
 * - `route`: long texts a single page loads for itself
 * - `server`: never sent to the browser (emails)
 */
export type TextScope = "root" | "route" | "server";

export interface TextEntry {
  /** What the editor is called in the admin, e.g. "Navbar: dinners link". */
  label: string;
  /** Where it shows up or what to keep in mind when editing it. */
  help?: string;
  kind: TextKind;
  default: string;
  /** `{name}` slots the code fills in, e.g. `["count"]`. */
  placeholders?: readonly string[];
  /** Whether the admin may leave it empty (the page then hides it). */
  optional?: boolean;
  /** Section heading the admin editor groups this entry under. */
  group?: string;
}

export interface TextCategory<
  Entries extends Record<string, TextEntry> = Record<string, TextEntry>,
> {
  title: string;
  description: string;
  scope: TextScope;
  entries: Entries;
}

export function defineTextCategory<
  const Entries extends Record<string, TextEntry>,
>(category: TextCategory<Entries>): TextCategory<Entries> {
  return category;
}

/** Resolved texts by full key (`category.entry`), as sent to the page. */
export type SiteTexts = Readonly<Record<string, string>>;

export type TextVariables = Readonly<Record<string, string | number>>;
