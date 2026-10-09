import type { Route } from "./+types/faq";

import { RichText } from "~/components/rich-text";
import { RouteErrorContent } from "~/components/route-error-content";
import {
  Eyebrow,
  PageContainer,
  pageTitleClassName,
  SectionDivider,
} from "~/components/section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { metaText, useText } from "~/features/site-content/site-text";
import { listPublishedFaqEntries } from "~/models/faq.server";

export async function loader() {
  return { entries: await listPublishedFaqEntries() };
}

export const meta: Route.MetaFunction = ({ matches }) => [
  { title: metaText(matches, "faq.metaTitle") },
  { name: "description", content: metaText(matches, "faq.metaDescription") },
];

export default function FaqPage({ loaderData }: Route.ComponentProps) {
  const { entries } = loaderData;
  const t = useText();
  const contactBody = t("faq.contactBody");

  return (
    <PageContainer className="grow pt-14 pb-32 md:pt-20">
      <div className="mb-10 flex flex-col gap-4 md:mb-14">
        <Eyebrow variant="tracked" tone="primary">
          {t("faq.eyebrow")}
        </Eyebrow>
        <h1 className={pageTitleClassName}>{t("faq.title")}</h1>
        <p className="text-muted-foreground max-w-2xl text-base font-light whitespace-pre-line md:text-lg">
          {t("faq.intro")}
        </p>
      </div>

      {entries.length > 0 ? (
        <Accordion multiple hiddenUntilFound className="max-w-3xl border-t">
          {entries.map((entry) => (
            <AccordionItem key={entry.id} value={entry.id}>
              <AccordionTrigger className="gap-4 text-lg font-light md:text-xl">
                {entry.question}
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                <RichText text={entry.answer} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <p className="text-muted-foreground max-w-md text-base font-light whitespace-pre-line md:text-lg">
          {t("faq.empty")}
        </p>
      )}

      {contactBody ? (
        <section className="mt-16 flex max-w-3xl flex-col gap-4 md:mt-20">
          <SectionDivider>{t("faq.contactHeading")}</SectionDivider>
          <RichText text={contactBody} />
        </section>
      ) : null}
    </PageContainer>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <PageContainer className="grow pt-14 pb-32 md:pt-20">
      <RouteErrorContent error={error} />
    </PageContainer>
  );
}
