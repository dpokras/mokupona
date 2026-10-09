// @vitest-environment node

import type { SubmissionResult } from "@conform-to/react";
import { RouterContextProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IMAGE_SLOT_KEYS, type ImageSlotKey } from "./image-slots";
import { loadSiteImages, removeSiteImage } from "./site-images.server";

import { prisma } from "~/db.server";
import type * as ImageStorage from "~/features/images/image-storage.server";
import { getLocalImageFile } from "~/features/images/providers/local.server";
import type * as SiteImageModel from "~/models/site-image.server";
import { setSiteImage } from "~/models/site-image.server";
import {
  action as uploadAction,
  loader as uploadLoader,
} from "~/routes/admin.content.images.$slot";
import { action as removeAction } from "~/routes/admin.content.images.$slot.remove";
import { getToast } from "~/utils/toast.server";

const uploads = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  return {
    env: {
      IMAGE_UPLOAD_FOLDER: mkdtempSync(join(tmpdir(), "site-images-test-")),
    } as NodeJS.ProcessEnv,
  };
});

vi.mock("~/features/images/image-storage.server", async (importOriginal) => {
  const original = await importOriginal<typeof ImageStorage>();
  const { createLocalProvider } =
    await import("~/features/images/providers/local.server");
  const provider = createLocalProvider(uploads.env);

  return {
    ...original,
    storeImage: vi.fn((file: File, folder: string) =>
      provider.store(file, { folder }),
    ),
    destroyImages: (keys: (string | null | undefined)[]) =>
      original.destroyImages(keys, provider),
  };
});

vi.mock("~/models/site-image.server", async (importOriginal) => {
  const original = await importOriginal<typeof SiteImageModel>();
  return { ...original, setSiteImage: vi.fn(original.setSiteImage) };
});

// a PNG signature and IHDR header declaring 1200 × 630
const PNG_HEADER = "89504e470d0a1a0a0000000d49484452000004b000000276";

function png(name = "preview.png") {
  return new File([Buffer.from(PNG_HEADER, "hex")], name, {
    type: "image/png",
  });
}

function args(slot: string, path: string, init?: RequestInit) {
  return {
    params: { slot },
    request: new Request(`http://localhost:3000${path}`, init),
    context: new RouterContextProvider(),
  };
}

async function upload(slot: string, file: File) {
  const body = new FormData();
  body.append("image", file);

  return uploadAction(
    args(slot, `/admin/content/images/${slot}`, {
      method: "POST",
      body,
    }) as unknown as Parameters<typeof uploadAction>[0],
  );
}

async function remove(slot: string) {
  return removeAction(
    args(slot, `/admin/content/images/${slot}/remove`, {
      method: "POST",
    }) as unknown as Parameters<typeof removeAction>[0],
  );
}

async function toastOf(response: Response) {
  const cookie = response.headers.get("set-cookie") ?? "";
  const { toast } = await getToast(
    new Request("http://localhost:3000/", { headers: { cookie } }),
  );
  return toast;
}

async function storedFile(key: ImageSlotKey) {
  const image = (await loadSiteImages())[key];
  if (!image) throw new Error(`Expected an image in slot ${key}`);
  return {
    image,
    file: await getLocalImageFile(image.storageKey, uploads.env),
  };
}

afterEach(async () => {
  for (const key of IMAGE_SLOT_KEYS) await removeSiteImage(key);
  vi.mocked(setSiteImage).mockClear();
});

