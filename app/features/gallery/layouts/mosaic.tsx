import { useMemo, useState } from "react";
import { Link } from "react-router";

import { GalleryLightbox } from "../components/gallery-lightbox";
import type { GalleryImageModel } from "../view-models";

import type { GalleryLayoutProps } from "./types";

import { OptimizedImage } from "~/components/optimized-image";
import { Eyebrow } from "~/components/section";
import { formatEventMonthYear } from "~/features/events/date-format";
import { useText } from "~/features/site-content/site-text";
import { cn } from "~/lib/utils";
import type { ImageMetadata } from "~/models/image.server";

/**
 * Requested crop width for every tile. The intrinsic ratio decides the
 * height, so the crop never actually crops — it only pins a cache-friendly
 * URL size, and `srcSet` still covers the real rendered widths.
 */
const TILE_WIDTH = 640;

/** Rows uploaded before dimensions were stored fall back to a 3:2 frame. */
const FALLBACK_ASPECT = 3 / 2;

/**
 * One string for every wall on the page: each wall is the only visible one at
 * its own breakpoint, and keeping them identical is what stops the browser
 * fetching a second rung for the walls it is hiding.
 */
const PAGE_TILE_SIZES =
  "(min-width: 1024px) 300px, (min-width: 768px) 45vw, calc(100vw - 2.5rem)";

// The wall's rhythm comes from the photos, so the frame is derived from the
// stored dimensions rather than from a fixed grid cell.
function tileSize(image: ImageMetadata) {
  const aspect =
    image.width && image.height ? image.width / image.height : FALLBACK_ASPECT;

  return { width: TILE_WIDTH, height: Math.round(TILE_WIDTH / aspect) };
}

/**
 * Greedy masonry: every tile lands in the shortest column so far, ties to the
 * leftmost. All columns share one width, so a tile adds its frame's height
 * over its width; the gap between tiles is constant and stays out of the sum.
 */
function distribute(images: GalleryImageModel[], columnCount: number) {
  const columns: GalleryImageModel[][] = Array.from(
    { length: columnCount },
    () => [],
  );
  const heights = new Array<number>(columnCount).fill(0);

  for (const image of images) {
    let shortest = 0;
    for (let column = 1; column < columnCount; column += 1) {
      if (heights[column] < heights[shortest]) shortest = column;
    }

    const { width, height } = tileSize(image.image);
    columns[shortest].push(image);
    heights[shortest] += height / width;
  }

  return columns;
}

function DinnerLabel({
  event,
}: {
  event: NonNullable<GalleryImageModel["event"]>;
}) {
  const date = new Date(event.date);

  return (
    <Link
      to={`/dinners/${event.id}`}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring pointer-events-auto w-fit transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
    >
      {event.title} ·{" "}
      <time dateTime={date.toISOString()} suppressHydrationWarning>
        {formatEventMonthYear(date)}
      </time>
    </Link>
  );
}

