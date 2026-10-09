import { describe, expect, it } from "vitest";

import { buildEventData } from "../../test/factories";

import { deleteAddress } from "./address.server";
import {
  createEvent,
  deleteEvent,
  getEventWithCurrentFormVersion,
  getNextEvent,
  updateEvent,
} from "./event.server";
import {
  createFormSubmission,
  FormVersionChangedError,
  getFormSubmissionsForEvent,
} from "./form-submission.server";
import { getCurrentFormVersion } from "./form.server";
import { deleteUserById } from "./user.server";

import { prisma } from "~/db.server";
import type { FieldDescriptor } from "~/features/forms/fields";
import { DEFAULT_FORM } from "~/features/signup-form/default-form";

function duplicateNameFields(): FieldDescriptor[] {
  return [
    {
      type: "text",
      version: 1,
      data: { name: "dup", label: "One", required: false },
    },
    {
      type: "text",
      version: 1,
      data: { name: "dup", label: "Two", required: false },
    },
  ];
}

/** The event's cover row, joined via Event.imageId. */
async function findCover(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { image: true },
  });
  return event?.image ?? null;
}

async function findCoverOrThrow(eventId: string) {
  const cover = await findCover(eventId);
  if (!cover) throw new Error(`Expected a cover image for event ${eventId}`);
  return cover;
}

/** Asserts the event with its form, versions, submissions, and image is gone. */
async function expectEventGraphDeleted(
  event: { id: string; formId: string },
  coverId?: string,
) {
  await expect(
    prisma.event.findUnique({ where: { id: event.id } }),
  ).resolves.toBeNull();
  await expect(
    prisma.form.findUnique({ where: { id: event.formId } }),
  ).resolves.toBeNull();
  await expect(
    prisma.formVersion.count({ where: { formId: event.formId } }),
  ).resolves.toBe(0);
  await expect(
    prisma.formSubmission.count({
      where: { formVersion: { formId: event.formId } },
    }),
  ).resolves.toBe(0);
  if (coverId) {
    await expect(
      prisma.image.findUnique({ where: { id: coverId } }),
    ).resolves.toBeNull();
  }
}

describe("createEvent", () => {
  it("creates the form and its first version with the event", async () => {
    const event = await createEvent(await buildEventData());

    const form = await prisma.form.findUniqueOrThrow({
      where: { id: event.formId },
      include: { versions: true },
    });
    expect(form.versions).toHaveLength(1);
    expect(form.versions[0].version).toBe(1);
    expect(form.versions[0].schema).toEqual(DEFAULT_FORM);
  });

  it("stores custom form fields when provided", async () => {
    const fields: FieldDescriptor[] = [
      {
        type: "text",
        version: 1,
        data: { name: "name", label: "Name", required: true },
      },
    ];

    const event = await createEvent(await buildEventData(), fields);

    const version = await getCurrentFormVersion(event.formId);
    expect(version.schema).toEqual(fields);
  });

  it("rejects descriptors that violate FormSchema", async () => {
    await expect(
      createEvent(await buildEventData(), duplicateNameFields()),
    ).rejects.toThrow();
  });
});

describe("event read projections", () => {
  it("returns the event address with its latest form version", async () => {
    const event = await createEvent(await buildEventData());
    const firstVersion = await getCurrentFormVersion(event.formId);
    await createFormSubmission({
      formVersionId: firstVersion.id,
      answers: { name: "Versioned signer" },
    });
    const editedFields: FieldDescriptor[] = DEFAULT_FORM.map((field) =>
      field.type === "textarea" && field.data.name === "comment"
        ? { ...field, data: { ...field.data, label: "Updated comment" } }
        : field,
    );
    await updateEvent(event.id, {}, editedFields);

    const result = await getEventWithCurrentFormVersion(event.id);

    expect(result?.event).toMatchObject({
      id: event.id,
      formId: event.formId,
      address: { id: event.addressId },
    });
    expect(result?.version).toMatchObject({
      formId: event.formId,
      version: 2,
      schema: editedFields,
    });
  });

  it("returns one not-found result for an unknown event", async () => {
    await expect(
      getEventWithCurrentFormVersion("does-not-exist"),
    ).resolves.toBeNull();
  });

  it("includes an event exactly on the upcoming boundary with its address", async () => {
    const boundary = new Date("2200-01-01T12:00:00.000Z");
    const event = await createEvent({
      ...(await buildEventData()),
      date: boundary,
    });
    await createEvent({
      ...(await buildEventData()),
      date: new Date(boundary.getTime() + 60_000),
    });

    const next = await getNextEvent(boundary);

    expect(next).toMatchObject({
      id: event.id,
      date: boundary,
      address: { id: event.addressId },
    });
  });
});

