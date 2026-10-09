import { describe, expect, it } from "vitest";

import { buildEventData } from "../../../test/factories";

import { DEFAULT_FORM } from "./default-form";
import {
  getAttendeeRosterForEvent,
  getAttendeesForAllEvents,
  getAttendeesForEvent,
} from "./read.server";

import { prisma } from "~/db.server";
import type { FieldDescriptor } from "~/features/forms/fields";
import { createEvent } from "~/models/event.server";
import { createFormSubmission } from "~/models/form-submission.server";
import { getCurrentFormVersion, saveFormSchema } from "~/models/form.server";

const SUBMISSION_ANSWERS = {
  name: "Ada Signer",
  email: "ada@example.com",
  phone: "123456",
  vegetarian: true,
  student: false,
  restrictions: "nuts",
  comment: "party of three",
  friends: [
    {
      name: "Grace Friend",
      vegetarian: false,
      student: true,
      restrictions: "",
    },
    { name: "Alan Friend", vegetarian: true, student: false, restrictions: "" },
  ],
};

async function createEventWithSubmission() {
  const event = await createEvent(await buildEventData());
  const version = await getCurrentFormVersion(event.formId);
  await createFormSubmission({
    formVersionId: version.id,
    answers: SUBMISSION_ANSWERS,
  });
  return event;
}

describe("getAttendeesForEvent", () => {
  it("flattens a submission into signer + friends", async () => {
    const event = await createEventWithSubmission();

    const attendees = await getAttendeesForEvent(event.id);

    expect(attendees).toHaveLength(3);
    const [signer, friend1, friend2] = attendees;

    expect(signer.isSigner).toBe(true);
    expect(signer.name).toBe("Ada Signer");
    expect(signer.answers).toMatchObject({
      vegetarian: true,
      student: false,
      restrictions: "nuts",
    });

    expect(friend1.isSigner).toBe(false);
    expect(friend1.name).toBe("Grace Friend");
    expect(friend1.answers).toMatchObject({ vegetarian: false, student: true });
    expect(friend2.name).toBe("Alan Friend");

    expect(new Set(attendees.map((a) => a.submissionId)).size).toBe(1);
  });

  it("replicates submission-level answers onto every attendee", async () => {
    const event = await createEventWithSubmission();

    const attendees = await getAttendeesForEvent(event.id);

    for (const attendee of attendees) {
      expect(attendee.email).toBe("ada@example.com");
      expect(attendee.phone).toBe("123456");
      expect(attendee.answers.comment).toBe("party of three");
    }
    expect(attendees[1].answers.restrictions).toBe("");
  });

  it("merges legacy rows with isSigner: null and identity-mapped answers", async () => {
    const event = await createEvent(await buildEventData());
    await prisma.eventResponse.create({
      data: {
        eventId: event.id,
        name: "Legacy Person",
        email: "legacy@example.com",
        phone: "999",
        vegetarian: null,
        student: true,
        restrictions: null,
        comment: "old comment",
      },
    });

    const attendees = await getAttendeesForEvent(event.id);

    expect(attendees).toHaveLength(1);
    expect(attendees[0]).toMatchObject({
      isSigner: null,
      name: "Legacy Person",
      email: "legacy@example.com",
      phone: "999",
      answers: {
        name: "Legacy Person",
        vegetarian: false,
        student: true,
        restrictions: "",
        comment: "old comment",
      },
    });
  });

  it("tolerates answer shapes any valid writer could store", async () => {
    const event = await createEvent(await buildEventData());
    const version = await getCurrentFormVersion(event.formId);
    await createFormSubmission({
      formVersionId: version.id,
      answers: { name: "Minimal Signer", email: "min@example.com", phone: "1" },
    });

    const attendees = await getAttendeesForEvent(event.id);

    expect(attendees).toHaveLength(1);
    expect(attendees[0]).toMatchObject({
      isSigner: true,
      name: "Minimal Signer",
    });
    expect(attendees[0].answers.restrictions).toBeUndefined();
  });

  it("orders legacy and new attendees together by createdAt", async () => {
    const event = await createEventWithSubmission();
    await prisma.eventResponse.create({
      data: {
        eventId: event.id,
        name: "Later Legacy",
        email: "late@example.com",
        phone: "1",
        createdAt: new Date(Date.now() + 60_000),
      },
    });

    const attendees = await getAttendeesForEvent(event.id);

    expect(attendees).toHaveLength(4);
    expect(attendees.at(-1)?.name).toBe("Later Legacy");
  });
});

