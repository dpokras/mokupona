import { faker } from "@faker-js/faker";
import { RouterContextProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { buildEventData } from "../../../test/factories";

import { guestIdFor } from "./guests.server";

import { prisma } from "~/db.server";
import { createEvent } from "~/models/event.server";
import { loader as guestLoader } from "~/routes/admin.guests.$guestId";
import { loader as guestsLoader } from "~/routes/admin.guests._index";
import { loader as csvLoader } from "~/routes/admin.guests[.csv]";

async function createLegacyGuest() {
  const email = `guest-${faker.string.uuid()}@example.com`;
  const event = await createEvent({
    ...(await buildEventData()),
    date: new Date("2024-06-14T17:00:00Z"),
  });
  await prisma.eventResponse.create({
    data: {
      eventId: event.id,
      name: "Margaret Hamilton",
      email,
      phone: "079 444",
    },
  });

  return { email, event, id: guestIdFor(email, "Margaret Hamilton") };
}

function loadGuest(guestId: string) {
  return guestLoader({
    params: { guestId },
    request: new Request(`http://localhost:3000/admin/guests/${guestId}`),
    context: new RouterContextProvider(),
  } as unknown as Parameters<typeof guestLoader>[0]);
}

describe("admin guests routes", () => {
  it("lists the guest with their dinner count and latest dinner", async () => {
    const { email, event, id } = await createLegacyGuest();

    const { guests } = await guestsLoader();

    expect(guests.find((guest) => guest.email === email)).toEqual({
      id,
      name: "Margaret Hamilton",
      email,
      dinnerCount: 1,
      lastDinner: { id: event.id, title: event.title, date: event.date },
      cameThisYear: false,
    });
  });

  it("loads one guest's page by id", async () => {
    const { email, event, id } = await createLegacyGuest();

    const { guest } = await loadGuest(id);

    expect(guest).toMatchObject({
      id,
      email,
      phone: "079 444",
      visits: [{ role: "legacy", dinner: { id: event.id } }],
    });
  });

  it("answers an unknown guest id with a 404", async () => {
    const thrown = await loadGuest("ffffffffffff").catch((error) => error);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });

  it("exports the guest list as CSV", async () => {
    const { email, event } = await createLegacyGuest();

    const response = await csvLoader();
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toContain("guests.csv");
    expect(body).toContain(
      "Name,Email,Phone,Dinners,First dinner,First dinner date,Latest dinner,Latest dinner date",
    );
    const row = body.split("\n").find((line) => line.includes(email));
    expect(row).toContain(`Margaret Hamilton,${email},079 444,1,`);
    expect(row).toContain(event.title);
    expect(row).toContain("2024-06-14");
  });
});
