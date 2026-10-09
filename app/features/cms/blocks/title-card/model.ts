import type { BlockBaseType, BlockType, BlockVersion } from "../types";

const BLOCK_TYPE: BlockType = "title-card";
const BLOCK_VERSION: BlockVersion = 1;

type TitleCardBlockData = {
  /** Rendered as the fallback wordmark until `logo` is supplied. */
  title: string;
  /**
   * A hand-drawn wordmark served straight from `/public` — deliberately not a
   * `BlockImage`, since brand artwork shouldn't go through the upload pipeline
   * or get responsive-resized. When set, it replaces the text entirely and
   * `title` becomes the accessible name.
   */
  logo?: {
    src: string;
    /** Intrinsic size, so the browser can reserve space before it loads. */
    width: number;
    height: number;
  };
  /** Optional line under the wordmark. Keep it very short — this is a title card. */
  tagline?: string;
  /** The cue at the bottom: its anchor, e.g. `#vision`, and its word. Hidden when unset. */
  scrollCue?: { href: string; label: string };
};

export type TitleCardBlockType = BlockBaseType<
  typeof BLOCK_TYPE,
  typeof BLOCK_VERSION,
  TitleCardBlockData
>;
