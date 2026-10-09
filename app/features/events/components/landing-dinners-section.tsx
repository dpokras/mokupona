import type { EventCardModel } from "../view-models";

import { FeaturedEventCard, CompactEventCard } from "./event-card";

import {
  PageContainer,
  SecondaryCTA,
  SectionDivider,
} from "~/components/section";
import { useText } from "~/features/site-content/site-text";

type LandingDinnersSectionProps = {
  upcoming: EventCardModel[];
  /** The trimmed, ordered past dinners — rendered as-is. */
  past: EventCardModel[];
  /** Whether any past dinners were left off, which the tile leads to. */
  hasMore: boolean;
};

/**
 * The dinners the landing page shows once you scroll past the title card:
 * the single next gathering, then a few of the dinners already eaten.
 * The featured card drops its facts row here — price, seats and location are
 * for deciding, and the decision happens on the dinner's own page.
 */
export function LandingDinnersSection({
  upcoming,
  past,
  hasMore,
}: LandingDinnersSectionProps) {
  const t = useText();
  const nextDinner = upcoming.at(0);

  return (
    <PageContainer as="section" className="pt-14 pb-20 md:pt-20 md:pb-28">
      <SectionDivider className="mb-5" handwritten="nextDinner">
        {t("landing.nextDinnerHeading")}
      </SectionDivider>

      {nextDinner ? (
        <div className="mb-14 md:mb-20">
          <FeaturedEventCard event={nextDinner} showFacts={false} />
        </div>
      ) : (
        <p className="text-muted-foreground mb-14 max-w-md text-base font-light whitespace-pre-line md:mb-20 md:text-lg">
          {t("landing.noUpcomingDinner")}
        </p>
      )}

      {past.length > 0 ? (
        <>
          <SectionDivider className="mb-5" handwritten="pastDinners">
            {t("landing.pastDinnersHeading")}
          </SectionDivider>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4">
            {past.map((event) => (
              <CompactEventCard key={event.id} event={event} />
            ))}
            {hasMore ? <SeeMoreTile label={t("landing.seeMoreLink")} /> : null}
          </div>
        </>
      ) : null}

      {/* The tile already leads to /dinners, so the link would only repeat it. */}
      {!hasMore && (past.length > 0 || nextDinner) ? (
        <div className="mt-10 flex justify-center md:mt-14">
          <SecondaryCTA to="/dinners">{t("landing.seeAllLink")}</SecondaryCTA>
        </div>
      ) : null}
    </PageContainer>
  );
}

/**
 * Sits in the grid slot after the last past dinner. No border or fill — it
 * borrows the 3:2 of the cover images only to sit on their centre line, so
 * the link reads as part of the row rather than a fourth card.
 */
function SeeMoreTile({ label }: { label: string }) {
  return (
    <div className="flex aspect-3/2 items-center justify-center">
      <SecondaryCTA to="/dinners">{label}</SecondaryCTA>
    </div>
  );
}
