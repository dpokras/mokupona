// @vitest-environment node

import { RouterContextProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { buildEventData } from "../../../test/factories";

import { prisma } from "~/db.server";
import {
  HONEYPOT_FIELD_NAME,
  HONEYPOT_RETRY_MESSAGE,
  HONEYPOT_VALID_FROM_FIELD_NAME,
} from "~/features/forms/honeypot";
import { getHoneypotInputProps } from "~/features/forms/honeypot.server";
import { dinnerTexts } from "~/features/site-content/catalog/dinner";
import { saveCategoryTexts } from "~/features/site-content/site-texts.server";
import { createEvent } from "~/models/event.server";
import { getCurrentFormVersion } from "~/models/form.server";
import { action } from "~/routes/dinners_.$dinnerId";
import { getToast } from "~/utils/toast.server";

async function createDinner() {
  const event = await createEvent(await buildEventData());
  const version = await getCurrentFormVersion(event.formId);

  return { dinnerId: event.id, versionId: version.id };
}

// every browser submission carries the spam-trap fields — with the trap
// itself left blank — so tests of the rest of the action must too
function fromBrowser(body: Record<string, string> = {}) {
  return {
    [HONEYPOT_FIELD_NAME]: "",
    [HONEYPOT_VALID_FROM_FIELD_NAME]: getHoneypotInputProps().validFrom,
    ...body,
  };
}

function answers(versionId: string) {
  return {
    formVersionId: versionId,
    name: "Ada Signer",
    email: "ada@example.com",
    phone: "0791234567",
    acceptedPrivacy: "on",
  };
}

function submit(dinnerId: string, body: Record<string, string>) {
  return action({
    params: { dinnerId },
    request: new Request(`http://localhost:3000/dinners/${dinnerId}`, {
      method: "POST",
      body: new URLSearchParams(body),
    }),
    context: new RouterContextProvider(),
  } as unknown as Parameters<typeof action>[0]);
}

function storedFor(formVersionId: string) {
  return prisma.formSubmission.findMany({ where: { formVersionId } });
}

function expectSuccessRedirect(result: Awaited<ReturnType<typeof action>>) {
  expect(result).toBeInstanceOf(Response);
  const response = result as Response;
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/dinners");
}

async function readToast(result: Awaited<ReturnType<typeof action>>) {
  const cookie = (result as Response).headers.get("set-cookie") ?? "";
  const { toast } = await getToast(
    new Request("http://localhost:3000/dinners", {
      headers: { cookie: cookie.split(";")[0] },
    }),
  );
  return toast;
}

function readFormErrors(result: Awaited<ReturnType<typeof action>>) {
  const reply = result as { error?: Record<string, string[] | null> | null };
  return reply.error?.[""] ?? [];
}

afterEach(async () => {
  await saveCategoryTexts("dinner", {
    signupSuccessTitle: dinnerTexts.entries.signupSuccessTitle.default,
  });
});

describe("dinner signup action", () => {
  it("stores a submission carrying a freshly minted stamp", async () => {
    const { dinnerId, versionId } = await createDinner();

    expectSuccessRedirect(
      await submit(dinnerId, fromBrowser(answers(versionId))),
    );

    const stored = await storedFor(versionId);
    expect(stored).toHaveLength(1);
    expect(stored[0].answers).toMatchObject({
      name: "Ada Signer",
      email: "ada@example.com",
    });
  });

  it("answers a filled spam trap with the success redirect", async () => {
    const { dinnerId, versionId } = await createDinner();

    const result = await submit(dinnerId, {
      ...fromBrowser(answers(versionId)),
      [HONEYPOT_FIELD_NAME]: "https://buy-cheap-pills.example",
    });

    // indistinguishable from the real thing, and nothing was written
    expectSuccessRedirect(result);
    expect(await storedFor(versionId)).toHaveLength(0);
  });

  it("answers a filled spam trap the same way when nothing else validates", async () => {
    const { dinnerId, versionId } = await createDinner();

    // the trap is read before the answers are, so a bot cannot tell a
    // rejected payload apart from an accepted one
    const result = await submit(dinnerId, {
      [HONEYPOT_FIELD_NAME]: "https://buy-cheap-pills.example",
    });

    expectSuccessRedirect(result);
    expect(await storedFor(versionId)).toHaveLength(0);
  });

  it("asks for a retry when the stamp cannot be verified", async () => {
    const { dinnerId, versionId } = await createDinner();

    // what a tab that outlived a deploy sends: an empty trap, a stamp this
    // process cannot vouch for. A person, so the answers must come back on
    // screen instead of vanishing into the fake success.
    const result = await submit(dinnerId, {
      ...fromBrowser(answers(versionId)),
      [HONEYPOT_VALID_FROM_FIELD_NAME]: `${Date.now()}.stale-signature`,
    });

    expect(readFormErrors(result)).toEqual([HONEYPOT_RETRY_MESSAGE]);
    expect(await storedFor(versionId)).toHaveLength(0);
  });

  it("confirms with the admin's texts, for real and trapped signups alike", async () => {
    await saveCategoryTexts("dinner", { signupSuccessTitle: "you're in" });
    const { dinnerId, versionId } = await createDinner();

    const real = await submit(dinnerId, fromBrowser(answers(versionId)));
    const trapped = await submit(dinnerId, {
      ...fromBrowser(answers(versionId)),
      [HONEYPOT_FIELD_NAME]: "https://buy-cheap-pills.example",
    });

    expect(await readToast(real)).toEqual({
      title: "you're in",
      description: dinnerTexts.entries.signupSuccessBody.default,
      type: "success",
    });
    expect(await readToast(trapped)).toEqual(await readToast(real));
  });
});
