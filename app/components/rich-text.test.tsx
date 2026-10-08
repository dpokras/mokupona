import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseInline, parseRichText, RichText } from "./rich-text";

describe("parseRichText", () => {
  it("splits headings, paragraphs and lists", () => {
    expect(
      parseRichText(
        "## Who\nmoku pona\nZürich\n\n- one\n- two\n\n1. first\n2. second\n\n### Small",
      ),
    ).toEqual([
      { type: "heading", level: 2, text: "Who" },
      { type: "paragraph", lines: ["moku pona", "Zürich"] },
      { type: "list", ordered: false, items: ["one", "two"] },
      { type: "list", ordered: true, items: ["first", "second"] },
      { type: "heading", level: 3, text: "Small" },
    ]);
  });
});

describe("parseInline", () => {
  it("finds bold, markdown links, urls and emails", () => {
    expect(
      parseInline(
        "**hi** see [our site](https://mokupona.ch) or https://x.ch, mail a@b.ch.",
      ),
    ).toEqual([
      { type: "bold", value: "hi" },
      { type: "text", value: " see " },
      { type: "link", label: "our site", href: "https://mokupona.ch" },
      { type: "text", value: " or " },
      { type: "link", label: "https://x.ch", href: "https://x.ch" },
      { type: "text", value: ", mail " },
      { type: "link", label: "a@b.ch", href: "mailto:a@b.ch" },
      { type: "text", value: "." },
    ]);
  });

  it("refuses script links", () => {
    expect(parseInline("[x](javascript:alert(1))")[0]).toEqual({
      type: "text",
      value: "[x](javascript:alert(1)",
    });
  });
});

describe("RichText", () => {
  it("renders links that open safely", () => {
    render(<RichText text="Visit https://mokupona.ch" />);
    const link = screen.getByRole("link", { name: "https://mokupona.ch" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
