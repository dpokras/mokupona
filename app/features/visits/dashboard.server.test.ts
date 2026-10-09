import { afterEach, describe, expect, it } from "vitest";

import { buildEventData } from "../../../test/factories";

import { loadVisitDashboard } from "./dashboard.server";

import { prisma } from "~/db.server";
import { createEvent, deleteEvent } from "~/models/event.server";
import { createPageView } from "~/models/page-view.server";

const NOW = new Date("2026-10-08T10:00:00Z");

afterEach(async () => {
  await prisma.pageView.deleteMany();
});

async function visit(day: string, visitorId: string, path = "/") {
  await createPageView({
    day,
    path,
    referrer: null,
    visitorId,
    device: "mobile",
  });
}

describe("loadVisitDashboard", () => {
  it("shows one bar per day and averages visitors over the days since counting began", async () => {
    await visit("2026-10-07", "a");
    await visit("2026-10-07", "b");
    await visit("2026-10-08", "a");
    await visit("2026-10-08", "a", "/dinners");

    const dashboard = await loadVisitDashboard("7d", NOW);

    expect(dashboard.chart.unit).toBe("day");
    expect(dashboard.chart.bars.map(({ key }) => key)).toEqual([
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    expect(dashboard.chart.bars.at(-1)).toMatchObject({
      title: "Thu 8 Oct",
      views: 2,
      detail: "1 visitor",
    });
    expect(dashboard.totalViews).toBe(4);
    expect(dashboard.avgDailyVisitors).toBe(1.5);
    expect(dashboard.trackingSince).toBe("7 Oct 2026");
    expect(dashboard.devices[0]).toEqual({
      device: "mobile",
      views: 4,
      share: 1,
    });
  });

  it("groups twelve calendar months into monthly bars", async () => {
    await visit("2025-11-01", "a");
    await visit("2025-11-30", "b");
    await visit("2026-10-08", "c");

    const dashboard = await loadVisitDashboard("12m", NOW);

    const { bars } = dashboard.chart;
    expect(dashboard.chart.unit).toBe("month");
    expect(bars).toHaveLength(12);
    expect(bars[0]).toMatchObject({
      key: "2025-11",
      axisLabel: "Nov",
      title: "November 2025",
      views: 2,
    });
    expect(bars.at(-1)).toMatchObject({ key: "2026-10", views: 1 });
  });

  it("names dinner pages by the dinner's title", async () => {
    const dinner = await createEvent(await buildEventData());
    try {
      await visit("2026-10-08", "a", `/dinners/${dinner.id}`);
      await visit("2026-10-08", "a", `/dinners/${dinner.id}/gallery`);
      await visit("2026-10-08", "a", "/dinners/gone");

      const { topPages } = await loadVisitDashboard("7d", NOW);

      expect(topPages).toEqual([
        { path: `/dinners/${dinner.id}`, title: dinner.title, views: 1 },
        {
          path: `/dinners/${dinner.id}/gallery`,
          title: `${dinner.title} · gallery`,
          views: 1,
        },
        { path: "/dinners/gone", title: null, views: 1 },
      ]);
    } finally {
      await deleteEvent(dinner.id);
    }
  });

  it("marks days before counting began", async () => {
    await visit("2026-10-07", "a");

    const { chart } = await loadVisitDashboard("7d", NOW);

    expect(chart.bars.map(({ detail }) => detail)).toEqual([
      ...Array(5).fill("not counted yet"),
      "1 visitor",
      "0 visitors",
    ]);
  });
});