describe("getAttendeesForAllEvents", () => {
  it("flattens every dinner's signups and tags each attendee with its dinner", async () => {
    const withSubmission = await createEventWithSubmission();
    const withLegacyRow = await createEvent(await buildEventData());
    await prisma.eventResponse.create({
      data: {
        eventId: withLegacyRow.id,
        name: "Legacy Person",
        email: "legacy@example.com",
      },
    });

    const attendees = await getAttendeesForAllEvents();

    const fromSubmission = attendees.filter(
      (attendee) => attendee.dinner.id === withSubmission.id,
    );
    expect(fromSubmission.map((a) => [a.name, a.isSigner])).toEqual([
      ["Ada Signer", true],
      ["Grace Friend", false],
      ["Alan Friend", false],
    ]);
    expect(fromSubmission[0].dinner).toEqual({
      id: withSubmission.id,
      title: withSubmission.title,
      date: withSubmission.date,
    });

    const fromLegacy = attendees.filter(
      (attendee) => attendee.dinner.id === withLegacyRow.id,
    );
    expect(fromLegacy).toHaveLength(1);
    expect(fromLegacy[0]).toMatchObject({
      isSigner: null,
      name: "Legacy Person",
      dinner: { title: withLegacyRow.title },
    });
  });
});

describe("getAttendeeRosterForEvent columns", () => {
  it("derives the default columns in form order for an unsubmitted event", async () => {
    const event = await createEvent(await buildEventData());

    const { columns } = await getAttendeeRosterForEvent(event.id);

    expect(columns).toEqual([
      { name: "name", label: "Name" },
      { name: "email", label: "Email" },
      { name: "phone", label: "Phone number" },
      { name: "vegetarian", label: "Vegan / Vegetarian" },
      { name: "student", label: "Student" },
      { name: "restrictions", label: "Dietary restrictions" },
      { name: "comment", label: "Comment" },
    ]);
  });

  it("falls back to default columns when a stored schema is unparseable", async () => {
    const event = await createEvent(await buildEventData());
    const version = await getCurrentFormVersion(event.formId);
    await prisma.formVersion.update({
      where: { id: version.id },
      data: { schema: { corrupted: true } },
    });
    await createFormSubmission({
      formVersionId: version.id,
      answers: { name: "Lost Signer", email: "x@example.com", phone: "1" },
    });

    const { attendees, columns } = await getAttendeeRosterForEvent(event.id);

    expect(attendees).toHaveLength(0);
    expect(columns.length).toBeGreaterThan(0);
    expect(columns[0]).toEqual({ name: "name", label: "Name" });
  });

  it("unions columns across versions with submissions, latest labels first", async () => {
    const event = await createEventWithSubmission();

    const v2Fields: FieldDescriptor[] = DEFAULT_FORM.flatMap((field) => {
      if (field.type === "textarea" && field.data.name === "comment") return [];
      if (field.type === "text" && field.data.name === "restrictions") {
        return [{ ...field, data: { ...field.data, label: "Allergies" } }];
      }
      return [field];
    });
    const v2 = await saveFormSchema(event.formId, v2Fields);
    await createFormSubmission({
      formVersionId: v2.id,
      answers: {
        name: "V2 Signer",
        email: "v2@example.com",
        phone: "2",
        vegetarian: false,
        student: false,
        restrictions: "pollen",
        friends: [],
      },
    });

    const { columns } = await getAttendeeRosterForEvent(event.id);

    expect(columns.map((column) => column.name)).toEqual([
      "name",
      "email",
      "phone",
      "vegetarian",
      "student",
      "restrictions",
      "comment",
    ]);
    expect(columns.find((c) => c.name === "restrictions")?.label).toBe(
      "Allergies",
    );
    expect(columns.find((c) => c.name === "comment")?.label).toBe("Comment");
  });
});
