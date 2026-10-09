// @vitest-environment node

import { RouterContextProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { signedInRequest } from "../../../test/auth-session";
import { ensureAuthRoles } from "../../../test/factories";

import { prisma } from "~/db.server";
import { resolveOptionalUserMiddleware } from "~/features/auth/middleware.server";
import { action } from "~/routes/api.pageview";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

beforeAll(async () => {
  await ensureAuthRoles();
});

afterEach(async () => {
  vi.useRealTimers();
  await prisma.pageView.deleteMany();
  await prisma.visitSalt.deleteMany();
});

function beacon(
  body: unknown,
  {
    userAgent = CHROME,
    ip = "203.0.113.9",
    headers = {},
  }: { userAgent?: string; ip?: string; headers?: Record<string, string> } = {},
) {
  return new Request("https://mokupona.ch/api/pageview", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "User-Agent": userAgent,
      "Fly-Client-IP": ip,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function send(request: Request) {
  const context = new RouterContextProvider();
  await resolveOptionalUserMiddleware(
    {
      request,
      context,
      params: {},
      url: new URL(request.url),
      pattern: "/api/pageview",
    },
    async () => new Response(null),
  );
  const response = await action({
    request,
    context,
    params: {},
  } as unknown as Parameters<typeof action>[0]);
  expect(response.status).toBe(204);
}

function storedViews() {
  return prisma.pageView.findMany({ orderBy: { createdAt: "asc" } });
}

function at(isoTime: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoTime));
}

describe("page view beacon endpoint", () => {
  it("stores the Zurich day, path, device and a short visitor id, but no IP", async () => {
    at("2026-03-10T23:30:00Z");

    await send(beacon({ path: "/dinners/" }, { userAgent: IPHONE }));

    const [stored] = await storedViews();
    expect(stored).toMatchObject({
      day: "2026-03-11",
      path: "/dinners",
      referrer: null,
      device: "mobile",
    });
    expect(stored.visitorId).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(stored)).not.toContain("203.0.113.9");
  });

  it("ignores bots", async () => {
    await send(beacon({ path: "/" }, { userAgent: GOOGLEBOT }));
    await send(beacon({ path: "/" }, { userAgent: "" }));

    expect(await storedViews()).toEqual([]);
  });

  it("ignores pages outside the public site", async () => {
    for (const path of ["/admin", "/admin/visits", "/login", "/me", "/api/x"]) {
      await send(beacon({ path }));
    }

    expect(await storedViews()).toEqual([]);
  });

  it("ignores signed-in users", async () => {
    const { request } = await signedInRequest({
      roleName: "admin",
      path: "/api/pageview",
    });

    await send(
      beacon(
        { path: "/" },
        { headers: { cookie: request.headers.get("cookie") ?? "" } },
      ),
    );

    expect(await storedViews()).toEqual([]);
  });

  it("ignores browsers that opt out of tracking or post from another site", async () => {
    await send(beacon({ path: "/" }, { headers: { DNT: "1" } }));
    await send(beacon({ path: "/" }, { headers: { "Sec-GPC": "1" } }));
    await send(
      beacon({ path: "/" }, { headers: { "Sec-Fetch-Site": "cross-site" } }),
    );

    expect(await storedViews()).toEqual([]);
  });

  it("reduces the referrer to its host and drops the site's own", async () => {
    await send(
      beacon({
        path: "/",
        referrer: "https://www.instagram.com/p/abc?utm_source=story",
      }),
    );
    await send(beacon({ path: "/", referrer: "https://mokupona.ch/about" }));
    await send(beacon({ path: "/", referrer: "android-app://com.google" }));
    await send(beacon({ path: "/", referrer: "not a url" }));

    const referrers = (await storedViews()).map(({ referrer }) => referrer);
    expect(referrers).toEqual(["instagram.com", null, null, null]);
  });

  it("gives the same browser the same id all day, and others a different one", async () => {
    at("2026-03-10T08:00:00Z");
    await send(beacon({ path: "/" }));
    at("2026-03-10T21:00:00Z");
    await send(beacon({ path: "/gallery" }));
    await send(beacon({ path: "/" }, { ip: "198.51.100.7" }));
    await send(beacon({ path: "/" }, { userAgent: IPHONE }));

    const ids = (await storedViews()).map(({ visitorId }) => visitorId);
    expect(ids[1]).toBe(ids[0]);
    expect(new Set(ids).size).toBe(3);
  });

  it("gives the same browser a new id the next day and forgets the old salt", async () => {
    at("2026-03-10T12:00:00Z");
    await send(beacon({ path: "/" }));
    at("2026-03-11T12:00:00Z");
    await send(beacon({ path: "/" }));

    const [first, second] = await storedViews();
    expect([first.day, second.day]).toEqual(["2026-03-10", "2026-03-11"]);
    expect(second.visitorId).not.toBe(first.visitorId);
    expect(await prisma.visitSalt.findMany({ select: { day: true } })).toEqual([
      { day: "2026-03-11" },
    ]);
  });

  it("answers 204 and stores nothing for malformed payloads", async () => {
    for (const body of [
      "not json",
      "",
      {},
      { path: "dinners" },
      { path: "/dinners?id=1" },
      { path: "/dinners#top" },
      { path: `/${"a".repeat(300)}` },
      { path: "/", referrer: 42 },
      { path: "/", padding: "x".repeat(5000) },
    ]) {
      await send(beacon(body));
    }

    expect(await storedViews()).toEqual([]);
  });
});
