import type { Route } from "./+types/admin.dinners.$dinnerId.[signups.csv]";

import {
  getAttendeeRosterForEvent,
  type Attendee,
  type RosterColumn,
} from "~/features/signup-form/read.server";
import { getEventById } from "~/models/event.server";
import { contentDispositionAttachment } from "~/shared/content-disposition.server";
import { buildCSVObject } from "~/shared/csv-builder.server";
import { requireFound } from "~/shared/http.server";

export async function loader({ params }: Route.LoaderArgs) {
  const { dinnerId } = params;

  const [event, { attendees, columns }] = await Promise.all([
    getEventById(dinnerId).then(requireFound),
    getAttendeeRosterForEvent(dinnerId),
  ]);

  const data = buildCSVObject(
    columns.map((column) => column.label),
    attendees.map((attendee) => toCsvRow(attendee, columns)),
  );

  const filename = `${event.title.split(" ").join("-")}-signups.csv`;

  return new Response(data.data, {
    headers: {
      "Content-Type": data.mimeType,
      "Content-Length": `${data.size}`,
      "Content-Disposition": contentDispositionAttachment(filename),
      "Cache-Control": "private, no-store",
    },
  });
}

function toCsvRow(attendee: Attendee, columns: RosterColumn[]) {
  return columns.map((column) => formatAnswer(attendee.answers[column.name]));
}

function formatAnswer(value: string | boolean | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return value;
}
