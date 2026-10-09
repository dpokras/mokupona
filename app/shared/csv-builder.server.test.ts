import { describe, expect, it } from "vitest";

import { buildCSVObject } from "./csv-builder.server";

const BOM = "\uFEFF";

describe("buildCSVObject", () => {
  it("escapes embedded double quotes per RFC 4180", () => {
    const { data } = buildCSVObject(
      ["Restrictions"],
      [['peanuts, "severe" allergy']],
    );

    expect(data).toBe(`${BOM}Restrictions\n"peanuts, ""severe"" allergy"\n`);
  });

  it("quotes values containing separators or line breaks", () => {
    const { data } = buildCSVObject(["A", "B"], [["one,two", "three\nfour"]]);

    expect(data).toBe(`${BOM}A,B\n"one,two","three\nfour"\n`);
  });

  it("ends rows with the line break directly, without a trailing separator", () => {
    const { data } = buildCSVObject(["A", "B"], [["1", "2"]], ";");

    expect(data).toBe(`${BOM}A;B\n1;2\n`);
  });

  it("starts with a UTF-8 BOM and declares the charset so Excel decodes umlauts", () => {
    const { data, mimeType } = buildCSVObject(["Name"], [["Jürgen Müller"]]);

    expect(data.startsWith(BOM)).toBe(true);
    expect(data).toContain("Jürgen Müller");
    expect(mimeType).toBe("text/csv; charset=utf-8");
  });

  it("reports size in UTF-8 bytes, not UTF-16 code units", () => {
    const { data, size } = buildCSVObject(["Name"], [["Jürgen"]]);

    expect(size).toBe(Buffer.byteLength(data, "utf8"));
    expect(size).toBeGreaterThan(data.length);
  });

  it("neutralizes cells a spreadsheet would run as a formula", () => {
    const { data } = buildCSVObject(
      ["Name"],
      [
        ['=HYPERLINK("https://evil.example","click")'],
        ["+cmd|' /C calc'!A0"],
        ["-2+3"],
        ["@SUM(A1)"],
        ["\tTabbed"],
      ],
    );

    expect(data).toBe(
      `${BOM}Name\n"'=HYPERLINK(""https://evil.example"",""click"")"\n'+cmd|' /C calc'!A0\n'-2+3\n'@SUM(A1)\n'\tTabbed\n`,
    );
  });

  it("keeps phone numbers and ordinary text as typed", () => {
    const { data } = buildCSVObject(
      ["Phone", "Note"],
      [
        ["+41 79 123 45 67", "vegan - no nuts"],
        ["(044) 123-45-67", "-"],
      ],
    );

    expect(data).toBe(
      `${BOM}Phone,Note\n+41 79 123 45 67,vegan - no nuts\n(044) 123-45-67,-\n`,
    );
  });
});