describe("event image lifecycle", () => {
  it("creates the image row the event points at", async () => {
    const data = await buildEventData();

    const event = await createEvent(data);

    const image = await findCoverOrThrow(event.id);
    expect(image.contentType).toBe(data.image.contentType);
    expect(image.storageKey).toBe(data.image.storageKey);
  });

  it("leaves no image row when the create transaction fails after the image write", async () => {
    const data = await buildEventData();

    await expect(
      createEvent({ ...data, addressId: "does-not-exist" }),
    ).rejects.toThrow();

    await expect(
      prisma.image.count({ where: { storageKey: data.image.storageKey } }),
    ).resolves.toBe(0);
  });

  it("cover swap: deletes the old image and creates the new one", async () => {
    const event = await createEvent(await buildEventData());
    const oldImage = await findCoverOrThrow(event.id);
    const newImage = {
      contentType: "image/png",
      storageKey: "test/dinners/swapped-cover",
    };

    await updateEvent(event.id, { image: newImage });

    const image = await findCoverOrThrow(event.id);
    expect(image.id).not.toBe(oldImage.id);
    expect(image.contentType).toBe("image/png");
    await expect(
      prisma.image.findUnique({ where: { id: oldImage.id } }),
    ).resolves.toBeNull();
    // the event survived the old image's deletion (Event.imageId is SetNull)
    await expect(
      prisma.event.findUnique({ where: { id: event.id } }),
    ).resolves.not.toBeNull();
  });

  it("cover swap failure: keeps the old image and leaves no new image row", async () => {
    const event = await createEvent(await buildEventData());
    const newImage = {
      contentType: "image/png",
      storageKey: "test/dinners/never-persisted-cover",
    };
    // the schema failure inside saveFormSchemaInTx happens AFTER the new
    // image was created and the event repointed, so the whole swap must
    // roll back
    const before = await findCoverOrThrow(event.id);

    await expect(
      updateEvent(event.id, { image: newImage }, duplicateNameFields()),
    ).rejects.toThrow();

    const after = await findCover(event.id);
    expect(after?.id).toBe(before.id);
    await expect(
      prisma.image.count({ where: { storageKey: newImage.storageKey } }),
    ).resolves.toBe(0);
  });

  it("leaves the image untouched when updating without one", async () => {
    const event = await createEvent(await buildEventData());
    const before = await findCoverOrThrow(event.id);

    await updateEvent(event.id, { title: "No Cover Change" });

    const after = await findCover(event.id);
    expect(after?.id).toBe(before.id);
  });

  it("deletes the image with the event", async () => {
    const event = await createEvent(await buildEventData());
    const cover = await findCoverOrThrow(event.id);

    await deleteEvent(event.id);

    await expect(
      prisma.image.findUnique({ where: { id: cover.id } }),
    ).resolves.toBeNull();
  });

  it("deleteEvent returns the captured cover storageKey", async () => {
    const data = await buildEventData();
    const event = await createEvent(data);

    const result = await deleteEvent(event.id);

    expect(result.event.id).toBe(event.id);
    expect(result.imageKeys).toEqual([data.image.storageKey]);
  });

  it("deleteEvent returns no keys for a coverless event", async () => {
    const event = await createEvent(await buildEventData());
    await prisma.image.deleteMany({ where: { event: { id: event.id } } });

    const result = await deleteEvent(event.id);

    expect(result.imageKeys).toEqual([]);
  });

  it("updateEvent returns the replaced cover's storageKey on a swap", async () => {
    const data = await buildEventData();
    const event = await createEvent(data);

    const result = await updateEvent(event.id, {
      image: {
        contentType: "image/png",
        storageKey: "test/dinners/replacement",
      },
    });

    expect(result.replacedImageKey).toBe(data.image.storageKey);
  });

  it("updateEvent returns a null key when the cover is untouched", async () => {
    const event = await createEvent(await buildEventData());

    const result = await updateEvent(event.id, { title: "Same Cover" });

    expect(result.replacedImageKey).toBeNull();
  });

  it("deleting an image never deletes the event", async () => {
    const event = await createEvent(await buildEventData());
    const cover = await findCoverOrThrow(event.id);

    await prisma.image.delete({ where: { id: cover.id } });

    await expect(
      prisma.event.findUnique({ where: { id: event.id } }),
    ).resolves.not.toBeNull();
    await expect(findCover(event.id)).resolves.toBeNull();
  });
});

