import type { TextEntry, TextVariables } from "./types";

export const EM_DASH = "—";

const PLACEHOLDER = /\{(\w+)\}/g;

const MAX_LENGTH: Record<TextEntry["kind"], number> = {
  line: 300,
  paragraph: 5000,
  rich: 50000,
};

export function interpolate(template: string, variables?: TextVariables) {
  if (!variables) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in variables ? String(variables[name]) : match,
  );
}

export function normalizeTextValue(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

/** The first problem with `value` as a public text, or null when it is fine. */
export function findTextProblem(
  entry: Pick<TextEntry, "kind" | "optional" | "placeholders">,
  rawValue: string,
): string | null {
  const value = normalizeTextValue(rawValue);

  if (!entry.optional && value === "") {
    return "This text can't be empty.";
  }

  if (value.includes(EM_DASH)) {
    return "Em dashes (—) aren't allowed in public texts. Use a comma, a colon or a full stop instead.";
  }

  if (entry.kind === "line" && value.includes("\n")) {
    return "Keep this to a single line.";
  }

  if (value.length > MAX_LENGTH[entry.kind]) {
    return `This text is too long (at most ${MAX_LENGTH[entry.kind]} characters).`;
  }

  const allowed = entry.placeholders ?? [];
  for (const [, name] of value.matchAll(PLACEHOLDER)) {
    if (!allowed.includes(name)) {
      return allowed.length > 0
        ? `{${name}} isn't available here. You can use ${allowed.map((p) => `{${p}}`).join(", ")}.`
        : `{${name}} isn't available here. Remove the curly braces.`;
    }
  }

  return null;
}
