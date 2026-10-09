import { z } from "zod";

import type { EditableEntryRules } from "~/features/site-content/category-schema";
import {
  findTextProblem,
  normalizeTextValue,
} from "~/features/site-content/text";

function publicText(rules: EditableEntryRules) {
  return z
    .string()
    .optional()
    .transform((value) => normalizeTextValue(value ?? ""))
    .superRefine((value, ctx) => {
      const problem = findTextProblem(rules, value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    });
}

export const FaqEntrySchema = z.object({
  question: publicText({ kind: "line" }),
  answer: publicText({ kind: "rich" }),
  published: z.boolean().default(false),
});

export const FaqMoveSchema = z.object({
  direction: z.enum(["up", "down"]),
});
