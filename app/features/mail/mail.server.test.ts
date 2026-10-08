import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { latestMailPath } from "./capture.shared";
import { createMailProvider, sendTemplate } from "./mail.server";

import { saveCategoryTexts } from "~/features/site-content/site-texts.server";

vi.hoisted(() => {
  vi.stubEnv("MAIL_PROVIDER", "console");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createMailProvider", () => {
  it.each([{}, { MAIL_PROVIDER: "console" }])(
    "defaults to the console provider (%o)",
    async (env) => {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      await createMailProvider(env).send({
        to: "a@example.com",
        subject: "one",
        text: "1",
      });

      expect(info).toHaveBeenCalledWith(
        expect.stringContaining("console provider"),
      );
    },
  );

  it("fails fast on an unknown MAIL_PROVIDER", () => {
    expect(() => createMailProvider({ MAIL_PROVIDER: "sendgrid" })).toThrow(
      /Unknown MAIL_PROVIDER "sendgrid"/,
    );
  });

  it("fails fast when resend is selected without an API key", () => {
    expect(() => createMailProvider({ MAIL_PROVIDER: "resend" })).toThrow(
      /RESEND_API_KEY/,
    );
  });

  it("creates a resend provider when the key is present", () => {
    expect(
      createMailProvider({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x" }),
    ).toHaveProperty("send");
  });
});

describe("capture provider", () => {
  it("writes each message as JSON, latest.json pointing at the newest", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mail-capture-"));
    const provider = createMailProvider({
      MAIL_PROVIDER: "capture",
      MAIL_CAPTURE_DIR: dir,
    });

    await provider.send({ to: "a@example.com", subject: "one", text: "1" });
    await provider.send({ to: "a@example.com", subject: "two", text: "2" });

    const latest = JSON.parse(
      await readFile(latestMailPath("a@example.com", dir), "utf8"),
    );
    expect(latest).toMatchObject({ subject: "two", text: "2" });
  });
});

describe("sendTemplate", () => {
  afterEach(async () => {
    await saveCategoryTexts("emails", {
      verifySubject: "Verify your email address",
    });
  });

  it("sends the email texts as an admin last saved them", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await saveCategoryTexts("emails", { verifySubject: "Welcome aboard" });

    await sendTemplate("verifyEmail", "a@example.com", {
      url: "https://mokupona.ch/verify?token=t",
    });

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Subject: Welcome aboard"),
    );
  });
});
