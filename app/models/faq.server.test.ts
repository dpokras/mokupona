import { beforeEach, describe, expect, it } from "vitest";

import {
  createFaqEntriesIfEmpty,
  createFaqEntry,
  deleteFaqEntry,
  getFaqEntryById,
  listFaqEntries,
  listPublishedFaqEntries,
  moveFaqEntry,
  updateFaqEntry,
  type FaqEntryData,
} from "./faq.server";

import { prisma } from "~/db.server";

function entry(question: string, published = true): FaqEntryData {
  return { question, answer: `About ${question}.`, published };
}

async function questions() {
  return (await listFaqEntries()).map((row) => row.question);
}

beforeEach(async () => {
  await prisma.faqEntry.deleteMany();
});

describe("faq entries", () => {
  it("appends new entries at the end", async () => {
    await createFaqEntry(entry("first"));
    await createFaqEntry(entry("second"));
    const third = await createFaqEntry(entry("third"));

    expect(await questions()).toEqual(["first", "second", "third"]);
    expect(third.position).toBe(2);
  });

  it("lists only published entries for the public page, in order", async () => {
    await createFaqEntry(entry("shown"));
    await createFaqEntry(entry("draft", false));
    await createFaqEntry(entry("also shown"));

    expect(await listPublishedFaqEntries()).toEqual([
      expect.objectContaining({ question: "shown", answer: "About shown." }),
      expect.objectContaining({ question: "also shown" }),
    ]);
  });

  it("orders entries that share a position by creation", async () => {
    await prisma.faqEntry.create({
      data: { ...entry("older"), position: 0, createdAt: new Date(1000) },
    });
    await prisma.faqEntry.create({
      data: { ...entry("newer"), position: 0, createdAt: new Date(2000) },
    });

    expect(await questions()).toEqual(["older", "newer"]);
  });

  it("returns null for a missing entry", async () => {
    expect(await getFaqEntryById("missing")).toBeNull();
  });

  it("updates an entry and reports a missing one", async () => {
    const created = await createFaqEntry(entry("before"));

    expect(
      await updateFaqEntry(created.id, {
        question: "after",
        answer: "New answer.",
        published: false,
      }),
    ).toBe(true);
    expect(await getFaqEntryById(created.id)).toMatchObject({
      question: "after",
      answer: "New answer.",
      published: false,
      position: created.position,
    });

    expect(await updateFaqEntry("missing", entry("x"))).toBe(false);
  });

  it("deletes an entry and reports a missing one", async () => {
    const created = await createFaqEntry(entry("gone"));

    expect(await deleteFaqEntry(created.id)).toBe(true);
    expect(await getFaqEntryById(created.id)).toBeNull();
    expect(await deleteFaqEntry(created.id)).toBe(false);
  });
});

describe("moveFaqEntry", () => {
  it("swaps an entry with its neighbour", async () => {
    await createFaqEntry(entry("a"));
    const b = await createFaqEntry(entry("b"));
    await createFaqEntry(entry("c"));

    expect(await moveFaqEntry(b.id, "up")).toBe(true);
    expect(await questions()).toEqual(["b", "a", "c"]);

    expect(await moveFaqEntry(b.id, "down")).toBe(true);
    expect(await moveFaqEntry(b.id, "down")).toBe(true);
    expect(await questions()).toEqual(["a", "c", "b"]);
  });

  it("does nothing past either end or for a missing entry", async () => {
    const a = await createFaqEntry(entry("a"));
    const b = await createFaqEntry(entry("b"));

    expect(await moveFaqEntry(a.id, "up")).toBe(false);
    expect(await moveFaqEntry(b.id, "down")).toBe(false);
    expect(await moveFaqEntry("missing", "up")).toBe(false);
    expect(await questions()).toEqual(["a", "b"]);
  });

  it("moves entries that share a position", async () => {
    for (const [index, question] of ["a", "b", "c"].entries()) {
      await prisma.faqEntry.create({
        data: { ...entry(question), position: 0, createdAt: new Date(index) },
      });
    }
    const c = (await listFaqEntries())[2];

    expect(await moveFaqEntry(c.id, "up")).toBe(true);
    expect(await questions()).toEqual(["a", "c", "b"]);
    expect((await listFaqEntries()).map((row) => row.position)).toEqual([
      0, 1, 2,
    ]);
  });
});

describe("createFaqEntriesIfEmpty", () => {
  it("adds the entries in order when there are none", async () => {
    expect(
      await createFaqEntriesIfEmpty([entry("one", false), entry("two", false)]),
    ).toBe(2);
    expect(await questions()).toEqual(["one", "two"]);

    await createFaqEntry(entry("three"));
    expect(await questions()).toEqual(["one", "two", "three"]);
  });

  it("adds nothing once there is an entry", async () => {
    await createFaqEntry(entry("existing"));

    expect(await createFaqEntriesIfEmpty([entry("one")])).toBe(0);
    expect(await questions()).toEqual(["existing"]);
  });
});
