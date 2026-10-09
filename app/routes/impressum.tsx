import type { ReactNode } from "react";

import type { Route } from "./+types/impressum";

import { RichText } from "~/components/rich-text";
import { RouteErrorContent } from "~/components/route-error-content";
import {
  Eyebrow,
  PageContainer,
  pageTitleClassName,
} from "~/components/section";
import { metaText, useText } from "~/features/site-content/site-text";
import { loadSiteTexts } from "~/features/site-content/site-texts.server";

export async function loader() {
  return { siteTexts: await loadSiteTexts("impressum") };
}

export const meta: Route.MetaFunction = ({ matches }) => [
  { title: metaText(matches, "impressum.metaTitle") },
  {
    name: "description",
    content: metaText(matches, "impressum.metaDescription"),
  },
];

const linkClassName = "text-primary underline underline-offset-2";

function websiteHref(address: string) {
  return /^https?:\/\//i.test(address) ? address : `https://${address}`;
}

export default function ImpressumPage() {
  const t = useText();
  const intro = t("impressum.intro");
  const responsiblePerson = t("impressum.responsiblePerson");
  const uid = t("impressum.uid");
  const email = t("impressum.email");
  const website = t("impressum.website");
  const additionalInfo = t("impressum.additionalInfo");

  return (
    <PageContainer className="grow pt-14 pb-32 md:pt-20">
      <div className="mb-10 flex flex-col gap-4 md:mb-14">
        <Eyebrow variant="tracked" tone="primary">
          {t("impressum.eyebrow")}
        </Eyebrow>
        <h1 className={pageTitleClassName}>{t("impressum.title")}</h1>
        {intro ? (
          <p className="text-muted-foreground max-w-2xl text-base font-light whitespace-pre-line md:text-lg">
            {intro}
          </p>
        ) : null}
      </div>

      <div className="flex max-w-3xl flex-col gap-10 md:gap-12">
        <Section title={t("impressum.operatorHeading")}>
          <address className="text-foreground/80 text-base font-light not-italic">
            {t("impressum.organisationName")}
            <br />
            {t("impressum.street")}
            <br />
            {t("impressum.postcodeCity")}
            <br />
            {t("impressum.country")}
          </address>
          {responsiblePerson || uid ? (
            <Facts>
              {responsiblePerson ? (
                <Fact label={t("impressum.responsiblePersonLabel")}>
                  {responsiblePerson}
                </Fact>
              ) : null}
              {uid ? <Fact label={t("impressum.uidLabel")}>{uid}</Fact> : null}
            </Facts>
          ) : null}
        </Section>

        <Section title={t("impressum.contactHeading")}>
          <Facts>
            <Fact label={t("impressum.emailLabel")}>
              <a href={`mailto:${email}`} className={linkClassName}>
                {email}
              </a>
            </Fact>
            {website ? (
              <Fact label={t("impressum.websiteLabel")}>
                <a href={websiteHref(website)} className={linkClassName}>
                  {website}
                </a>
              </Fact>
            ) : null}
          </Facts>
        </Section>

        {additionalInfo ? <RichText text={additionalInfo} /> : null}
      </div>
    </PageContainer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl leading-tight font-light tracking-tight md:text-3xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return (
    <dl className="flex flex-col gap-3 text-base font-light">{children}</dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-6">
      <dt className="text-muted-foreground shrink-0 sm:w-56">{label}</dt>
      <dd className="text-foreground/80 min-w-0 break-words">{children}</dd>
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
