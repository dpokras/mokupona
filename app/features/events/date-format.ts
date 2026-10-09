import { EVENT_TIMEZONE } from "./timezone";

const eventTimeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: EVENT_TIMEZONE,
});

const longDayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: EVENT_TIMEZONE,
});

const eventShortDayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: EVENT_TIMEZONE,
});

const adminDateFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: EVENT_TIMEZONE,
});

const adminTimestampDayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: EVENT_TIMEZONE,
});

const eventMonthYearFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: EVENT_TIMEZONE,
});

const eventDayMonthFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: EVENT_TIMEZONE,
});

export function formatEventDateLine(date: Date, weekday: "long" | "short") {
  const dayLine =
    weekday === "long"
      ? longDayFormat.format(date)
      : eventShortDayFormat.format(date);

  return `${dayLine} · ${eventTimeFormat.format(date)}`.toLowerCase();
}

export function formatAdminDateLine(date: Date) {
  const dayLine = adminDateFormat.format(date);

  return `${dayLine} · ${eventTimeFormat.format(date)}`;
}

export function formatAdminDate(date: Date) {
  return adminDateFormat.format(date);
}

export function formatAdminTimestamp(date: Date) {
  const dayMonth = adminTimestampDayFormat.format(date);

  return `${dayMonth}, ${eventTimeFormat.format(date)}`;
}

export function formatEventMonthYear(date: Date) {
  return eventMonthYearFormat.format(date).toLowerCase();
}

export function formatEventDayMonth(date: Date) {
  return eventDayMonthFormat.format(date).toLowerCase();
}

export function formatAdminToday(date: Date) {
  return longDayFormat.format(date);
}
