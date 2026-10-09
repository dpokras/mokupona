import type { FaqEntry, Prisma } from "#prisma/generated/client";

import { prisma } from "~/db.server";

export type { FaqEntry };

export interface FaqEntryData {
  question: string;
  answer: string;
  published: boolean;
}

export interface PublishedFaqEntry {
  id: string;
  question: string;
  answer: string;
}

export type FaqMoveDirection = "up" | "down";

// createdAt and id only break ties between rows that share a position
const FAQ_ORDER = [
  { position: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.FaqEntryOrderByWithRelationInput[];

export async function listFaqEntries(): Promise<FaqEntry[]> {
  return prisma.faqEntry.findMany({ orderBy: FAQ_ORDER });
}

export async function listPublishedFaqEntries(): Promise<PublishedFaqEntry[]> {
  return prisma.faqEntry.findMany({
    where: { published: true },
    orderBy: FAQ_ORDER,
    select: { id: true, question: true, answer: true },
  });
}

export async function getFaqEntryById(id: string): Promise<FaqEntry | null> {
  return prisma.faqEntry.findUnique({ where: { id } });
}

async function nextPositionInTx(tx: Prisma.TransactionClient): Promise<number> {
  const { _max } = await tx.faqEntry.aggregate({ _max: { position: true } });
  return (_max.position ?? -1) + 1;
}

/** Adds the entry after the current last one. */
export async function createFaqEntry(data: FaqEntryData): Promise<FaqEntry> {
  return prisma.$transaction(async (tx) =>
    tx.faqEntry.create({
      data: { ...data, position: await nextPositionInTx(tx) },
    }),
  );
}

/**
 * Adds `entries` in the given order, but only while there are no entries at
 * all, so a repeated submit can't add the set twice. Returns how many it
 * added.
 */
export async function createFaqEntriesIfEmpty(
  entries: readonly FaqEntryData[],
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    if ((await tx.faqEntry.count()) > 0) return 0;

    for (const [position, entry] of entries.entries()) {
      await tx.faqEntry.create({ data: { ...entry, position } });
    }
    return entries.length;
  });
}

/** False when there is no entry with this id. */
export async function updateFaqEntry(
  id: string,
  data: FaqEntryData,
): Promise<boolean> {
  const { count } = await prisma.faqEntry.updateMany({
    where: { id },
    data,
  });
  return count > 0;
}

/** False when there is no entry with this id. */
export async function deleteFaqEntry(id: string): Promise<boolean> {
  const { count } = await prisma.faqEntry.deleteMany({ where: { id } });
  return count > 0;
}

/**
 * Swaps the entry with its neighbour. Renumbers every entry from 0 while at
 * it, so rows that share a position still move. False when the entry doesn't
 * exist or is already first (up) or last (down).
 */
export async function moveFaqEntry(
  id: string,
  direction: FaqMoveDirection,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const entries = await tx.faqEntry.findMany({
      orderBy: FAQ_ORDER,
      select: { id: true, position: true },
    });

    const from = entries.findIndex((entry) => entry.id === id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= entries.length) return false;

    [entries[from], entries[to]] = [entries[to], entries[from]];

    for (const [position, entry] of entries.entries()) {
      if (entry.position === position) continue;
      await tx.faqEntry.update({
        where: { id: entry.id },
        data: { position },
      });
    }
    return true;
  });
}
