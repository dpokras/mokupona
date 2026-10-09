import { afterEach, describe, expect, it } from "vitest";

import {
  createPageView,
  getOrCreateVisitSalt,
  getPageViewStats,
  type PageViewData,
} from "./page-view.server";

import { prisma } from "~/db.server";

afterEach(async () => {
  await prisma.pageView.deleteMany();
  await prisma.visitSalt.deleteMany();
});

function view(overrides: Partial<PageViewData> = {}): PageViewData {
  return {
    day: "2026-03-10",
    path: "/",
    referrer: null,
    visitorId: "visitor-a",
    device: "desktop",
    ...overrides,
  };
}

async function store(views: PageViewData[]) {
  for (const data of views) await createPageView(data);
}

describe("getPageViewStats", () => {
  it("counts views and distinct visitors per day, filling days without views", async () => {
    await store([
      view({ visitorId: "a" }),
      view({ visitorId: "a", path: "/dinners" }),
      view({ visitorId: "b" }),
      view({ day: "2026-03-12", visitorId: "a" }),
      view({ day: "2026-03-09", visitorId: "before" }),
      view({ day: "2026-03-13", visitorId: "after" }),
    ]);

    const stats = await getPageViewStats({
      from: "2026-03-10",
      to: "2026-03-12",
    });

    expect(stats.days).toEqual([
      { day: "2026-03-10", views: 3, visitors: 2 },
      { day: "2026-03-11", views: 0, visitors: 0 },
      { day: "2026-03-12", views: 1, visitors: 1 },
    ]);
    expect(stats.totalViews).toBe(4);
    // the same id on two days counts on both: ids are per day by design
    expect(stats.dailyVisitors).toBe(3);
    expect(stats.firstDay).toBe("2026-03-09");
  });

  it("ranks pages and referrers by views within the range", async () => {
    await store([
      view({ path: "/dinners", referrer: "instagram.com" }),
      view({ path: "/dinners", referrer: "instagram.com" }),
      view({ path: "/dinners", referrer: "google.com" }),
      view({ path: "/about" }),
      view({ path: "/gallery" }),
      view({ path: "/gallery" }),
      view({ day: "2026-01-01", path: "/faq", referrer: "duckduckgo.com" }),
    ]);

    const stats = await getPageViewStats({
      from: "2026-03-01",
      to: "2026-03-31",
    });

    expect(stats.topPages).toEqual([
      { path: "/dinners", views: 3 },
      { path: "/gallery", views: 2 },
      { path: "/about", views: 1 },
    ]);
    expect(stats.topReferrers).toEqual([
      { host: "instagram.com", views: 2 },
      { host: "google.com", views: 1 },
    ]);
  });

  it("splits views by device, listing every device", async () => {
    await store([
      view({ device: "mobile" }),
      view({ device: "mobile" }),
      view({ device: "desktop" }),
    ]);

    const stats = await getPageViewStats({
      from: "2026-03-10",
      to: "2026-03-10",
    });

    expect(stats.devices).toEqual([
      { device: "mobile", views: 2 },
      { device: "tablet", views: 0 },
      { device: "desktop", views: 1 },
    ]);
  });

  it("reports an empty range", async () => {
    const stats = await getPageViewStats({
      from: "2026-03-10",
      to: "2026-03-11",
    });

    expect(stats.totalViews).toBe(0);
    expect(stats.days.map(({ views }) => views)).toEqual([0, 0]);
    expect(stats.topPages).toEqual([]);
    expect(stats.firstDay).toBeNull();
  });
});

describe("getOrCreateVisitSalt", () => {
  it("keeps one salt per day", async () => {
    const first = await getOrCreateVisitSalt("2026-03-10", "2025-02-10");
    const again = await getOrCreateVisitSalt("2026-03-10", "2025-02-10");

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(again).toBe(first);
  });

  it("a new day's salt deletes earlier salts and page views past retention", async () => {
    await getOrCreateVisitSalt("2026-03-09", "2025-02-09");
    await store([
      view({ day: "2025-02-09", path: "/expired" }),
      view({ day: "2025-02-10", path: "/kept" }),
    ]);

    const today = await getOrCreateVisitSalt("2026-03-10", "2025-02-10");

    expect(await prisma.visitSalt.findMany()).toEqual([
      expect.objectContaining({ day: "2026-03-10", salt: today }),
    ]);
    const paths = await prisma.pageView.findMany({ select: { path: true } });
    expect(paths).toEqual([{ path: "/kept" }]);
  });
});
