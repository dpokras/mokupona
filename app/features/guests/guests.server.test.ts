import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";

import { buildEventData } from "../../../test/factories";

import {
  getGuestById,
  getGuests,
  groupAttendeesIntoGuests,
  guestIdFor,
  summarizeGuest,
} from "./guests.server";

import { prisma } from "~/db.server";
import type { DinnerAttendee } from "~/features/signup-form/read.server";
import { createEvent } from "~/models/event.server";
import { createFormSubmission } from "~/models/form-submission.server";
import { getCurrentFormVersion } from "~/models/form.server";

const SPRING = {
  id: "spring",
  title: "Spring",
  date: new Date("2025-04-12T17:00:00Z"),
};
const SUMMER = {
  id: "summer",
  title: "Summer",
  date: new Date("2025-07-19T17:00:00Z"),
};
const AUTUMN = {
  id: "autumn",
  title: "Autumn",
  date: new Date("2025-10-04T17:00:00Z"),
};

function attendee(
  overrides: Partial<DinnerAttendee> & Pick<DinnerAttendee, "dinner">,
): DinnerAttendee {
  return {
    submissionId: faker.string.uuid(),
    isSigner: true,
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "",
    answers: {},
    createdAt: new Date(overrides.dinner.date.getTime() - 86_400_000),
    ...overrides,
  };
}

describe("groupAttendeesIntoGuests", () => {
  it("keeps a friend apart from the signer whose email they share", () => {
    const guests = groupAttendeesIntoGuests([
      attendee({ dinner: SPRING, submissionId: "party", phone: "079 111" }),
      attendee({
        dinner: SPRING,
        submissionId: "party",
        isSigner: false,
        name: "Grace Hopper",
        phone: "079 111",
      }),
    ]);

    expect(guests).toHaveLength(2);
    const [ada, grace] = [...guests].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    expect(ada.email).toBe("ada@example.com");
    expect(grace.email).toBe("ada@example.com");
    expect(ada.id).not.toBe(grace.id);
    expect(ada.visits[0]).toMatchObject({ role: "signer", broughtBy: null });
    expect(grace.visits[0]).toMatchObject({
      role: "friend",
      broughtBy: { id: ada.id, name: "Ada Lovelace" },
    });
  });

  it("names the friend's signer by the signer's latest spelling", () => {
    const guests = groupAttendeesIntoGuests([
      attendee({ dinner: SPRING, submissionId: "party", name: "ada lovelace" }),
      attendee({
        dinner: SPRING,
        submissionId: "party",
        isSigner: false,
        name: "Grace Hopper",
      }),
      attendee({ dinner: AUTUMN, name: "Ada Lovelace" }),
    ]);

    const grace = guests.find((guest) => guest.name === "Grace Hopper");
    expect(grace?.visits[0].broughtBy?.name).toBe("Ada Lovelace");
  });

  it("merges one person across dinners regardless of email case and name spacing", () => {
    const guests = groupAttendeesIntoGuests([
      attendee({
        dinner: SUMMER,
        email: " ADA@Example.com",
        name: "ada  lovelace ",
      }),
      attendee({
        dinner: SPRING,
        email: "ada@example.com",
        name: "Ada Lovelace",
      }),
      attendee({
        dinner: AUTUMN,
        email: "Ada@example.COM",
        name: "Ada Lovelace",
      }),
    ]);

    expect(guests).toHaveLength(1);
    const [ada] = guests;
    expect(ada.email).toBe("ada@example.com");
    expect(ada.dinnerCount).toBe(3);
    expect(ada.firstDinner.id).toBe("spring");
    expect(ada.lastDinner.id).toBe("autumn");
    expect(ada.visits.map((visit) => visit.dinner.id)).toEqual([
      "autumn",
      "summer",
      "spring",
    ]);
  });

  it("takes the name spelling and phone from the most recent signup", () => {
    const [ada] = groupAttendeesIntoGuests([
      attendee({ dinner: SPRING, name: "ada lovelace", phone: "079 111" }),
      attendee({ dinner: SUMMER, name: "Ada Lovelace", phone: "079 222" }),
      attendee({ dinner: AUTUMN, name: "ADA LOVELACE", phone: "" }),
    ]);

    expect(ada.name).toBe("ADA LOVELACE");
    expect(ada.phone).toBe("079 222");
  });

  it("prefers a phone the guest gave themselves over one inherited as a friend", () => {
    const [grace] = groupAttendeesIntoGuests([
      attendee({ dinner: SPRING, name: "Grace Hopper", phone: "079 333" }),
      attendee({
        dinner: AUTUMN,
        name: "Grace Hopper",
        isSigner: false,
        phone: "079 999",
      }),
    ]);

    expect(grace.phone).toBe("079 333");

    const [friendOnly] = groupAttendeesIntoGuests([
      attendee({
        dinner: AUTUMN,
        name: "Alan Turing",
        isSigner: false,
        phone: "079 999",
      }),
    ]);
    expect(friendOnly.phone).toBe("079 999");
  });

  it("marks legacy rows as legacy signups", () => {
    const [legacy] = groupAttendeesIntoGuests([
      attendee({ dinner: SPRING, isSigner: null }),
    ]);

    expect(legacy.visits).toEqual([
      expect.objectContaining({ role: "legacy", broughtBy: null }),
    ]);
  });

  it("counts a dinner once when the guest signed up for it twice", () => {
    const first = new Date("2025-04-01T10:00:00Z");
    const [ada] = groupAttendeesIntoGuests([
      attendee({ dinner: SPRING, createdAt: new Date("2025-04-02T10:00:00Z") }),
      attendee({ dinner: SPRING, createdAt: first }),
    ]);

    expect(ada.dinnerCount).toBe(1);
    expect(ada.visits).toHaveLength(1);
    expect(ada.visits[0].signedUpAt).toEqual(first);
  });

  it("orders guests by their latest dinner, newest first", () => {
    const guests = groupAttendeesIntoGuests([
      attendee({ dinner: SPRING, name: "Spring Only", email: "s@example.com" }),
      attendee({ dinner: AUTUMN, name: "Autumn Only", email: "a@example.com" }),
      attendee({ dinner: SUMMER, name: "Summer Only", email: "m@example.com" }),
    ]);

    expect(guests.map((guest) => guest.name)).toEqual([
      "Autumn Only",
      "Summer Only",
      "Spring Only",
    ]);
  });

  it("derives a short id from the normalized identity", () => {
    const [ada] = groupAttendeesIntoGuests([attendee({ dinner: SPRING })]);

    expect(ada.id).toMatch(/^[0-9a-f]{12}$/);
    expect(ada.id).toBe(guestIdFor(" ADA@example.com", "ada   LOVELACE"));
    expect(ada.id).not.toBe(guestIdFor("ada@example.com", "Ada Byron"));
    expect(ada.id).not.toContain("ada");
  });
});

