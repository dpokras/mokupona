import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_TEXTS } from "../../../test/site-texts";

import { SiteTextProvider } from "~/features/site-content/site-text";
import type { PublishedFaqEntry } from "~/models/faq.server";
import FaqPage, { meta } from "~/routes/faq";

type PageProps = Parameters<typeof FaqPage>[0];
type MetaArgs = Parameters<typeof meta>[0];

function renderPage(
  entries: PublishedFaqEntry[],
  texts: Record<string, string> = {},
) {
  return render(
    <SiteTextProvider texts={{ ...DEFAULT_SITE_TEXTS, ...texts }}>
      <FaqPage {...({ loaderData: { entries } } as unknown as PageProps)} />
    </SiteTextProvider>,
  );
}

describe("FAQ page", () => {
  it("lists the questions and opens an answer", () => {
    renderPage([
      {
        id: "1",
        question: "can i bring a friend?",
        answer: "yes, see [dinners](/dinners).",
      },
      { id: "2", question: "where?", answer: "zürich." },
    ]);

    expect(
      screen.getByRole("heading", { level: 1, name: "faq" }),
    ).toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: "can i bring a friend?",
    });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "dinners" })).toHaveAttribute(
      "href",
      "/dinners",
    );
    expect(screen.getByRole("button", { name: "where?" })).toBeInTheDocument();
  });

  it("says so when there are no questions", () => {
    renderPage([]);

    expect(
      screen.getByText(DEFAULT_SITE_TEXTS["faq.empty"]),
    ).toBeInTheDocument();
  });

  it("hides the contact part when its text is empty", () => {
    renderPage([], { "faq.contactBody": "" });

    expect(
      screen.queryByText(DEFAULT_SITE_TEXTS["faq.contactHeading"]),
    ).not.toBeInTheDocument();
  });

  it("takes its title and description from the site texts", () => {
    const tags = meta({
      matches: [
        {
          loaderData: {
            siteTexts: { ...DEFAULT_SITE_TEXTS, "faq.metaTitle": "Questions" },
          },
        },
      ],
    } as unknown as MetaArgs);

    expect(tags).toEqual([
      { title: "Questions" },
      {
        name: "description",
        content: DEFAULT_SITE_TEXTS["faq.metaDescription"],
      },
    ]);
  });
});
