import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_TEXTS } from "../../../../test/site-texts";
import type { EventCardModel } from "../view-models";

import { CompactEventCard, FeaturedEventCard } from "./event-card";
import { LandingDinnersSection } from "./landing-dinners-section";

import { SiteTextProvider } from "~/features/site-content/site-text";

function makeEvent(overrides: Partial<EventCardModel> = {}): EventCardModel {
  return {
    id: "dinner-1",
    title: "nine courses",
    description: "a long table",
    date: "2026-04-11T18:00:00.000Z",
    image: null,
    price: 45,
    slots: 12,
    addressLine: "8001 zürich",
    galleryImageCount: 0,
    ...overrides,
  };
}

function renderWithTexts(
  element: ReactNode,
  overrides: Record<string, string> = {},
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <SiteTextProvider texts={{ ...DEFAULT_SITE_TEXTS, ...overrides }}>
          {element}
        </SiteTextProvider>
      ),
    },
  ]);

  return render(<Stub initialEntries={["/"]} />);
}

describe("dinner cards", () => {
  it("labels the next dinner and its facts from the site texts", async () => {
    renderWithTexts(<FeaturedEventCard event={makeEvent()} />);

    expect(await screen.findByText("next dinner")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "reserve a seat" }),
    ).toHaveAttribute("href", "/dinners/dinner-1#sign-up");
    expect(screen.getByText("45 chf")).toBeInTheDocument();
    expect(screen.getByText("12 seats")).toBeInTheDocument();
  });

  it("uses the singular text for a single seat", async () => {
    renderWithTexts(<FeaturedEventCard event={makeEvent({ slots: 1 })} />);

    expect(await screen.findByText("1 seat")).toBeInTheDocument();
  });

  it("shows what an admin wrote instead of the defaults", async () => {
    renderWithTexts(<FeaturedEventCard event={makeEvent()} />, {
      "dinners.reserveButton": "book now",
      "dinner.price": "chf {price}.-",
    });

    expect(
      await screen.findByRole("link", { name: "book now" }),
    ).toBeInTheDocument();
    expect(screen.getByText("chf 45.-")).toBeInTheDocument();
  });

  it("counts gallery photos in the singular and the plural", async () => {
    renderWithTexts(
      <>
        <CompactEventCard event={makeEvent({ galleryImageCount: 1 })} />
        <CompactEventCard
          event={makeEvent({ id: "dinner-2", galleryImageCount: 7 })}
        />
      </>,
    );

    expect(await screen.findByText("1 photo")).toBeInTheDocument();
    expect(screen.getByText("7 photos")).toBeInTheDocument();
  });
});

describe("landing dinners section", () => {
  it("names the hand-drawn headings for screen readers", async () => {
    renderWithTexts(
      <LandingDinnersSection
        upcoming={[makeEvent()]}
        past={[makeEvent({ id: "dinner-2" })]}
        hasMore
      />,
      { "landing.pastDinnersHeading": "earlier evenings" },
    );

    expect(
      await screen.findByRole("img", { name: "the next dinner" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "earlier evenings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "see more →" })).toHaveAttribute(
      "href",
      "/dinners",
    );
  });

  it("says so when no dinner is planned", async () => {
    renderWithTexts(
      <LandingDinnersSection upcoming={[]} past={[]} hasMore={false} />,
    );

    expect(
      await screen.findByText(/nothing on the calendar right now/),
    ).toBeInTheDocument();
  });
});
