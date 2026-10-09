import type { Event, EventResponse } from "#prisma/generated/client";

import { prisma } from "~/db.server";

export type { EventResponse } from "#prisma/generated/client";

export async function countEventResponsesByEvent(eventIds: string[]) {
  return prisma.eventResponse.groupBy({
    by: ["eventId"],
    where: { eventId: { in: eventIds } },
    _count: { _all: true },
  });
}

export async function getEventResponsesForEvent(eventId: string) {
  return prisma.eventResponse.findMany({
    where: {
      eventId,
    },
  });
}

export async function getAllEventResponsesWithEvent(): Promise<
  (EventResponse & { event: Pick<Event, "id" | "title" | "date"> })[]
> {
  return prisma.eventResponse.findMany({
    include: { event: { select: { id: true, title: true, date: true } } },
  });
}
