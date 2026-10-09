import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  MessageCircleQuestionIcon,
  PlusIcon,
} from "lucide-react";
import { Form, Link, useFetcher, useNavigation } from "react-router";

import type { Route } from "./+types/admin.content.faq._index";

import { AdminDeleteButton } from "~/components/admin-delete-button";
import { AdminEmptyState, AdminPageHeader } from "~/components/admin-ui";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { listFaqEntries } from "~/models/faq.server";

export async function loader() {
  const entries = await listFaqEntries();

  return {
    entries: entries.map(({ id, question, answer, published }) => ({
      id,
      question,
      answer,
      published,
    })),
  };
}

export const meta: Route.MetaFunction = () => [{ title: "Admin - FAQ" }];

type FaqRow = Route.ComponentProps["loaderData"]["entries"][number];

export default function AdminFaqPage({ loaderData }: Route.ComponentProps) {
  const { entries } = loaderData;
  const published = entries.filter((entry) => entry.published).length;

  return (
    <div className="animate-page-in">
      <Link
        to="/admin/content"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" />
        site content
      </Link>

      <AdminPageHeader
        eyebrow={`${entries.length} ${entries.length === 1 ? "question" : "questions"} · ${published} published`}
        title="FAQ"
        subtitle="The questions on the public FAQ page, in the order shown there."
        actions={
          <>
            <Link
              to="/admin/content/texts/faq"
              className={buttonVariants({ variant: "outline" })}
            >
              Page title and intro
            </Link>
            <Link to="/admin/content/faq/new" className={buttonVariants()}>
              <PlusIcon className="size-4" />
              New question
            </Link>
          </>
        }
      />

      {entries.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <FaqEntryRow
              key={entry.id}
              entry={entry}
              isFirst={index === 0}
              isLast={index === entries.length - 1}
            />
          ))}
        </ol>
      ) : (
        <AdminEmptyState
          icon={<MessageCircleQuestionIcon className="size-6" />}
          title="No questions yet"
          description="Start from a handful of common questions for a dinner club, or write your own."
          action={<EmptyStateActions />}
        />
      )}
    </div>
  );
}

function EmptyStateActions() {
  const navigation = useNavigation();
  const adding =
    navigation.state === "submitting" &&
    navigation.formAction === "/admin/content/faq/starter-questions";

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Form method="POST" action="/admin/content/faq/starter-questions">
        <Button type="submit" disabled={adding}>
          {adding ? "Adding…" : "Add starter questions"}
        </Button>
      </Form>
      <Link
        to="/admin/content/faq/new"
        className={buttonVariants({ variant: "outline" })}
      >
        New question
      </Link>
    </div>
  );
}

function FaqEntryRow({
  entry,
  isFirst,
  isLast,
}: {
  entry: FaqRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { id, question, answer, published } = entry;

  return (
    <li>
      <Card className="flex items-start gap-3 p-4">
        <MoveButtons id={id} isFirst={isFirst} isLast={isLast} />

        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{question}</h2>
              <Badge variant={published ? "info" : "secondary"} pill>
                {published ? "published" : "hidden"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
              {answer}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <Link
              to={`/admin/content/faq/${id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit
            </Link>
            <AdminDeleteButton action={`/admin/content/faq/${id}/delete`} />
          </div>
        </div>
      </Card>
    </li>
  );
}

function MoveButtons({
  id,
  isFirst,
  isLast,
}: {
  id: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const fetcher = useFetcher();
  const moving = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="POST"
      action={`/admin/content/faq/${id}/move`}
      className="flex shrink-0 flex-col gap-1"
    >
      <Button
        type="submit"
        name="direction"
        value="up"
        variant="ghost"
        size="icon-sm"
        disabled={isFirst || moving}
        aria-label="Move up"
        title="Move up"
      >
        <ArrowUpIcon className="size-4" />
      </Button>
      <Button
        type="submit"
        name="direction"
        value="down"
        variant="ghost"
        size="icon-sm"
        disabled={isLast || moving}
        aria-label="Move down"
        title="Move down"
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    </fetcher.Form>
  );
}
