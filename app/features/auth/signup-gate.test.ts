// @vitest-environment node

import { RouterContextProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAuthSettings } from "./auth-settings.server";

import { action } from "~/routes/api.auth.$";
import { loader as checkInboxLoader } from "~/routes/check-your-inbox";
import { loader as joinLoader } from "~/routes/join";

const mocks = vi.hoisted(() => ({ handler: vi.fn() }));

vi.mock("~/features/auth/auth.server", () => ({
  auth: { handler: mocks.handler },
  googleAuthEnabled: true,
}));

const DELEGATED = new Response("delegated");

afterEach(() => {
  resetAuthSettings();
  mocks.handler.mockReset();
});

function post(path: string) {
  mocks.handler.mockResolvedValue(DELEGATED);
  return action({
    request: new Request(`http://localhost:3000${path}`, { method: "POST" }),
    context: new RouterContextProvider(),
  } as unknown as Parameters<typeof action>[0]);
}

describe("better-auth endpoint gate", () => {
  it("refuses self sign-up with a 403, since accounts are invite-only", async () => {
    const response = await post("/api/auth/sign-up/email");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "SIGNUP_DISABLED",
    });
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it("leaves every other endpoint alone", async () => {
    for (const path of [
      "/api/auth/sign-in/email",
      "/api/auth/sign-in/social",
      "/api/auth/forget-password",
    ]) {
      await expect(post(path)).resolves.toBe(DELEGATED);
    }
  });
});

describe("old sign-up pages", () => {
  it("send people to the login page", () => {
    for (const loader of [joinLoader, checkInboxLoader]) {
      const response = loader();
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/login");
    }
  });
});
