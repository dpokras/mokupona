import {
  IMAGE_SLOT_KEYS,
  isImageSlotKey,
  type ImageSlotKey,
} from "./image-slots";

import {
  destroyImages,
  storeImage,
} from "~/features/images/image-storage.server";
import type { ImageMetadata } from "~/models/image.server";
import {
  clearSiteImage,
  listSiteImages,
  setSiteImage,
} from "~/models/site-image.server";

/** Every slot's uploaded image, `null` where nothing is uploaded. */
export type SiteImages = Record<ImageSlotKey, ImageMetadata | null>;

export function requireImageSlotKey(param: string | undefined): ImageSlotKey {
  if (!param || !isImageSlotKey(param)) {
    throw new Response("Not found", { status: 404 });
  }
  return param;
}

export async function loadSiteImages(): Promise<SiteImages> {
  const uploaded = new Map(
    (await listSiteImages()).map(({ key, image }) => [key, image]),
  );
  return Object.fromEntries(
    IMAGE_SLOT_KEYS.map((key) => [key, uploaded.get(key) ?? null]),
  ) as SiteImages;
}

export async function replaceSiteImage(
  key: ImageSlotKey,
  file: File,
): Promise<void> {
  const stored = await storeImage(file, "site-images");

  let replacedImageKey: string | null;
  try {
    ({ replacedImageKey } = await setSiteImage(key, {
      contentType: file.type,
      ...stored,
    }));
  } catch (error) {
    await destroyImages([stored.storageKey]);
    throw error;
  }

  await destroyImages([replacedImageKey]);
}

/** Back to the slot's fallback; `false` when nothing was uploaded. */
export async function removeSiteImage(key: ImageSlotKey): Promise<boolean> {
  const { cleared, releasedImageKey } = await clearSiteImage(key);
  await destroyImages([releasedImageKey]);
  return cleared;
}
