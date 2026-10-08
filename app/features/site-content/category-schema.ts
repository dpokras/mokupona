import { z } from "zod";

import { findTextProblem } from "./text";
import type { TextEntry } from "./types";

export type EditableEntryRules = Pick<
  TextEntry,
  "kind" | "optional" | "placeholders"
>;

/** One field per entry key; shared by the editor's client and server checks. */
export function buildTextCategorySchema(
  entries: Readonly<Record<string, EditableEntryRules>>,
) {
  return z.object(
    Object.fromEntries(
      Object.entries(entries).map(([key, entry]) => [
        key,
        z
          .string()
          .optional()
          .transform((value) => value ?? "")
          .superRefine((value, ctx) => {
            const problem = findTextProblem(entry, value);
            if (problem) ctx.addIssue({ code: "custom", message: problem });
          }),
      ]),
    ),
  );
}
