import { cn } from "~/lib/utils";

/**
 * The hand-drawn section headings, with the intrinsic size of each file so
 * the browser can reserve space before it loads. Callers pass `alt`: the words
 * the artwork spells, which a screen reader announces in place of it.
 */
export const handwrittenHeadings = {
  ourVision: {
    src: "/our_vision.svg",
    width: 1064,
    height: 273,
  },
  nextDinner: {
    src: "/next_dinner.svg",
    width: 1043,
    height: 325,
  },
  pastDinners: {
    src: "/past_dinners.svg",
    width: 1074,
    height: 351,
  },
} as const;

export type HandwrittenHeadingName = keyof typeof handwrittenHeadings;

export function HandwrittenHeading({
  name,
  alt,
  className,
}: {
  name: HandwrittenHeadingName;
  alt: string;
  className?: string;
}) {
  const { src, width, height } = handwrittenHeadings[name];

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      // Like the wordmark, these are JPEGs in an SVG wrapper with an opaque
      // white ground rather than alpha. Multiply drops the white to the paper
      // and keeps the strokes — only safe because they sit on cream.
      //
      // self-start matters: in a flex column the default stretch would blow
      // `w-auto` out to the full column and squash the writing, and because
      // the artwork's white margins stretch with it the result reads as a
      // centred heading rather than a broken one.
      className={cn(
        "h-9 w-auto self-start object-contain mix-blend-multiply md:h-11",
        className,
      )}
    />
  );
}
