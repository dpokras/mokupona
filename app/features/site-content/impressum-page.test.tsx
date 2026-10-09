import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_TEXTS } from "../../../test/site-texts";

import { SiteTextProvider } from "~/features/site-content/site-text";
import ImpressumPage, { loader, meta } from "~/routes/impressum";

type MetaArgs = Parameters<typeof meta>[0];

function renderPage(texts: Record<string, string> = {}) {
  return render(
    <SiteTextProvider texts={{ ...DEFAULT_SITE_TEXTS, ...texts }}>
      <ImpressumPage />
    </SiteTextProvider>,
  );
}

describe("impressum page", () => {
  it("shows the address and contact details", () => {
    renderPage();

    expect(screen.getByText(/Regensbergstrasse 24/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "mokuponadinnerclub@gmail.com" }),
    ).toHaveAttribute("href", "mailto:mokuponadinnerclub@gmail.com");
    expect(
      screen.getByRole("link", { name: "https://mokupona.ch" }),
    ).toHaveAttribute("href", "https://mokupona.ch");
    expect(
      screen.getByRole("heading", { name: "external links" }),
    ).toBeInTheDocument();
  });

  it("leaves out the optional lines until they are filled in", () => {
    renderPage();

    expect(screen.queryByText("responsible person")).not.toBeInTheDocument();
    expect(screen.queryByText("company number (UID)")).not.toBeInTheDocument();
  });

  it("shows the optional lines once filled in, and hides emptied ones", () => {
    renderPage({
      "impressum.responsiblePerson": "Aina Bergström",
      "impressum.uid": "CHE-123.456.789",
      "impressum.website": "",
      "impressum.additionalInfo": "",
    });

    expect(screen.getByText("Aina Bergström")).toBeInTheDocument();
    expect(screen.getByText("CHE-123.456.789")).toBeInTheDocument();
    expect(screen.queryByText("website")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "external links" }),
    ).not.toBeInTheDocument();
  });

  it("loads its texts in the loader for its meta tags", async () => {
    const loaderData = await loader();

    expect(loaderData.siteTexts["impressum.organisationName"]).toBe(
      "moku pona",
    );
    expect(meta({ matches: [{ loaderData }] } as unknown as MetaArgs)).toEqual([
      { title: "Impressum" },
      {
        name: "description",
        content: DEFAULT_SITE_TEXTS["impressum.metaDescription"],
      },
    ]);
  });
});
