import { faker } from "@faker-js/faker";
import { afterEach, describe, expect, it } from "vitest";

import { buildEventData } from "../../test/factories";

import { createEvent, deleteEvent } from "./event.server";
import type { ImageCreateData } from "./image.server";
import {
  clearSiteImage,
  listSiteImages,
  setSiteImage,
} from "./site-image.server";

import { prisma } from "~/db.server";

const KEY_PREFIX = "test-slot-";
const STORAGE_KEY_PREFIX = "test/site-images/";
const eventIds: string[] = [];

function slotKey() {
  return `${KEY_PREFIX}${faker.string.uuid()}`;
}

function siteImage(overrides: Partial<ImageCreateData> = {}): ImageCreateData {
  return {
    contentType: "image/jpeg",
    storageKey: `${STORAGE_KEY_PREFIX}${faker.string.uuid()}`,
    ...overrides,
  };
}

async function imageIdOf(key: string) {
  const row = await prisma.siteImage.findUnique({ where: { key } });
  if (!row) throw new Error(`Expected an image in slot ${key}`);
  return row.imageId;
}

afterEach(async () => {
  for (const id of eventIds.splice(0)) await deleteEvent(id);
  await prisma.siteImage.deleteMany({
    where: { key: { startsWith: KEY_PREFIX } },
  });
  await prisma.image.deleteMany({
    where: { storageKey: { startsWith: STORAGE_KEY_PREFIX } },
  });
});

describe("setSiteImage", () => {
  it("fills an empty slot", async () => {
    const key = slotKey();
    const image = siteImage({ width: 1200, height: 630 });

    const result = await setSiteImage(key, image);

    expect(result).toEqual({ replacedImageKey: null });
    const listed = (await listSiteImages()).find((row) => row.key === key);
    expect(listed?.image).toMatchObject({
      storageKey: image.storageKey,
      width: 1200,
      height: 630,
      version: null,
      blurDataUrl: null,
    });
  });

  it("releases the image it replaces and hands back its storageKey", async () => {
    const key = slotKey();
    const old = siteImage();
    await setSiteImage(key, old);
    const oldId = await imageIdOf(key);

    const replacement = siteImage();
    const result = await setSiteImage(key, replacement);

    expect(result).toEqual({ replacedImageKey: old.storageKey });
    await expect(
      prisma.image.findUnique({ where: { id: oldId } }),
    ).resolves.toBeNull();
    const listed = (await listSiteImages()).find((row) => row.key === key);
    expect(listed?.image.storageKey).toBe(replacement.storageKey);
  });

  it("keeps a replaced image that a dinner gallery still shows", async () => {
    const key = slotKey();
    await setSiteImage(key, siteImage());
    const oldId = await imageIdOf(key);

    const event = await createEvent(await buildEventData());
    eventIds.push(event.id);
    await prisma.eventGalleryImage.create({
      data: { eventId: event.id, imageId: oldId, position: 0 },
    });

    const result = await setSiteImage(key, siteImage());

    expect(result).toEqual({ replacedImageKey: null });
    await expect(
      prisma.image.findUnique({ where: { id: oldId } }),
    ).resolves.not.toBeNull();
  });

  it("leaves other slots alone", async () => {
    const [first, second] = [slotKey(), slotKey()];
    const kept = siteImage();
    await setSiteImage(first, kept);

    await setSiteImage(second, siteImage());
    await setSiteImage(second, siteImage());

    const listed = (await listSiteImages()).find((row) => row.key === first);
    expect(listed?.image.storageKey).toBe(kept.storageKey);
  });
});

describe("clearSiteImage", () => {
  it("empties the slot and releases its image", async () => {
    const key = slotKey();
    const image = siteImage();
    await setSiteImage(key, image);
    const imageId = await imageIdOf(key);

    const result = await clearSiteImage(key);

    expect(result).toEqual({
      cleared: true,
      releasedImageKey: image.storageKey,
    });
    await expect(
      prisma.siteImage.findUnique({ where: { key } }),
    ).resolves.toBeNull();
    await expect(
      prisma.image.findUnique({ where: { id: imageId } }),
    ).resolves.toBeNull();
  });

  it("reports an empty slot as nothing cleared", async () => {
    await expect(clearSiteImage(slotKey())).resolves.toEqual({
      cleared: false,
      releasedImageKey: null,
    });
  });
});