describe("site image upload", () => {
  it("stores the upload in the slot and says so", async () => {
    const response = await upload("shareImage", png());

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("location")).toBe(
      "/admin/content/images",
    );
    await expect(toastOf(response as Response)).resolves.toMatchObject({
      title: "Link preview image updated",
      type: "success",
    });

    const { image, file } = await storedFile("shareImage");
    expect(image.storageKey).toMatch(/^site-images\//);
    expect(image).toMatchObject({ width: 1200, height: 630 });
    expect(file).not.toBeNull();
    expect((await loadSiteImages()).aboutPhoto).toBeNull();
  });

  it("deletes the replaced image, row and file", async () => {
    await upload("aboutPhoto", png("first.png"));
    const first = await storedFile("aboutPhoto");

    await upload("aboutPhoto", png("second.png"));
    const second = await storedFile("aboutPhoto");

    expect(second.image.id).not.toBe(first.image.id);
    await expect(
      prisma.image.findUnique({ where: { id: first.image.id } }),
    ).resolves.toBeNull();
    await expect(
      getLocalImageFile(first.image.storageKey, uploads.env),
    ).resolves.toBeNull();
  });

  it("rejects a file that is not an image without storing it", async () => {
    const before = await prisma.image.count();

    const result = (await upload(
      "shareImage",
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    )) as SubmissionResult;

    expect(result.error?.image).toEqual([
      "File must be a JPEG, PNG or WebP image",
    ]);
    expect((await loadSiteImages()).shareImage).toBeNull();
    expect(await prisma.image.count()).toBe(before);
  });

  it("destroys the stored file when the slot cannot be written", async () => {
    const { storeImage } =
      await import("~/features/images/image-storage.server");
    vi.mocked(storeImage).mockClear();
    vi.mocked(setSiteImage).mockRejectedValueOnce(new Error("disk I/O error"));

    await expect(upload("shareImage", png())).rejects.toThrow("disk I/O error");

    const stored = await vi.mocked(storeImage).mock.results[0]?.value;
    expect(stored?.storageKey).toMatch(/^site-images\//);
    await expect(
      getLocalImageFile(stored.storageKey, uploads.env),
    ).resolves.toBeNull();
  });

  it("answers an unknown slot with a 404 before reading the upload", async () => {
    const before = await prisma.image.count();

    await expect(upload("heroBanner", png())).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      uploadLoader(
        args(
          "heroBanner",
          "/admin/content/images/heroBanner",
        ) as unknown as Parameters<typeof uploadLoader>[0],
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(await prisma.image.count()).toBe(before);
  });
});

describe("site image removal", () => {
  it("empties the slot and deletes the file", async () => {
    await upload("shareImage", png());
    const { image } = await storedFile("shareImage");

    const response = await remove("shareImage");

    await expect(toastOf(response)).resolves.toMatchObject({
      title: "Link preview image removed",
      description: "The default image is back.",
    });
    expect((await loadSiteImages()).shareImage).toBeNull();
    await expect(
      prisma.image.findUnique({ where: { id: image.id } }),
    ).resolves.toBeNull();
    await expect(
      getLocalImageFile(image.storageKey, uploads.env),
    ).resolves.toBeNull();
  });

  it("says there was nothing to remove from an empty slot", async () => {
    const response = await remove("aboutPhoto");

    expect(response.headers.get("location")).toBe("/admin/content/images");
    await expect(toastOf(response)).resolves.toMatchObject({
      title: "Nothing to remove",
    });
  });

  it("answers an unknown slot with a 404", async () => {
    await expect(remove("heroBanner")).rejects.toMatchObject({ status: 404 });
  });
});

describe("loadSiteImages", () => {
  it("lists every slot and ignores rows for slots the code no longer has", async () => {
    const { setSiteImage: setRow } = await vi.importActual<
      typeof SiteImageModel
    >("~/models/site-image.server");
    await setRow("retiredSlot", {
      contentType: "image/png",
      storageKey: "test/site-images/retired",
    });

    try {
      expect(await loadSiteImages()).toEqual({
        shareImage: null,
        aboutPhoto: null,
      });
    } finally {
      await prisma.siteImage.delete({ where: { key: "retiredSlot" } });
      await prisma.image.deleteMany({
        where: { storageKey: "test/site-images/retired" },
      });
    }
  });
});
