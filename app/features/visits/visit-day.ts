import { EVENT_TIMEZONE } from "~/features/events/timezone";

const zurichDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: EVENT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day (YYYY-MM-DD) in Zurich at `date`. */
export function zurichDay(date: Date): string {
  const parts = Object.fromEntries(
    zurichDayFormat.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toUtcDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function fromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const date = toUtcDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

/** Clamps to the end of a shorter month: 31 March minus a month is 28 Feb. */
export function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const lastOfTarget = new Date(Date.UTC(year, month - 1 + months + 1, 0));
  return fromUtcDate(
    new Date(
      Date.UTC(
        lastOfTarget.getUTCFullYear(),
        lastOfTarget.getUTCMonth(),
        Math.min(date, lastOfTarget.getUTCDate()),
      ),
    ),
  );
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

export const VISIT_RETENTION_MONTHS = 13;

/** Page views from before this day are deleted. */
export function visitRetentionStart(today: string): string {
  return addMonths(today, -VISIT_RETENTION_MONTHS);
}
