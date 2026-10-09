import { prisma } from "~/db.server";
import {
  IMAGE_METADATA_SELECT,
  releaseImagesIfUnreferenced,
  type ImageCreateData,
  type ImageMetadata,
} from "~/models/image.server";

export async function listSiteImages(): Promise<
  { key: string; image: ImageMetadata }[]
> {
  return prisma.siteImage.findMany({
    select: { key: true, image: { select: IMAGE_METADATA_SELECT } },
  });
}

/**
 * Points the slot at a new image. The one it replaces is released in the same
 * transaction; its storageKey comes back for the caller to destroy at the
 * provider after commit.
 */
export async function setSiteImage(
  key: string,
  image: ImageCreateData,
): Promise<{ replacedImageKey: string | null }> {
  return prisma.$transaction(async (tx) => {
    const previous = await tx.siteImage.findUnique({
      where: { key },
      select: { imageId: true },
    });

    const { id: imageId } = await tx.image.create({
      data: image,
      select: { id: true },
    });

    await tx.siteImage.upsert({
      where: { key },
      create: { key, imageId },
      update: { imageId },
    });

    if (!previous) return { replacedImageKey: null };

    const { storageKeys } = await releaseImagesIfUnreferenced(tx, [
      previous.imageId,
    ]);
    return { replacedImageKey: storageKeys[0] ?? null };
  });
}

export async function clearSiteImage(
  key: string,
): Promise<{ cleared: boolean; releasedImageKey: string | null }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteImage.findUnique({
      where: { key },
      select: { imageId: true },
    });
    if (!current) return { cleared: false, releasedImageKey: null };

    await tx.siteImage.delete({ where: { key } });

    const { storageKeys } = await releaseImagesIfUnreferenced(tx, [
      current.imageId,
    ]);
    return { cleared: true, releasedImageKey: storageKeys[0] ?? null };
  });
}
