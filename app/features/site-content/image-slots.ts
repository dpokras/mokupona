import type { ImageUrlSource } from "~/shared/image";

export interface ImageSlot {
  /** What the admin page calls it. */
  label: string;
  /** Where it shows up, for whoever replaces it. */
  help: string;
  /** Recommended size in pixels; the site crops uploads to this shape. */
  width: number;
  height: number;
  /** Shown while nothing is uploaded; `null` means the page shows nothing. */
  fallback: ImageUrlSource | null;
}

export const IMAGE_SLOTS = {
  shareImage: {
    label: "Link preview image",
    help: "Shown when someone shares a link to the website, for example on WhatsApp, Instagram or iMessage. Apps that already showed a preview can keep the old picture for a few days.",
    width: 1200,
    height: 630,
    fallback: { storageKey: "static/hero-image" },
  },
  aboutPhoto: {
    label: "About page photo",
    help: "An optional photo on the about page, for example the team at a dinner. The page shows no photo until you upload one.",
    width: 1800,
    height: 1200,
    fallback: null,
  },
} as const satisfies Record<string, ImageSlot>;

export type ImageSlotKey = keyof typeof IMAGE_SLOTS;

export const IMAGE_SLOT_KEYS = Object.keys(IMAGE_SLOTS) as ImageSlotKey[];

export function isImageSlotKey(value: string): value is ImageSlotKey {
  return Object.hasOwn(IMAGE_SLOTS, value);
}
