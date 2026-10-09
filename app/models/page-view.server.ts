import { randomBytes } from "node:crypto";

import { prisma } from "~/db.server";
import { VISIT_DEVICES, type VisitDevice } from "~/features/visits/device";
import { daysBetween } from "~/features/visits/visit-day";

export interface PageViewData {
  day: string;
  path: string;
  referrer: string | null;
  visitorId: string;
  device: VisitDevice;
}

export interface DailyPageViews {
  day: string;
  views: number;
  visitors: number;
}

export interface PageViewStats {
  days: DailyPageViews[];
  totalViews: number;
  /** Distinct visitors per day, summed over the days of the range. */
  dailyVisitors: number;
  topPages: { path: string; views: number }[];
  topReferrers: { host: string; views: number }[];
  devices: { device: VisitDevice; views: number }[];
  /** The earliest day with any stored page view, across all time. */
  firstDay: string | null;
}

const TOP_LIMIT = 10;

async function findVisitSalt(day: string): Promise<string | null> {
  const row = await prisma.visitSalt.findUnique({
    where: { day },
    select: { salt: true },
  });
  return row?.salt ?? null;
}

/**
 * Returns the salt for `day`, creating it with the day's first page view.
 * Creating it deletes every earlier day's salt, so past visitor ids can never
 * be recomputed, and every page view from before `retainFrom`.
 */
export async function getOrCreateVisitSalt(
  day: string,
  retainFrom: string,
): Promise<string> {
  const existing = await findVisitSalt(day);
  if (existing) return existing;

  try {
    const { salt } = await prisma.visitSalt.create({
      data: { day, salt: randomBytes(32).toString("hex") },
      select: { salt: true },
    });
    await prisma.$transaction([
      prisma.visitSalt.deleteMany({ where: { day: { lt: day } } }),
      prisma.pageView.deleteMany({ where: { day: { lt: retainFrom } } }),
    ]);
    return salt;
  } catch (error) {
    // a concurrent first view of the day created it first
    const raced = await findVisitSalt(day);
    if (raced) return raced;
    throw error;
  }
}

export async function createPageView(data: PageViewData): Promise<void> {
  await prisma.pageView.create({ data, select: { id: true } });
}

/** Aggregates for the Zurich days `from` through `to`, both inclusive. */
export async function getPageViewStats({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<PageViewStats> {
  const where = { day: { gte: from, lte: to } };

  const [dailyRows, pageRows, referrerRows, deviceRows, first] =
    await Promise.all([
      prisma.$queryRaw<
        { day: string; views: number | bigint; visitors: number | bigint }[]
      >`
        SELECT "day", COUNT(*) AS "views", COUNT(DISTINCT "visitorId") AS "visitors"
        FROM "PageView"
        WHERE "day" >= ${from} AND "day" <= ${to}
        GROUP BY "day"
      `,
      prisma.pageView.groupBy({
        by: ["path"],
        where,
        _count: { _all: true },
        orderBy: [{ _count: { path: "desc" } }, { path: "asc" }],
        take: TOP_LIMIT,
      }),
      prisma.pageView.groupBy({
        by: ["referrer"],
        where: { ...where, referrer: { not: null } },
        _count: { _all: true },
        orderBy: [{ _count: { referrer: "desc" } }, { referrer: "asc" }],
        take: TOP_LIMIT,
      }),
      prisma.pageView.groupBy({
        by: ["device"],
        where,
        _count: { _all: true },
      }),
      prisma.pageView.findFirst({
        orderBy: { day: "asc" },
        select: { day: true },
      }),
    ]);

  const byDay = new Map(
    dailyRows.map((row) => [
      row.day,
      { views: Number(row.views), visitors: Number(row.visitors) },
    ]),
  );
  const days = daysBetween(from, to).map((day) => ({
    day,
    views: byDay.get(day)?.views ?? 0,
    visitors: byDay.get(day)?.visitors ?? 0,
  }));

  return {
    days,
    totalViews: days.reduce((sum, day) => sum + day.views, 0),
    dailyVisitors: days.reduce((sum, day) => sum + day.visitors, 0),
    topPages: pageRows.map((row) => ({
      path: row.path,
      views: row._count._all,
    })),
    topReferrers: referrerRows.flatMap((row) =>
      row.referrer ? [{ host: row.referrer, views: row._count._all }] : [],
    ),
    devices: VISIT_DEVICES.map((device) => ({
      device,
      views: deviceRows.find((row) => row.device === device)?._count._all ?? 0,
    })),
    firstDay: first?.day ?? null,
  };
}
