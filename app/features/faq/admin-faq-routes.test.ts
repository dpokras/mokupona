import type { SubmissionResult } from "@conform-to/react";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { STARTER_FAQ_QUESTIONS } from "./starter-questions";

import { prisma } from "~/db.server";
import { EM_DASH } from "~/features/site-content/text";
import {
  createFaqEntry,
  getFaqEntryById,
  listFaqEntries,
} from "~/models/faq.server";
import { action as deleteAction } from "~/routes/admin.content.faq.$entryId.delete";
import {
  action as editAction,
  loader as editLoader,
} from "~/routes/admin.content.faq.$entryId.edit";
import { action as moveAction } from "~/routes/admin.content.faq.$entryId.move";
import { action as newAction } from "~/routes/admin.content.faq.new";
import { action as starterAction } from "~/routes/admin.content.faq.starter-questions";

function routeArgs<Args>(
  path: string,
  params: Record<string, string>,
  body?: Record<string, string>,
): Args {
  return {
    params,
    request: new Request(`http://localhost:3000${path}`, {
      method: "POST",
      body: new URLSearchParams(body),
    }),
    context: new RouterContextProvider(),
  } as unknown as Args;
}

async function thrown(promise: Promise<unknown>): Promise<Response> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Response);
  return error as Response;
}

async function questions() {
  return (await listFaqEntries()).map((entry) => entry.question);
}

function draft(question: string) {
  return { question, answer: `About ${question}.`, published: true };
}

beforeEach(async () => {
  await prisma.faqEntry.deleteMany();
});

describe("new FAQ question", () => {
  it("adds a published question at the end", async () => {
    await createFaqEntry(draft("first"));

    const result = await newAction(
      routeArgs(
        "/admin/content/faq/new",
        {},
        {
          question: "  can i come alone?  ",
          answer: "yes.\r\n\r\nmost people do.",
          published: "on",
        },
      ),
    );

    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe(
      "/admin/content/faq",
    );
    const entries = await listFaqEntries();
    expect(entries.map((entry) => entry.question)).toEqual([
      "first",
      "can i come alone?",
    ]);
    expect(entries[1]).toMatchObject({
      answer: "yes.\n\nmost people do.",
      published: true,
    });
  });

  it("keeps an unticked question as a draft", async () => {
    await newAction(
      routeArgs(
        "/admin/content/faq/new",
        {},
        {
          question: "a draft?",
          answer: "not yet.",
        },
      ),
    );

    expect(await listFaqEntries()).toEqual([
      expect.objectContaining({ question: "a draft?", published: false }),
    ]);
  });

  it("rejects em dashes, line breaks in the question and empty answers", async () => {
    const result = (await newAction(
      routeArgs(
        "/admin/content/faq/new",
        {},
        {
          question: "one\ntwo",
          answer: "",
        },
      ),
    )) as SubmissionResult;

    expect(result.error?.question).toEqual(["Keep this to a single line."]);
    expect(result.error?.answer).toEqual(["This text can't be empty."]);

    const dashed = (await newAction(
      routeArgs(
        "/admin/content/faq/new",
        {},
        {
          question: "when?",
          answer: `soon ${EM_DASH} very soon`,
        },
      ),
    )) as SubmissionResult;

    expect(dashed.error?.answer?.[0]).toMatch(/em dashes/i);
    expect(await listFaqEntries()).toEqual([]);
  });
});

describe("edit FAQ question", () => {
  it("loads and saves the question", async () => {
    const entry = await createFaqEntry(draft("old"));
    const path = `/admin/content/faq/${entry.id}/edit`;

    expect(await editLoader(routeArgs(path, { entryId: entry.id }))).toEqual({
      entry: { question: "old", answer: "About old.", published: true },
    });

    const result = await editAction(
      routeArgs(
        path,
        { entryId: entry.id },
        {
          question: "new",
          answer: "A new answer.",
        },
      ),
    );

    expect((result as Response).status).toBe(302);
    expect(await getFaqEntryById(entry.id)).toMatchObject({
      question: "new",
      answer: "A new answer.",
      published: false,
    });
  });

  it("is not found for a missing question", async () => {
    const path = "/admin/content/faq/missing/edit";

    expect(
      (await thrown(editLoader(routeArgs(path, { entryId: "missing" }))))
        .status,
    ).toBe(404);
    expect(
      (
        await thrown(
          editAction(
            routeArgs(
              path,
              { entryId: "missing" },
              {
                question: "q",
                answer: "a",
              },
            ),
          ),
        )
      ).status,
    ).toBe(404);
  });
});

describe("move and delete FAQ questions", () => {
  it("moves a question up and down", async () => {
    await createFaqEntry(draft("a"));
    const b = await createFaqEntry(draft("b"));
    const path = `/admin/content/faq/${b.id}/move`;

    await moveAction(routeArgs(path, { entryId: b.id }, { direction: "up" }));
    expect(await questions()).toEqual(["b", "a"]);

    await moveAction(routeArgs(path, { entryId: b.id }, { direction: "down" }));
    expect(await questions()).toEqual(["a", "b"]);
  });

  it("refuses an unknown direction", async () => {
    const entry = await createFaqEntry(draft("a"));

    const response = await thrown(
      moveAction(
        routeArgs(
          `/admin/content/faq/${entry.id}/move`,
          { entryId: entry.id },
          {
            direction: "sideways",
          },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("deletes a question", async () => {
    const entry = await createFaqEntry(draft("gone"));

    const result = await deleteAction(
      routeArgs(`/admin/content/faq/${entry.id}/delete`, {
        entryId: entry.id,
      }),
    );

    expect(result.status).toBe(302);
    expect(await listFaqEntries()).toEqual([]);
  });
});

describe("starter questions", () => {
  it("adds them as drafts to an empty FAQ, once", async () => {
    await starterAction();
    await starterAction();

    const entries = await listFaqEntries();
    expect(entries.map((entry) => entry.question)).toEqual(
      STARTER_FAQ_QUESTIONS.map((entry) => entry.question),
    );
    expect(entries.every((entry) => !entry.published)).toBe(true);
  });

  it("leaves an FAQ with questions alone", async () => {
    await createFaqEntry(draft("mine"));

    await starterAction();

    expect(await questions()).toEqual(["mine"]);
  });
});
