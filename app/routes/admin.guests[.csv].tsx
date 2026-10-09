import { EVENT_TIMEZONE } from "~/features/events/timezone";
import { getGuests } from "~/features/guests/guests.server";
import { contentDispositionAttachment } from "~/shared/content-disposition.server";
import { buildCSVObject } from "~/shared/csv-builder.server";

const HEADER = [
  "Name",
  "Email",
  "Phone",
  "Dinners",
  "First dinner",
  "First dinner date",
  "Latest dinner",
  "Latest dinner date",
];

const isoDayFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: EVENT_TIMEZONE,
});

export async function loader() {
  const guests = await getGuests();

  const data = buildCSVObject(
    HEADER,
    guests.map((guest) => [
      guest.name,
      guest.email,
      guest.phone,
      String(guest.dinnerCount),
      guest.firstDinner.title,
      isoDayFormat.format(guest.firstDinner.date),
      guest.lastDinner.title,
      isoDayFormat.format(guest.lastDinner.date),
    ]),
  );

  return new Response(data.data, {
    headers: {
      "Content-Type": data.mimeType,
      "Content-Length": `${data.size}`,
      "Content-Disposition": contentDispositionAttachment("guests.csv"),
      "Cache-Control": "private, no-store",
    },
  });
}
