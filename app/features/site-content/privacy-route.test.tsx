import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_TEXTS } from "../../../test/site-texts";

import { SiteTextProvider } from "./site-text";
import type { SiteTexts } from "./types";

import PrivacyPage, { loader } from "~/routes/privacy";

function renderPrivacy(texts: SiteTexts = DEFAULT_SITE_TEXTS) {
  return render(
    <SiteTextProvider texts={texts}>
      <PrivacyPage />
    </SiteTextProvider>,
  );
}

describe("privacy route", () => {
  it("loads its own texts, which the root does not send", async () => {
    const { siteTexts } = await loader();

    expect(siteTexts["privacy.title"]).toBe("Privacy Policy");
    expect(siteTexts["privacy.body"]).toContain("## Responsibility");
  });

  it("renders the policy's sections and sub-sections as headings", () => {
    renderPrivacy();

    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Responsibility",
      "General Information on Data Processing",
      "Provisioning of the Website and Creation of Log Files",
      "Visit Statistics",
      "Use of Cookies",
      "Registration",
      "Signing up for an event",
      "Contact Form and Email Contact",
      "Changes to Our Privacy Policy",
    ]);
    expect(
      screen.getByRole("link", { name: "mokuponadinnerclub@gmail.com" }),
    ).toHaveAttribute("href", "mailto:mokuponadinnerclub@gmail.com");
    expect(
      screen.getByText("Last updated: October 8, 2026"),
    ).toBeInTheDocument();
  });

  it("drops the last updated line when an admin clears it", () => {
    renderPrivacy({ ...DEFAULT_SITE_TEXTS, "privacy.lastUpdated": "" });

    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });
});
