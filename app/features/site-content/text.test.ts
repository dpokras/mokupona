import { describe, expect, it } from "vitest";

import { EM_DASH, findTextProblem, interpolate } from "./text";

describe("interpolate", () => {
  it("fills known placeholders and leaves unknown ones alone", () => {
    expect(interpolate("{count} seats, {missing}", { count: 3 })).toBe(
      "3 seats, {missing}",
    );
  });
});

describe("findTextProblem", () => {
  const line = { kind: "line" as const };

  it("accepts a normal text", () => {
    expect(findTextProblem(line, "join a dinner")).toBeNull();
  });

  it("rejects em dashes", () => {
    expect(findTextProblem(line, `food ${EM_DASH} people`)).toMatch(
      /Em dashes/,
    );
  });

  it("rejects empty required texts but allows empty optional ones", () => {
    expect(findTextProblem(line, "   ")).toMatch(/can't be empty/);
    expect(findTextProblem({ ...line, optional: true }, "")).toBeNull();
  });

  it("keeps single-line texts on one line", () => {
    expect(findTextProblem(line, "one\ntwo")).toMatch(/single line/);
    expect(findTextProblem({ kind: "paragraph" }, "one\ntwo")).toBeNull();
  });

  it("only allows the placeholders the entry declares", () => {
    const entry = { kind: "line" as const, placeholders: ["count"] };
    expect(findTextProblem(entry, "{count} left")).toBeNull();
    expect(findTextProblem(entry, "{cuont} left")).toMatch(/\{count\}/);
    expect(findTextProblem(line, "{count} left")).toMatch(/Remove/);
  });
});
