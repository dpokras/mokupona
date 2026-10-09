import { fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import type { GuestSummary } from "./guests.server";

import AdminGuestsPage from "~/routes/admin.guests._index";

type PageProps = Parameters<typeof AdminGuestsPage>[0];

function guest(
  overrides: Partial<GuestSummary> & Pick<GuestSummary, "id" | "name">,
): GuestSummary {
  return {
    email: `${overrides.id}@example.com`,
    dinnerCount: 1,
    lastDinner: {
      id: "spring",
      title: "Spring dinner",
      date: new Date("2025-04-12T17:00:00Z"),
    },
    cameThisYear: false,
    ...overrides,
  };
}

const GUESTS = [
  guest({ id: "aaaaaaaaaaaa", name: "Ada Lovelace", dinnerCount: 3 }),
  guest({ id: "bbbbbbbbbbbb", name: "Grace Hopper", cameThisYear: true }),
  guest({ id: "cccccccccccc", name: "Alan Turing", email: "alan@turing.dev" }),
];

function renderPage() {
  const props = {
    loaderData: { guests: GUESTS },
  } as unknown as PageProps;
  const Stub = createRoutesStub([
    { path: "/admin/guests", Component: () => <AdminGuestsPage {...props} /> },
  ]);
  render(<Stub initialEntries={["/admin/guests"]} />);
}

function visibleNames() {
  return screen
    .queryAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);
}

describe("admin guests page", () => {
  it("links every guest to their own page", () => {
    renderPage();

    expect(screen.getByText("3 guests")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute(
      "href",
      "/admin/guests/aaaaaaaaaaaa",
    );
  });

  it("searches by name or email", () => {
    renderPage();
    const search = screen.getByPlaceholderText("Search by name or email");

    fireEvent.change(search, { target: { value: "grace" } });
    expect(visibleNames()).toEqual(["Grace Hopper"]);

    fireEvent.change(search, { target: { value: "TURING.dev" } });
    expect(visibleNames()).toEqual(["Alan Turing"]);
  });

  it("filters to returning guests and to this year's guests", () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: "Came more than once" }),
    );
    expect(visibleNames()).toEqual(["Ada Lovelace"]);

    fireEvent.click(screen.getByRole("button", { name: "This year" }));
    expect(visibleNames()).toEqual(["Grace Hopper"]);
  });
});
