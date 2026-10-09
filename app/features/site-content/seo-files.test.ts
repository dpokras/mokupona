// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildEventData } from "../../../test/factories";

import { createEvent } from "~/models/event.server";
import { loader as robotsLoader } from "~/routes/[robots.txt]";
import { loader as sitemapLoader } from "~/routes/[sitemap.xml]";

const ORIGIN = "https://mokupona.ch";

function args(path: string) {
  return {
    request: new Request(`${ORIGIN}${path}`),
  } as Parameters<typeof robotsLoader>[0] & Parameters<typeof sitemapLoader>[0];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots.txt", () => {
  it("keeps private pages out and points at the sitemap", async () => {
    vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
    const text = await robotsLoader(args("/robots.txt")).text();

    expect(text).toContain("Disallow: /admin");
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it("blocks everything when indexing is switched off", async () => {
    vi.stubEnv("ALLOW_INDEXING", "false");
    const text = await robotsLoader(args("/robots.txt")).text();

    expect(text).toBe("User-agent: *\nDisallow: /\n");
  });
});

describe("sitemap.xml", () => {
  it("lists the public pages and every dinner", async () => {
    vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
    const event = await createEvent(await buildEventData());

    const xml = await (await sitemapLoader(args("/sitemap.xml"))).text();

    expect(xml).toContain(`<loc>${ORIGIN}/faq</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/dinners/${event.id}</loc>`);
    expect(xml).not.toContain("/admin");
  });
});