describe("summarizeGuest", () => {
  it("counts a dinner as this year by Zurich time", () => {
    const newYearsEve = {
      id: "nye",
      title: "New Year's Eve",
      date: new Date("2025-12-31T23:30:00Z"),
    };
    const [guest] = groupAttendeesIntoGuests([
      attendee({ dinner: newYearsEve }),
    ]);

    expect(
      summarizeGuest(guest, new Date("2026-03-01T12:00:00Z")).cameThisYear,
    ).toBe(true);
    expect(
      summarizeGuest(guest, new Date("2025-06-01T12:00:00Z")).cameThisYear,
    ).toBe(false);
  });
});

async function createDinner(date: Date) {
  return createEvent({ ...(await buildEventData()), date });
}

describe("getGuests", () => {
  it("joins form signups and legacy rows into one history per guest", async () => {
    const email = `ada-${faker.string.uuid()}@example.com`;
    const older = await createDinner(new Date("2024-05-10T17:00:00Z"));
    const newer = await createDinner(new Date("2024-09-20T17:00:00Z"));

    await prisma.eventResponse.create({
      data: {
        eventId: older.id,
        name: "Ada Lovelace",
        email: email.toUpperCase(),
        phone: "079 111",
      },
    });
    const version = await getCurrentFormVersion(newer.formId);
    await createFormSubmission({
      formVersionId: version.id,
      answers: {
        name: "Ada Lovelace",
        email,
        phone: "079 222",
        friends: [{ name: "Grace Hopper" }],
      },
    });

    const guests = (await getGuests()).filter((guest) => guest.email === email);

    expect(guests.map((guest) => guest.name).sort()).toEqual([
      "Ada Lovelace",
      "Grace Hopper",
    ]);
    const ada = guests.find((guest) => guest.name === "Ada Lovelace")!;
    expect(ada).toMatchObject({
      phone: "079 222",
      dinnerCount: 2,
      firstDinner: { id: older.id, title: older.title },
      lastDinner: { id: newer.id, title: newer.title },
    });
    expect(ada.visits.map((visit) => visit.role)).toEqual(["signer", "legacy"]);

    const grace = guests.find((guest) => guest.name === "Grace Hopper")!;
    expect(grace.visits).toEqual([
      expect.objectContaining({
        role: "friend",
        broughtBy: { id: ada.id, name: "Ada Lovelace" },
        dinner: { id: newer.id, title: newer.title, date: newer.date },
      }),
    ]);

    expect(await getGuestById(ada.id)).toEqual(ada);
  });

  it("finds no guest for an unknown or malformed id", async () => {
    expect(await getGuestById("000000000000")).toBeNull();
    expect(await getGuestById("ada@example.com")).toBeNull();
  });
});
