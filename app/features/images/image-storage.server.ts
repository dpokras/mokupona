import { createCloudinaryProvider } from "./providers/cloudinary.server";
import { createLocalProvider } from "./providers/local.server";
import type { ImageStorageProvider, StoredImage } from "./types";

import { requestLogger } from "~/logger/request-context.server";
import { logger } from "~/logger.server";
import { singleton } from "~/utils/singleton.server";

/** The asset folders this app writes to, per owner entity. */
export type ImageFolder =
  "dinners" | "board-members" | "dinner-gallery" | "site-images";

function imageProviderName(env: NodeJS.ProcessEnv) {
  return env.IMAGE_PROVIDER ?? "local";
}

export function createImageStorageProvider(
  env: NodeJS.ProcessEnv = process.env,
): ImageStorageProvider {
  const name = imageProviderName(env);
  switch (name) {
    case "local":
      return createLocalProvider(env);
    case "cloudinary":
      return createCloudinaryProvider(env);
    default:
      throw new Error(
        `Unknown IMAGE_PROVIDER "${name}" — expected "cloudinary" or "local"`,
      );
  }
}

const provider = singleton("image-storage-provider", () => {
  const instance = createImageStorageProvider();
  logger.info(
    {
      provider: imageProviderName(process.env),
      folderPrefix: process.env.CLOUDINARY_FOLDER_PREFIX,
    },
    "image storage provider selected",
  );
  return instance;
});

export function storeImage(
  file: File,
  folder: ImageFolder,
): Promise<StoredImage> {
  return provider.store(file, { folder });
}

/**
 * Store a batch, settled and in input order: one file's failure never discards
 * the assets its siblings already put on the provider.
 */
export async function storeImages(
  files: File[],
  folder: ImageFolder,
  providerOverride: ImageStorageProvider = provider,
): Promise<PromiseSettledResult<StoredImage>[]> {
  const results = await Promise.allSettled(
    files.map((file) => providerOverride.store(file, { folder })),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      requestLogger.warn(
        { folder, fileName: files[index].name, error: result.reason },
        "Failed to store image",
      );
    }
  });

  return results;
}

export async function destroyImages(
  storageKeys: (string | null | undefined)[],
  providerOverride: ImageStorageProvider = provider,
): Promise<void> {
  for (const storageKey of storageKeys) {
    if (!storageKey) continue;
    try {
      await providerOverride.destroy(storageKey);
    } catch (error) {
      requestLogger.warn(
        {
          storageKey,
          error,
        },
        "Failed to destroy stored image after DB commit",
      );
    }
  }
}
