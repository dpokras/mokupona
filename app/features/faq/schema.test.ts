import { describe, expect, it } from "vitest";

import { FaqEntrySchema } from "./schema";
import { STARTER_FAQ_QUESTIONS } from "./starter-questions";

describe("FaqEntrySchema", () => {
  it("trims and normalises line breaks", () => {
    expect(
      FaqEntrySchema.parse({
        question: " why? ",
        answer: "because.\r\nreally.",
        published: true,
      }),
    ).toEqual({
      question: "why?",
      answer: "because.\nreally.",
      published: true,
    });
  });

  it("defaults to unpublished", () => {
    expect(FaqEntrySchema.parse({ question: "q", answer: "a" }).published).toBe(
      false,
    );
  });

  it("accepts every starter question as it ships", () => {
    for (const entry of STARTER_FAQ_QUESTIONS) {
      expect(
        FaqEntrySchema.safeParse({ ...entry, published: false }).success,
      ).toBe(true);
    }
  });
});
