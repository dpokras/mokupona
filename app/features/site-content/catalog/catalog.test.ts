import { describe, expect, it } from "vitest";

import { EM_DASH, findTextProblem } from "../text";
import type { TextEntry } from "../types";

import { TEXT_CATALOG, TEXT_CATEGORY_IDS } from ".";

const allEntries = TEXT_CATEGORY_IDS.flatMap((categoryId) =>
  Object.entries(
    TEXT_CATALOG[categoryId].entries as Record<string, TextEntry>,
  ).map(([key, entry]) => ({ fullKey: `${categoryId}.${key}`, key, entry })),
);

describe("text catalog", () => {
  it("has no em dashes in any default text", () => {
    const offenders = allEntries
      .filter(({ entry }) => entry.default.includes(EM_DASH))
      .map(({ fullKey }) => fullKey);
    expect(offenders).toEqual([]);
  });

  it("ships defaults the admin editor would accept", () => {
    const problems = allEntries
      .map(({ fullKey, entry }) => [
        fullKey,
        findTextProblem(entry, entry.default),
      ])
      .filter(([, problem]) => problem !== null);
    expect(problems).toEqual([]);
  });

  it("uses form-safe entry keys", () => {
    const badKeys = allEntries
      .filter(({ key }) => !/^[A-Za-z][A-Za-z0-9]*$/.test(key))
      .map(({ fullKey }) => fullKey);
    expect(badKeys).toEqual([]);
  });

  it("stores defaults without stray surrounding whitespace", () => {
    const untrimmed = allEntries
      .filter(({ entry }) => entry.default !== entry.default.trim())
      .map(({ fullKey }) => fullKey);
    expect(untrimmed).toEqual([]);
  });
});
