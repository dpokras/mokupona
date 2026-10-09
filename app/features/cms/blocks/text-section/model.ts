import type { BlockType } from "../types";

import type { HandwrittenHeadingName } from "~/components/handwritten-heading";

const BLOCK_TYPE: BlockType = "text-section";
const BLOCK_VERSION = 1;

type TextSectionBlockData = {
  eyebrow?: string;
  /** A drawn heading, shown in place of the `eyebrow` text, which becomes its alt text. */
  eyebrowHandwritten?: HandwrittenHeadingName;
  headline: string;
  body: string;
  variant: "plain" | "feature";
};

export type TextSectionBlockType = {
  type: typeof BLOCK_TYPE;
  version: typeof BLOCK_VERSION;
  data: TextSectionBlockData;
};
