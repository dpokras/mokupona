import { createHash } from "node:crypto";

import { EVENT_TIMEZONE } from "~/features/events/timezone";
import {
  getAttendeesForAllEvents,
  type DinnerAttendee,
} from "~/features/signup-form/read.server";

export type GuestDinner = DinnerAttendee["dinner"];

export type GuestRole = "signer" | "friend" | "legacy";

export interface GuestRef {
  id: string;
  name: string;
}

export interface GuestVisit {
  dinner: GuestDinner;
  role: GuestRole;
  broughtBy: GuestRef | null;
  signedUpAt: Date;
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  dinnerCount: number;
  firstDinner: GuestDinner;
  lastDinner: GuestDinner;
  visits: GuestVisit[];
}

export interface GuestSummary {
  id: string;
  name: string;
  email: string;
  dinnerCount: number;
  lastDinner: GuestDinner;
  cameThisYear: boolean;
}

function identityKey(email: string, name: string): string {
  return JSON.stringify([
    email.trim().toLowerCase(),
    name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
  ]);
}

function idForKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

export function guestIdFor(email: string, name: string): string {
  return idForKey(identityKey(email, name));
}

export function groupAttendeesIntoGuests(attendees: DinnerAttendee[]): Guest[] {
  const byIdentity = new Map<string, DinnerAttendee[]>();
  const signerKeys = new Map<string, string>();
  for (const attendee of attendees) {
    const key = identityKey(attendee.email, attendee.name);
    const entries = byIdentity.get(key);
    if (entries) entries.push(attendee);
    else byIdentity.set(key, [attendee]);
    if (attendee.isSigner) signerKeys.set(attendee.submissionId, key);
  }

  const groups = [...byIdentity].map(([key, entries]) => {
    const oldestFirst = [...entries].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const latest = oldestFirst[oldestFirst.length - 1];
    return {
      key,
      oldestFirst,
      ref: { id: idForKey(key), name: displayName(latest.name) },
    };
  });
  const refs = new Map(groups.map(({ key, ref }) => [key, ref]));
  const signerOf = (submissionId: string) => {
    const key = signerKeys.get(submissionId);
    return key ? (refs.get(key) ?? null) : null;
  };

  return groups
    .map(({ ref, oldestFirst }) => toGuest(ref, oldestFirst, signerOf))
    .sort(
      (a, b) =>
        b.lastDinner.date.getTime() - a.lastDinner.date.getTime() ||
        a.name.localeCompare(b.name),
    );
}

function toGuest(
  ref: GuestRef,
  oldestFirst: DinnerAttendee[],
  signerOf: (submissionId: string) => GuestRef | null,
): Guest {
  const newestFirst = [...oldestFirst].reverse();

  const visitsByDinner = new Map<string, GuestVisit>();
  for (const entry of oldestFirst) {
    if (visitsByDinner.has(entry.dinner.id)) continue;
    visitsByDinner.set(entry.dinner.id, toVisit(entry, signerOf));
  }
  const visits = [...visitsByDinner.values()].sort(
    (a, b) =>
      b.dinner.date.getTime() - a.dinner.date.getTime() ||
      b.signedUpAt.getTime() - a.signedUpAt.getTime(),
  );

  const phoneEntry =
    newestFirst.find(
      (entry) => entry.isSigner !== false && entry.phone.trim(),
    ) ?? newestFirst.find((entry) => entry.phone.trim());

  return {
    ...ref,
    email: oldestFirst[0].email.trim().toLowerCase(),
    phone: phoneEntry?.phone.trim() ?? "",
    dinnerCount: visits.length,
    firstDinner: visits[visits.length - 1].dinner,
    lastDinner: visits[0].dinner,
    visits,
  };
}

function toVisit(
  entry: DinnerAttendee,
  signerOf: (submissionId: string) => GuestRef | null,
): GuestVisit {
  const role: GuestRole =
    entry.isSigner === null ? "legacy" : entry.isSigner ? "signer" : "friend";

  return {
    dinner: entry.dinner,
    role,
    broughtBy: role === "friend" ? signerOf(entry.submissionId) : null,
    signedUpAt: entry.createdAt,
  };
}

function displayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

const yearFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  timeZone: EVENT_TIMEZONE,
});

export function summarizeGuest(guest: Guest, now: Date): GuestSummary {
  const thisYear = yearFormat.format(now);

  return {
    id: guest.id,
    name: guest.name,
    email: guest.email,
    dinnerCount: guest.dinnerCount,
    lastDinner: guest.lastDinner,
    cameThisYear: guest.visits.some(
      (visit) => yearFormat.format(visit.dinner.date) === thisYear,
    ),
  };
}

export async function getGuests(): Promise<Guest[]> {
  return groupAttendeesIntoGuests(await getAttendeesForAllEvents());
}

const GUEST_ID_PATTERN = /^[0-9a-f]{12}$/;

export async function getGuestById(id: string): Promise<Guest | null> {
  if (!GUEST_ID_PATTERN.test(id)) return null;

  const guests = await getGuests();
  return guests.find((guest) => guest.id === id) ?? null;
}
