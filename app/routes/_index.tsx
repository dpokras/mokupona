import type { Route } from "./+types/_index";

import {
  TextSectionBlockView,
  type TextSectionBlockType,
} from "~/features/cms/blocks/text-section";
import {
  TitleCardBlockView,
  type TitleCardBlockType,
} from "~/features/cms/blocks/title-card";
import { LandingDinnersSection } from "~/features/events/components/landing-dinners-section";
import {
  orderEventsByStatus,
  partitionEvents,
} from "~/features/events/event-status";
import { toEventCardModel } from "~/features/events/view-models";
import { IMAGE_SLOTS } from "~/features/site-content/image-slots";
import { metaText, useText } from "~/features/site-content/site-text";
import { getEventsWithAddress } from "~/models/event.server";
import { getImageUrl } from "~/shared/image";
import { withOpenGraphUrls } from "~/shared/meta";
import { getImageConfig, getSiteImage } from "~/shared/root-data";

const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

/** Three past dinners, then a "see more" tile fills the fourth slot. */
const PAST_DINNERS_ON_LANDING = 3;

export const loader = async () => {
  const events = await getEventsWithAddress();

  return { events: events.map(toEventCardModel) };
};

export const meta: Route.MetaFunction = ({ matches, location }) => {
  const metaTags = [
    { title: metaText(matches, "landing.metaTitle") },
    {
      name: "description",
      content: metaText(matches, "landing.metaDescription"),
    },
  ] satisfies ReturnType<Route.MetaFunction>;

  const tags = [
    ...metaTags,
    { property: "og:title", content: metaTags[0].title },
    { property: "og:type", content: "website" },
  ];

  const ogImageUrl = getImageUrl(
    getSiteImage(matches, "shareImage") ?? IMAGE_SLOTS.shareImage.fallback,
    getImageConfig(matches),
    { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT },
  );

  return withOpenGraphUrls(tags, {
    matches,
    imagePath: ogImageUrl || undefined,
    pagePath: location.pathname,
  });
};

export default function Index({ loaderData }: Route.ComponentProps) {
  const { events } = loaderData;
  const t = useText();

  const titleCardData: TitleCardBlockType = {
    type: "title-card",
    version: 1,
    data: {
      title: t("landing.wordmarkAlt"),
      // hand-drawn wordmark; `title` above is its alt text
      logo: { src: "/naive-title.svg", width: 1258, height: 368 },
      tagline: t("landing.tagline"),
      scrollCue: { href: "#vision", label: t("landing.scrollCue") },
    },
  };

  const visionSectionData: TextSectionBlockType = {
    type: "text-section",
    version: 1,
    data: {
      eyebrow: t("landing.visionHeading"),
      eyebrowHandwritten: "ourVision",
      headline: t("landing.visionHeadline"),
      body: t("landing.visionBody"),
      variant: "plain",
    },
  };

  const now = new Date();
  const { upcoming, past } = partitionEvents(events, now);
  const orderedPast = orderEventsByStatus(past, now);
  const pastDinners = orderedPast.slice(0, PAST_DINNERS_ON_LANDING);

  return (
    <main>
      <TitleCardBlockView blockData={titleCardData} />

      <TextSectionBlockView id="vision" blockData={visionSectionData} />

      <LandingDinnersSection
        upcoming={upcoming}
        past={pastDinners}
        hasMore={orderedPast.length > pastDinners.length}
      />
    </main>
  );
}
