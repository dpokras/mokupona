import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_TEXTS } from "../../../test/site-texts";

import { PrivacyConsentLabel } from "./privacy-consent-label";

import { SiteTextProvider } from "~/features/site-content/site-text";

function renderLabel(overrides: Record<string, string> = {}) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <SiteTextProvider texts={{ ...DEFAULT_SITE_TEXTS, ...overrides }}>
          <PrivacyConsentLabel />
        </SiteTextProvider>
      ),
    },
  ]);

  return render(<Stub initialEntries={["/"]} />);
}

describe("privacy consent label", () => {
  it("links the privacy policy inside the default text", async () => {
    const { container } = renderLabel();

    expect(
      await screen.findByRole("link", { name: "privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
    expect(container).toHaveTextContent("i agree to the privacy policy");
  });

  it("puts the link wherever the admin wrote {link}", async () => {
    const { container } = renderLabel({
      "dinner.privacyConsent": "i have read the {link} and agree",
      "dinner.privacyConsentLink": "data notice",
    });

    expect(
      await screen.findByRole("link", { name: "data notice" }),
    ).toBeInTheDocument();
    expect(container).toHaveTextContent(
      "i have read the data notice and agree",
    );
  });

  it("drops the link when the text has no {link}", async () => {
    const { container } = renderLabel({
      "dinner.privacyConsent": "i agree to be contacted about this dinner",
    });

    expect(
      await screen.findByText("i agree to be contacted about this dinner"),
    ).toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
  });
});
