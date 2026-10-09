import { Link } from "react-router";

import { formatEventMonthYear } from "../date-format";
import type { EventCardModel } from "../view-models";

import {
  EventDateHeading,
  EventLocationFact,
  EventPriceFact,
  EventSeatsFact,
} from "./event-facts";

import { CoverImage } from "~/components/cover-image";
import { SecondaryCTA } from "~/components/section";
import { Badge } from "~/components/ui/badge";
import { buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { useText } from "~/features/site-content/site-text";

export function FeaturedEventCard({
  event,
  isNext = true,
  /** The landing page hides these; /dinners keeps them for choosing. */
  showFacts = true,
}: {
  event: EventCardModel;
  isNext?: boolean;
  showFacts?: boolean;
}) {
  const t = useText();

  return (
    // No panel: the photograph and the type sit straight on the paper, and
    // the column gap does the separating a card fill used to do.
    <article className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      <div className="relative lg:w-3/5 lg:shrink-0">
        <CoverImage
          image={event.image}
          alt=""
          sizes="(min-width: 1024px) 584px, 100vw"
          className="w-full"
        />
        {isNext ? (
          <Badge pill className="absolute top-0 left-0">
            {t("dinners.nextDinnerBadge")}
          </Badge>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-4">
        <EventDateHeading date={event.date} />

        <h2 className="line-clamp-2 text-2xl leading-tight font-light tracking-tight lg:text-3xl">
          {event.title}
        </h2>

        <p className="text-muted-foreground line-clamp-3 text-sm font-light lg:line-clamp-2 lg:text-base">
          {event.description}
        </p>

        {showFacts ? (
          <div className="text-muted-foreground flex flex-wrap gap-4 border-y py-3 text-sm md:gap-6">
            <EventLocationFact addressLine={event.addressLine} />
            <EventPriceFact price={event.price} />
            <EventSeatsFact slots={event.slots} />
          </div>
        ) : null}

        <div className="mt-1 flex flex-col gap-4 md:flex-row md:items-center md:gap-5">
          <Link
            to={`/dinners/${event.id}#sign-up`}
            className={buttonVariants()}
          >
            {t("dinners.reserveButton")}
          </Link>
          <SecondaryCTA to={`/dinners/${event.id}`} className="max-md:hidden">
            {t("dinners.readMoreLink")}
          </SecondaryCTA>
        </div>
      </div>
    </article>
  );
}

export function CompactEventCard({ event }: { event: EventCardModel }) {
  const t = useText();
  const eventDate = new Date(event.date);
  const hasGallery = event.galleryImageCount > 0;

  return (
    <Link
      to={hasGallery ? `/dinners/${event.id}/gallery` : `/dinners/${event.id}`}
      className="group flex flex-col gap-2"
    >
      {/* Dimming the whole card washed out on the light ground, so the
          rest-state treatment sits on the image alone. */}
      <div className="overflow-hidden">
        <CoverImage
          image={event.image}
          alt=""
          sizes="(min-width: 768px) 300px, 45vw"
          className="w-full transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </div>
      <span className="text-muted-foreground flex items-center gap-2 text-xs">
        <time dateTime={eventDate.toISOString()} suppressHydrationWarning>
          {formatEventMonthYear(eventDate)}
        </time>
        {hasGallery ? <span aria-hidden="true">·</span> : null}
        {hasGallery ? (
          <span>
            {t(
              event.galleryImageCount === 1
                ? "dinners.photoCountOne"
                : "dinners.photoCountMany",
              { count: event.galleryImageCount },
            )}
          </span>
        ) : null}
      </span>
      <h4 className="text-base font-light group-hover:underline md:text-lg">
        {event.title}
      </h4>
    </Link>
  );
}
