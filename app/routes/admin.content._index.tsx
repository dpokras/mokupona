import {
  ChevronRightIcon,
  ImageIcon,
  MessageCircleQuestionIcon,
} from "lucide-react";
import { Link } from "react-router";

import type { Route } from "./+types/admin.content._index";

import { AdminPageHeader } from "~/components/admin-ui";
import { Eyebrow } from "~/components/section";
import { Card } from "~/components/ui/card";
import {
  TEXT_CATALOG,
  TEXT_CATEGORY_IDS,
} from "~/features/site-content/catalog";
import { countCustomizedTexts } from "~/features/site-content/site-texts.server";

export async function loader() {
  const customized = await countCustomizedTexts();

  return {
    categories: TEXT_CATEGORY_IDS.map((id) => ({
      id,
      title: TEXT_CATALOG[id].title,
      description: TEXT_CATALOG[id].description,
      total: Object.keys(TEXT_CATALOG[id].entries).length,
      customized: customized[id],
    })).filter((category) => category.total > 0),
  };
}

export const meta: Route.MetaFunction = () => [
  { title: "Admin - Site content" },
];

export default function AdminContentPage({ loaderData }: Route.ComponentProps) {
  const { categories } = loaderData;

  return (
    <div className="animate-page-in">
      <AdminPageHeader
        eyebrow="site content"
        title="Site content"
        subtitle="Change the words and pictures guests see on the website."
      />

      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <Eyebrow variant="tracked" tone="label">
            more than text
          </Eyebrow>
          <div className="grid gap-3 md:grid-cols-2">
            <ContentLink
              to="faq"
              icon={<MessageCircleQuestionIcon className="size-5" />}
              title="FAQ"
              description="Add, edit and reorder the questions on the FAQ page."
            />
            <ContentLink
              to="images"
              icon={<ImageIcon className="size-5" />}
              title="Images"
              description="Replace the pictures used on pages other than dinners."
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <Eyebrow variant="tracked" tone="label">
            texts by page
          </Eyebrow>
          <div className="grid gap-3 md:grid-cols-2">
            {categories.map((category) => (
              <ContentLink
                key={category.id}
                to={`texts/${category.id}`}
                title={category.title}
                description={category.description}
                meta={`${category.total} texts${category.customized > 0 ? ` · ${category.customized} edited` : ""}`}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ContentLink({
  to,
  icon,
  title,
  description,
  meta,
}: {
  to: string;
  icon?: React.ReactNode;
  title: string;
  description: string;
  meta?: string;
}) {
  return (
    <Link to={to} prefetch="intent" className="group">
      <Card className="group-hover:border-primary/40 flex h-full items-center gap-4 p-4 transition-colors md:p-5">
        {icon ? <span className="text-primary">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{title}</p>
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          {meta ? (
            <p className="text-muted-foreground mt-2 text-xs font-semibold">
              {meta}
            </p>
          ) : null}
        </div>
        <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" />
      </Card>
    </Link>
  );
}
