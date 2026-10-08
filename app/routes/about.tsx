import type { Route } from "./+types/about";

import { OptimizedImage } from "~/components/optimized-image";
import { RouteErrorContent } from "~/components/route-error-content";
import {
  Eyebrow,
  PageContainer,
  pageTitleClassName,
  SectionDivider,
} from "~/components/section";
import {
  TextSectionBlockView,
  type TextSectionBlockType,
} from "~/features/cms/blocks/text-section";
import { metaText, useText } from "~/features/site-content/site-text";
import { listBoardMembers } from "~/models/board-member.server";
import type { ImageMetadata } from "~/models/image.server";

/** Square portraits keep the grid honest whatever aspect the upload had. */
const PORTRAIT_SIZE = 320;

export async function loader() {
  return { volunteers: await listBoardMembers() };
}

export const meta: Route.MetaFunction = ({ matches }) => [
  { title: metaText(matches, "about.metaTitle") },
  {
    name: "description",
    content: metaText(matches, "about.metaDescription"),
  },
];

export default function AboutPage({ loaderData }: Route.ComponentProps) {
  const { volunteers } = loaderData;
  const t = useText();

  const whoWeAreSectionData: TextSectionBlockType = {
    type: "text-section",
    version: 1,
    data: {
      eyebrow: t("about.whoWeAreEyebrow"),
      headline: t("about.whoWeAreHeading"),
      body: t("about.whoWeAreBody"),
      variant: "feature",
    },
  };

  return (
    // TextSectionBlockView carries its own PageContainer, so the sections sit
    // side by side under <main> rather than nested inside a second container
    // — nesting them would indent the block past the rest of the page.
    <main className="grow pt-14 pb-32 md:pt-20">
      <PageContainer as="div">
        <div className="flex flex-col gap-4">
          <Eyebrow variant="tracked" tone="primary">
            {t("about.eyebrow")}
          </Eyebrow>
          <h1 className={pageTitleClassName}>{t("about.title")}</h1>
          <p className="text-muted-foreground max-w-2xl text-base font-light whitespace-pre-line md:text-lg">
            {t("about.intro")}
          </p>
        </div>
      </PageContainer>

      <TextSectionBlockView blockData={whoWeAreSectionData} />

      <PageContainer as="div">
        <SectionDivider className="mb-8">
          {t("about.hallOfFameHeading")}
        </SectionDivider>

        {volunteers.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {volunteers.map((volunteer) => (
              <VolunteerCard key={volunteer.id} volunteer={volunteer} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground max-w-md text-base font-light whitespace-pre-line md:text-lg">
            {t("about.hallOfFameEmpty")}
          </p>
        )}
      </PageContainer>
    </main>
  );
}

function VolunteerCard({
  volunteer,
}: {
  volunteer: {
    id: string;
    name: string;
    position: string;
    image: ImageMetadata | null;
  };
}) {
  return (
    <li className="flex flex-col gap-3">
      {/* the sage fill is the placeholder's own backdrop, not a card, so it
          only appears when there is no portrait to show */}
      <div className={volunteer.image ? "overflow-hidden" : "bg-sage/40"}>
        {volunteer.image ? (
          <OptimizedImage
            image={volunteer.image}
            alt={volunteer.name}
            width={PORTRAIT_SIZE}
            height={PORTRAIT_SIZE}
            loading="lazy"
            sizes="(min-width: 1024px) 260px, (min-width: 640px) 30vw, 45vw"
            className="w-full"
          />
        ) : (
          <PortraitPlaceholder name={volunteer.name} />
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <h3 className="text-base leading-tight font-light md:text-lg">
          {volunteer.name}
        </h3>
        <p className="text-muted-foreground text-xs md:text-sm">
          {volunteer.position}
        </p>
      </div>
    </li>
  );
}

/** Stands in until someone uploads a portrait — initials on a sage card. */
function PortraitPlaceholder({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="text-ink/60 flex aspect-square items-center justify-center text-3xl font-light"
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <PageContainer className="grow pt-14 pb-32 md:pt-20">
      <RouteErrorContent error={error} />
    </PageContainer>
  );
}