function MosaicTile({
  image,
  showDinner,
  sizes,
  onOpen,
}: {
  image: GalleryImageModel;
  showDinner: boolean;
  sizes: string;
  onOpen: (id: string) => void;
}) {
  const { width, height } = tileSize(image.image);
  const dinner = showDinner ? image.event : null;
  const hasCaption = Boolean(image.caption) || Boolean(dinner);

  return (
    <figure className="group relative">
      <button
        type="button"
        onClick={() => onOpen(image.id)}
        className="focus-visible:ring-ring block w-full focus-visible:ring-2 focus-visible:outline-hidden"
      >
        <OptimizedImage
          image={image.image}
          alt={image.alt}
          width={width}
          height={height}
          sizes={sizes}
          loading="lazy"
          className="w-full"
        />
      </button>
      {hasCaption ? (
        // Below md the caption sits under the photo, where the narrow tiles
        // have no room to overlay it. From md up it is a scrim over the whole
        // tile: the scrim is the hover target, so it covers the photo rather
        // than a band of it. Without a dinner link the tile holds nothing
        // focusable, so the caption itself takes focus to reveal that scrim.
        <figcaption
          tabIndex={dinner ? undefined : 0}
          className={cn(
            "text-foreground/80 flex flex-col gap-1 pt-2 text-xs",
            "md:from-background md:pointer-events-none md:absolute md:inset-0 md:justify-end md:bg-linear-to-t md:to-transparent md:to-60% md:px-4 md:pt-12 md:pb-4 md:text-sm",
            "md:opacity-0 md:transition-opacity md:duration-200 md:group-focus-within:opacity-100 md:group-hover:opacity-100",
            dinner
              ? null
              : "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
          )}
        >
          {image.caption ? (
            <span className="font-light">{image.caption}</span>
          ) : null}
          {dinner ? <DinnerLabel event={dinner} /> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

function MosaicWall({
  images,
  columnCount,
  gap,
  display,
  showDinner,
  sizes,
  onOpen,
}: {
  images: GalleryImageModel[];
  columnCount: number;
  gap: string;
  display: string;
  showDinner: boolean;
  sizes: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className={cn("items-start", gap, display)}>
      {distribute(images, columnCount).map((column, index) => (
        <div
          key={index}
          className={cn("flex w-full min-w-0 flex-1 flex-col", gap)}
        >
          {column.map((image) => (
            <MosaicTile
              key={image.id}
              image={image}
              showDinner={showDinner}
              sizes={sizes}
              onOpen={onOpen}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MosaicGallery({
  images,
  variant = "page",
}: GalleryLayoutProps) {
  const t = useText();
  const isSection = variant === "section";
  const [openedAt, setOpenedAt] = useState(0);
  const [open, setOpen] = useState(false);

  const indexById = useMemo(
    () => new Map(images.map((image, index) => [image.id, index])),
    [images],
  );

  const viewer = (
    <GalleryLightbox
      images={images}
      startIndex={openedAt}
      open={open}
      onOpenChange={setOpen}
    />
  );

  const onOpen = (id: string) => {
    setOpenedAt(indexById.get(id) ?? 0);
    setOpen(true);
  };

  if (images.length === 0) {
    // embedded in a dinner's page there is nothing worth saying — the story
    // column carries the page on its own
    if (isSection) return null;

    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center md:py-24">
        <Eyebrow variant="tracked" tone="label">
          {t("gallery.wallEmptyTitle")}
        </Eyebrow>
        <p className="text-muted-foreground max-w-xs text-sm font-light whitespace-pre-line">
          {t("gallery.wallEmptyBody")}
        </p>
      </div>
    );
  }

  // The columns are dealt out here instead of by CSS multicol: WebKit
  // re-balances a multicol container whenever styles change inside it — the
  // tiles' fade-in on load is enough — and the second pass overfills the first
  // column, collapsing the wall.
  if (isSection) {
    return (
      <>
        <MosaicWall
          images={images}
          columnCount={2}
          gap="gap-2 md:gap-3"
          display="flex"
          showDinner={false}
          sizes="(min-width: 768px) 220px, 45vw"
          onOpen={onOpen}
        />
        {viewer}
      </>
    );
  }

  // Three column counts mean three groupings, so the page hangs a wall for each
  // and shows one at a time. All ask for the same URLs, so the browser still
  // fetches every photo once and the hidden walls are out of the a11y tree.
  return (
    <>
      <MosaicWall
        images={images}
        columnCount={1}
        gap="gap-3"
        display="flex md:hidden"
        showDinner
        sizes={PAGE_TILE_SIZES}
        onOpen={onOpen}
      />
      <MosaicWall
        images={images}
        columnCount={2}
        gap="gap-5"
        display="hidden md:flex lg:hidden"
        showDinner
        sizes={PAGE_TILE_SIZES}
        onOpen={onOpen}
      />
      <MosaicWall
        images={images}
        columnCount={3}
        gap="gap-5"
        display="hidden lg:flex"
        showDinner
        sizes={PAGE_TILE_SIZES}
        onOpen={onOpen}
      />
      {viewer}
    </>
  );
}
