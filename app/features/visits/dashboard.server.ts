import type { VisitDevice } from "./device";
import type { VisitRangeId } from "./ranges";
import { addDays, addMonths, zurichDay } from "./visit-day";

import { getEventTitles } from "~/models/event.server";
import {
  getPageViewStats,
  type DailyPageViews,
} from "~/models/page-view.server";

export interface VisitBar {
  key: string;
  axisLabel: string;
  title: string;
  views: number;
  detail: string;
}

export interface VisitDashboard {
  periodLabel: string;
  trackingSince: string | null;
  totalViews: number;
  avgDailyVisitors: number;
  chart: { unit: "day" | "month"; bars: VisitBar[] };
  topPages: { path: string; title: string | null; views: number }[];
  topReferrers: { host: string; views: number }[];
  devices: { device: VisitDevice; views: number; share: number }[];
}

const utc = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });

const dayAxisFormat = utc({ day: "numeric", month: "short" });
const dayTitleFormat = utc({
  weekday: "short",
  day: "numeric",
  month: "short",
});
const monthAxisFormat = utc({ month: "short" });
const monthTitleFormat = utc({ month: "long", year: "numeric" });
const fullDateFormat = utc({ day: "numeric", month: "short", year: "numeric" });
const decimalFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
});

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

function rangeBounds(range: VisitRangeId, today: string) {
  switch (range) {
    case "7d":
      return { from: addDays(today, -6), unit: "day" as const };
    case "30d":
      return { from: addDays(today, -29), unit: "day" as const };
    case "90d":
      return { from: addDays(today, -89), unit: "day" as const };
    case "12m":
      return {
        from: addMonths(`${today.slice(0, 7)}-01`, -11),
        unit: "month" as const,
      };
  }
}

const DINNER_PATH = /^\/dinners\/([^/]+)(\/gallery)?$/;

async function withPageTitles(pages: { path: string; views: number }[]) {
  const matches = pages.map(({ path }) => DINNER_PATH.exec(path));
  const ids = matches.flatMap((match) => (match ? [match[1]] : []));
  const titles = new Map(
    (ids.length > 0 ? await getEventTitles(ids) : []).map((event) => [
      event.id,
      event.title,
    ]),
  );

  return pages.map((page, index) => {
    const match = matches[index];
    const title = match ? titles.get(match[1]) : undefined;
    return {
      ...page,
      title: title ? `${title}${match?.[2] ? " · gallery" : ""}` : null,
    };
  });
}

function countedDays(days: DailyPageViews[], firstDay: string | null) {
  return firstDay ? days.filter(({ day }) => day >= firstDay) : [];
}

function averageVisitors(days: DailyPageViews[]) {
  if (days.length === 0) return 0;
  return days.reduce((sum, day) => sum + day.visitors, 0) / days.length;
}

function plural(count: number, word: string) {
  return `${decimalFormat.format(count)} ${word}${count === 1 ? "" : "s"}`;
}

const NOT_COUNTED = "not counted yet";

function dayBars(days: DailyPageViews[], firstDay: string | null): VisitBar[] {
  return days.map(({ day, views, visitors }) => ({
    key: day,
    axisLabel: dayAxisFormat.format(asDate(day)),
    title: dayTitleFormat.format(asDate(day)),
    views,
    detail:
      firstDay && day >= firstDay ? plural(visitors, "visitor") : NOT_COUNTED,
  }));
}

function monthBars(
  days: DailyPageViews[],
  firstDay: string | null,
): VisitBar[] {
  const months = new Map<string, DailyPageViews[]>();
  for (const day of days) {
    const month = day.day.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), day]);
  }

  return [...months].map(([month, monthDays]) => {
    const start = asDate(`${month}-01`);
    const counted = countedDays(monthDays, firstDay);
    return {
      key: month,
      axisLabel: monthAxisFormat.format(start),
      title: monthTitleFormat.format(start),
      views: monthDays.reduce((sum, day) => sum + day.views, 0),
      detail:
        counted.length > 0
          ? `${plural(averageVisitors(counted), "visitor")} a day`
          : NOT_COUNTED,
    };
  });
}

export async function loadVisitDashboard(
  range: VisitRangeId,
  now: Date,
): Promise<VisitDashboard> {
  const to = zurichDay(now);
  const { from, unit } = rangeBounds(range, to);
  const stats = await getPageViewStats({ from, to });

  return {
    periodLabel: `${fullDateFormat.format(asDate(from))} – ${fullDateFormat.format(asDate(to))}`,
    trackingSince: stats.firstDay
      ? fullDateFormat.format(asDate(stats.firstDay))
      : null,
    totalViews: stats.totalViews,
    avgDailyVisitors: averageVisitors(countedDays(stats.days, stats.firstDay)),
    chart: {
      unit,
      bars:
        unit === "day"
          ? dayBars(stats.days, stats.firstDay)
          : monthBars(stats.days, stats.firstDay),
    },
    topPages: await withPageTitles(stats.topPages),
    topReferrers: stats.topReferrers,
    devices: stats.devices.map(({ device, views }) => ({
      device,
      views,
      share: stats.totalViews > 0 ? views / stats.totalViews : 0,
    })),
  };
}
