import {
  CalendarIcon,
  CreditCardIcon,
  MapPinIcon,
  UserIcon,
} from "lucide-react";

import { formatEventDateLine } from "../date-format";
import type { SerializableDate } from "../view-models";

import { useText } from "~/features/site-content/site-text";

export function EventDateHeading({ date }: { date: SerializableDate }) {
  const eventDate = new Date(date);

  return (
    <span className="text-primary flex items-center gap-2 text-sm font-semibold">
      <CalendarIcon className="size-4" />
      <time dateTime={eventDate.toISOString()} suppressHydrationWarning>
        {formatEventDateLine(eventDate, "long")}
      </time>
    </span>
  );
}

export function EventLocationFact({ addressLine }: { addressLine: string }) {
  const t = useText();

  return (
    <span className="flex items-center gap-2">
      <MapPinIcon className="text-muted-foreground size-4" />
      <span className="sr-only">{t("dinner.locationLabel")}</span>
      <span>{addressLine}</span>
    </span>
  );
}

export function EventPriceFact({ price }: { price: number }) {
  const t = useText();

  return (
    <span className="flex items-center gap-2">
      <CreditCardIcon className="text-muted-foreground size-4" />
      <span className="sr-only">{t("dinner.priceLabel")}</span>
      {t("dinner.price", { price })}
    </span>
  );
}

export function EventSeatsFact({ slots }: { slots: number }) {
  const t = useText();

  return (
    <span className="flex items-center gap-2">
      <UserIcon className="text-muted-foreground size-4" />
      <span>
        {t(slots === 1 ? "dinner.seatsOne" : "dinner.seatsMany", {
          count: slots,
        })}
      </span>
    </span>
  );
}
