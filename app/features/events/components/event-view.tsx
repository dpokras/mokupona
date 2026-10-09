import { CalendarIcon, InfoIcon } from "lucide-react";

import { formatEventDateLine } from "../date-format";
import type { EventDetailModel } from "../view-models";

import {
  EventDateHeading,
  EventLocationFact,
  EventPriceFact,
  EventSeatsFact,
} from "./event-facts";

import { AutoLink } from "~/components/auto-link";
import { CoverImage } from "~/components/cover-image";
import { pageTitleClassName } from "~/components/section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useText } from "~/features/site-content/site-text";

export interface EventViewProps {
  event: EventDetailModel;
}

export function EventStory({ event }: EventViewProps) {
  const t = useText();

  return (
    <div className="flex min-w-0 flex-col gap-5 md:gap-6">
      <CoverImage
        image={event.image}
        alt=""
        sizes="(min-width: 1024px) 520px, 100vw"
        className="w-full"
      />

      <div className="flex flex-col gap-3">
        <EventDateHeading date={event.date} />
        <h1 className={pageTitleClassName}>{event.title}</h1>
      </div>

      <p className="text-foreground/80 text-base font-light whitespace-pre-line md:text-lg">
        <AutoLink text={event.description} />
      </p>

      {event.menuDescription || event.donationDescription ? (
        <Accordion defaultValue={["menu"]} className="mt-2 border-t">
          {event.menuDescription ? (
            <AccordionItem value="menu">
              <AccordionTrigger className="text-primary">
                {t("dinner.menuHeading")}
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                <p className="text-foreground/80 text-base font-light whitespace-pre-line">
                  <AutoLink text={event.menuDescription} />
                </p>
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {event.donationDescription ? (
            <AccordionItem value="donation">
              <AccordionTrigger className="text-primary">
                {t("dinner.donationHeading")}
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                <p className="text-foreground/80 text-base font-light whitespace-pre-line">
                  <AutoLink text={event.donationDescription} />
                </p>
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      ) : null}
    </div>
  );
}

export function EventFactList({ event }: EventViewProps) {
  const t = useText();
  const eventDate = new Date(event.date);

  return (
    <div className="text-foreground/80 flex flex-col gap-3 text-sm">
      <span className="flex items-center gap-2">
        <CalendarIcon className="text-muted-foreground size-4" />
        <time dateTime={eventDate.toISOString()} suppressHydrationWarning>
          {formatEventDateLine(eventDate, "short")}
        </time>
      </span>

      <EventLocationFact addressLine={event.addressLine} />

      <div className="flex items-center justify-between">
        <EventPriceFact price={event.price} />

        <Popover>
          <PopoverTrigger>
            <span className="text-primary border-primary/60 flex items-center gap-1 border-b border-dotted text-xs">
              {t("dinner.discountsButton")}
              <InfoIcon className="size-4" />
            </span>
          </PopoverTrigger>
          <PopoverContent>
            <p className="text-sm whitespace-pre-line">
              {event.discounts ?? t("dinner.noDiscounts")}
            </p>
          </PopoverContent>
        </Popover>
      </div>

      <EventSeatsFact slots={event.slots} />
    </div>
  );
}

export function EventView({ event }: EventViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <EventFactList event={event} />
      <EventStory event={event} />
    </div>
  );
}
