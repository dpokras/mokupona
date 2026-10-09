import type { Address, Event, Prisma } from "#prisma/generated/client";

import { prisma } from "~/db.server";
import { FormSchema, type FieldDescriptor } from "~/features/forms/fields";
import { DEFAULT_FORM } from "~/features/signup-form/default-form";
import {
  CURRENT_FORM_VERSION_ORDER_BY,
  saveFormSchemaInTx,
  type FormVersion,
} from "~/models/form.server";
import {
  IMAGE_METADATA_SELECT,
  releaseImagesIfUnreferenced,
  type ImageCreateData,
  type ImageMetadata,
} from "~/models/image.server";

export type { Address, Event } from "#prisma/generated/client";

export type EventWithImage = Event & { image: ImageMetadata | null };

const EVENT_IMAGE_INCLUDE = {
  image: { select: IMAGE_METADATA_SELECT },
} satisfies Prisma.EventInclude;

export interface EventCreateData {
  title: string;
  description: string;
  menuDescription?: string | null;
  donationDescription?: string | null;
  date: Date;
  slots: number;
  price: number;
  discounts?: string | null;
  addressId: string;
  image: ImageCreateData;
  createdById: string;
}

export type EventUpdateData = Partial<EventCreateData>;

export async function countEvents(): Promise<number> {
  return prisma.event.count();
}

export async function listEventIds(): Promise<string[]> {
  const events = await prisma.event.findMany({
    select: { id: true },
    orderBy: { date: "desc" },
  });
  return events.map(({ id }) => id);
}

export async function getEventsWithAddress(): Promise<
  (EventWithImage & { address: Address; galleryImageCount: number })[]
> {
  const events = await prisma.event.findMany({
    orderBy: {
      date: "asc",
    },
    include: {
      address: true,
      ...EVENT_IMAGE_INCLUDE,
      // decides whether a past dinner points at its gallery or its detail page
      _count: { select: { galleryImages: true } },
    },
  });

  return events.map(({ _count, ...event }) => ({
    ...event,
    galleryImageCount: _count.galleryImages,
  }));
}

function nextEventArgs(now: Date) {
  return {
    where: { date: { gte: now } },
    orderBy: { date: "asc" },
  } satisfies Prisma.EventFindFirstArgs;
}

export async function getNextEvent(
  now = new Date(),
): Promise<(EventWithImage & { address: Address }) | null> {
  return prisma.event.findFirst({
    ...nextEventArgs(now),
    include: { address: true, ...EVENT_IMAGE_INCLUDE },
  });
}

export async function getEventById(
  id: string,
): Promise<(EventWithImage & { address: Address }) | null> {
  return prisma.event.findUnique({
    where: { id },
    include: {
      address: true,
      ...EVENT_IMAGE_INCLUDE,
    },
  });
}

export async function getEventTitles(
  ids: string[],
): Promise<{ id: string; title: string }[]> {
  return prisma.event.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
}

export async function getEventWithCurrentFormVersion(id: string): Promise<{
  event: EventWithImage & { address: Address };
  version: FormVersion;
} | null> {
  const record = await prisma.event.findUnique({
    where: { id },
    include: {
      address: true,
      ...EVENT_IMAGE_INCLUDE,
      form: {
        select: {
          versions: { orderBy: CURRENT_FORM_VERSION_ORDER_BY, take: 1 },
        },
      },
    },
  });

  if (!record) return null;

  const [version] = record.form.versions;
  if (!version) return null;

  const { form: _form, ...event } = record;
  return { event, version };
}

export async function createEvent(
  data: EventCreateData,
  formFields: FieldDescriptor[] = DEFAULT_FORM,
): Promise<Event> {
  const schema = FormSchema.parse(formFields);
  const { image, ...eventData } = data;

  return prisma.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        versions: {
          create: {
            version: 1,
            schema: schema as Prisma.InputJsonValue,
          },
        },
      },
    });

    const cover = await tx.image.create({ data: image });

    return tx.event.create({
      data: { ...eventData, formId: form.id, imageId: cover.id },
    });
  });
}

export async function updateEvent(
  id: string,
  data: EventUpdateData,
  formFields?: FieldDescriptor[],
): Promise<{ event: Event; replacedImageKey: string | null }> {
  const { image, ...eventData } = data;

  if (!image && !formFields) {
    const event = await prisma.event.update({ where: { id }, data: eventData });
    return { event, replacedImageKey: null };
  }

  return prisma.$transaction(async (tx) => {
    let previousImageId: string | null = null;

    if (image) {
      const current = await tx.event.findUnique({
        where: { id },
        select: { imageId: true },
      });
      previousImageId = current?.imageId ?? null;
    }

    const cover = image ? await tx.image.create({ data: image }) : null;

    const event = await tx.event.update({
      where: { id },
      data: { ...eventData, ...(cover && { imageId: cover.id }) },
    });

    if (formFields) {
      await saveFormSchemaInTx(tx, event.formId, formFields);
    }

    // released only after the slot moved on, so the old cover survives when
    // a gallery still shows it
    let replacedImageKey: string | null = null;
    if (previousImageId) {
      const { storageKeys } = await releaseImagesIfUnreferenced(tx, [
        previousImageId,
      ]);
      replacedImageKey = storageKeys[0] ?? null;
    }

    return { event, replacedImageKey };
  });
}

/**
 * Deletes the matched events with their forms, then releases every image the
 * events referenced — cover slots and gallery links alike. An image another
 * dinner or a slot still references survives; the storageKeys of those that
 * fell come back for the caller's post-commit provider destroy.
 */
export async function deleteEventsInTx(
  tx: Prisma.TransactionClient,
  where: Prisma.EventWhereInput,
): Promise<string[]> {
  const events = await tx.event.findMany({
    where,
    select: {
      id: true,
      formId: true,
      imageId: true,
      galleryImages: { select: { imageId: true } },
    },
  });
  if (events.length === 0) return [];

  const eventIds = events.map((event) => event.id);
  const formIds = events.map((event) => event.formId);
  const imageIds = events.flatMap((event) => [
    ...(event.imageId ? [event.imageId] : []),
    ...event.galleryImages.map((link) => link.imageId),
  ]);

  await tx.formSubmission.deleteMany({
    where: { formVersion: { formId: { in: formIds } } },
  });
  await tx.formVersion.deleteMany({ where: { formId: { in: formIds } } });
  await tx.event.deleteMany({ where: { id: { in: eventIds } } });
  await tx.form.deleteMany({ where: { id: { in: formIds } } });
  const { storageKeys } = await releaseImagesIfUnreferenced(tx, imageIds);

  return storageKeys;
}

export async function deleteEvent(
  id: string,
): Promise<{ event: Event; imageKeys: string[] }> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUniqueOrThrow({ where: { id } });
    const imageKeys = await deleteEventsInTx(tx, { id });

    return { event, imageKeys };
  });
}
