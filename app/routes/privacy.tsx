import type { Route } from "./+types/privacy";

import { RichText } from "~/components/rich-text";
import { RouteErrorContent } from "~/components/route-error-content";
import { PageContainer, pageTitleClassName } from "~/components/section";
import { metaText, useText } from "~/features/site-content/site-text";
import { loadSiteTexts } from "~/features/site-content/site-texts.server";
import { cn } from "~/lib/utils";

export async function loader() {
  return { siteTexts: await loadSiteTexts("privacy") };
}

export const meta: Route.MetaFunction = ({ matches }) => [
  { title: metaText(matches, "privacy.title") },
];

export default function PrivacyPage() {
  const t = useText();
  const lastUpdated = t("privacy.lastUpdated");

  return (
    <PageContainer className="grow pt-7 pb-20">
      <h1 className={cn("mb-9 md:mb-12", pageTitleClassName)}>
        {t("privacy.title")}
      </h1>

      <RichText text={t("privacy.body")} />

      {lastUpdated ? (
        <p className="text-foreground/80 mt-6 text-base font-light">
          {lastUpdated}
        </p>
      ) : null}
    </PageContainer>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <PageContainer className="grow pt-7 pb-20">
      <RouteErrorContent error={error} />
    </PageContainer>
  );
}
