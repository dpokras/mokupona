import { Link } from "react-router";

import type { GalleryImageModel } from "../view-models";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { formatEventMonthYear } from "~/features/events/date-format";
import { useText } from "~/features/site-content/site-text";
import { cn } from "~/lib/utils";
import { getImageUrl, RESPONSIVE_IMAGE_WIDTHS } from "~/shared/image";
import { useImageConfig } from "~/shared/root-data";

const SLIDE_WIDTH = 1280;

const FALLBACK_ASPECT = 3 / 2;

const ARROW_CLASS =
  "bg-card/90 text-foreground hover:bg-card z-10 top-1/2 -translate-y-1/2 shadow-md backdrop-blur-sm";

function GallerySlide({ image }: { image: GalleryImageModel }) {
  const config = useImageConfig();
  const { width, height } = image.image;
  const aspect = width && height ? width / height : FALLBACK_ASPECT;
  const slideHeight = Math.round(SLIDE_WIDTH / aspect);
  const event = image.event;
  const date = event ? new Date(event.date) : null;

  const src = getImageUrl(image.image, config, {
    width: SLIDE_WIDTH,
    height: slideHeight,
    fit: "contain",
  });

  const srcSet = RESPONSIVE_IMAGE_WIDTHS.map((w) => {
    const h = Math.round(w / aspect);
    const url = getImageUrl(image.image, config, {
      width: w,
      height: h,
      fit: "contain",
    });
    return `${url} ${w}w`;
  }).join(", ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-[60dvh] items-center justify-center">
        {src ? (
          <img
            src={src}
            srcSet={srcSet}
            sizes="(min-width: 1024px) 960px, 90vw"
            width={SLIDE_WIDTH}
            height={slideHeight}
            alt={image.alt}
            className="h-auto max-h-full w-auto max-w-full object-contain"
          />
        ) : null}
      </div>
      {image.caption || event ? (
        <div className="text-foreground/80 flex flex-col gap-1 text-sm">
          {image.caption ? (
            <span className="font-light">{image.caption}</span>
          ) : null}
          {event && date ? (
            <Link
              to={`/dinners/${event.id}`}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring w-fit transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
            >
              {event.title} ·{" "}
              <time dateTime={date.toISOString()} suppressHydrationWarning>
                {formatEventMonthYear(date)}
              </time>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function GalleryLightbox({
  images,
  startIndex,
  open,
  onOpenChange,
}: {
  images: GalleryImageModel[];
  startIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useText();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto"
        closeLabel={t("gallery.viewerClose")}
      >
        <DialogTitle className="sr-only">
          {t("gallery.viewerTitle")}
        </DialogTitle>
        <Carousel opts={{ startIndex, loop: true }}>
          <CarouselContent>
            {images.map((image) => (
              <CarouselItem key={image.id}>
                <GallerySlide image={image} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious
            className={cn(ARROW_CLASS, "left-2")}
            aria-label={t("gallery.viewerPrevious")}
          />
          <CarouselNext
            className={cn(ARROW_CLASS, "right-2")}
            aria-label={t("gallery.viewerNext")}
          />
        </Carousel>
      </DialogContent>
    </Dialog>
  );
}