describe("updateEvent", () => {
  it("persists event data and form schema together", async () => {
    const event = await createEvent(await buildEventData());
    const edited: FieldDescriptor[] = DEFAULT_FORM.map((field) =>
      field.type === "textarea" && field.data.name === "comment"
        ? { ...field, data: { ...field.data, label: "Anything else?" } }
        : field,
    );

    const updated = await updateEvent(event.id, { title: "New Title" }, edited);

    expect(updated.event.title).toBe("New Title");
    const version = await getCurrentFormVersion(event.formId);
    expect(version.schema).toEqual(edited);
  });

  it("rolls the event data back when the form save fails", async () => {
    const event = await createEvent(await buildEventData());

    await expect(
      updateEvent(
        event.id,
        { title: "Should Not Persist" },
        duplicateNameFields(),
      ),
    ).rejects.toThrow();

    const after = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(after.title).not.toBe("Should Not Persist");
  });
});

describe("deleteEvent", () => {
  it("round-trips: removes the event with its form, versions, submissions, and cover", async () => {
    const event = await createEvent(await buildEventData());
    const cover = await findCoverOrThrow(event.id);
    const version = await getCurrentFormVersion(event.formId);
    await createFormSubmission({
      formVersionId: version.id,
      answers: { name: "Solo Signer", email: "solo@example.com", friends: [] },
    });

    const submissions = await getFormSubmissionsForEvent(event.id);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].formVersion.id).toBe(version.id);

    await deleteEvent(event.id);

    await expectEventGraphDeleted(event, cover.id);
  });

  it("rejects for an unknown event id", async () => {
    await expect(deleteEvent("does-not-exist")).rejects.toThrow();
  });
});

describe("createFormSubmission version guard", () => {
  it("rejects the write when the pinned version changed after validation", async () => {
    const event = await createEvent(await buildEventData());
    const version = await getCurrentFormVersion(event.formId);

    await prisma.formVersion.update({
      where: { id: version.id },
      data: { updatedAt: new Date(version.updatedAt.getTime() + 5_000) },
    });

    await expect(
      createFormSubmission({
        formVersionId: version.id,
        answers: { name: "Raced Signer" },
        expectedVersionUpdatedAt: version.updatedAt,
      }),
    ).rejects.toBeInstanceOf(FormVersionChangedError);

    await expect(
      prisma.formSubmission.count({ where: { formVersionId: version.id } }),
    ).resolves.toBe(0);
  });

  it("writes when the pinned version is unchanged", async () => {
    const event = await createEvent(await buildEventData());
    const version = await getCurrentFormVersion(event.formId);

    await expect(
      createFormSubmission({
        formVersionId: version.id,
        answers: { name: "Safe Signer" },
        expectedVersionUpdatedAt: version.updatedAt,
      }),
    ).resolves.toMatchObject({ formVersionId: version.id });
  });
});

describe("events outlive their supporting entities", () => {
  it("deleting a user keeps their events, clearing authorship", async () => {
    const data = await buildEventData();
    const event = await createEvent(data);

    await deleteUserById(data.createdById);

    const after = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(after.createdById).toBeNull();
    await expect(
      prisma.form.findUnique({ where: { id: event.formId } }),
    ).resolves.not.toBeNull();
    await expect(findCover(event.id)).resolves.not.toBeNull();
  });

  it("refuses to delete an address that still hosts events", async () => {
    const data = await buildEventData();
    const event = await createEvent(data);

    await expect(deleteAddress(data.addressId)).resolves.toBeNull();

    await expect(
      prisma.event.findUnique({ where: { id: event.id } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.address.findUnique({ where: { id: data.addressId } }),
    ).resolves.not.toBeNull();
  });

  it("answers null for an address that is already gone", async () => {
    await expect(deleteAddress("no-such-address")).resolves.toBeNull();
  });

  it("deletes an address once its events are gone", async () => {
    const data = await buildEventData();
    const event = await createEvent(data);
    await deleteEvent(event.id);

    await expect(deleteAddress(data.addressId)).resolves.toMatchObject({
      id: data.addressId,
    });
    await expect(
      prisma.address.findUnique({ where: { id: data.addressId } }),
    ).resolves.toBeNull();
  });
});
