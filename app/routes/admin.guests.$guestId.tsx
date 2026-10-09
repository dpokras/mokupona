import { Link } from "react-router";

import type { Route } from "./+types/admin.guests.$guestId";

import { AdminPageHeader } from "~/components/admin-ui";
import { BackLink, SectionDivider } from "~/components/section";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import {
  formatAdminDate,
  formatAdminDateLine,
  formatAdminTimestamp,
} from "~/features/events/date-format";
import { getGuestById } from "~/features/guests/guests.server";
import { requireFound } from "~/shared/http.server";

export async function loader({ params }: Route.LoaderArgs) {
  const guest = await getGuestById(params.guestId).then(requireFound);

  return { guest };
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
  return [
    {
      title: loaderData
        ? `Admin - Guests - ${loaderData.guest.name}`
        : "Admin - Guests",
    },
  ];
};

export default function AdminGuestPage({ loaderData }: Route.ComponentProps) {
  const { guest } = loaderData;
  const asFriend = guest.visits.filter(
    (visit) => visit.role === "friend",
  ).length;

  const eyebrow = [
    `${guest.dinnerCount} ${guest.dinnerCount === 1 ? "dinner" : "dinners"}`,
    asFriend > 0 ? `${asFriend} as a friend` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="animate-page-in">
      <BackLink to="/admin/guests" prefetch="intent">
        Guests
      </BackLink>

      <AdminPageHeader
        eyebrow={eyebrow}
        title={guest.name || "Unnamed guest"}
      />

      <Card className="mb-6 p-4 md:p-5">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Fact label="Email">
            {guest.email ? (
              <a
                href={`mailto:${guest.email}`}
                className="hover:text-accent-light break-all transition-colors"
              >
                {guest.email}
              </a>
            ) : (
              <span className="text-muted-foreground">Not on file</span>
            )}
          </Fact>
          <Fact label="Phone">
            {guest.phone ? (
              <a
                href={`tel:${guest.phone.replace(/\s+/g, "")}`}
                className="hover:text-accent-light transition-colors"
              >
                {guest.phone}
              </a>
            ) : (
              <span className="text-muted-foreground">Not on file</span>
            )}
          </Fact>
          <Fact label="First dinner">
            <DinnerFact dinner={guest.firstDinner} />
          </Fact>
          <Fact label="Latest dinner">
            <DinnerFact dinner={guest.lastDinner} />
          </Fact>
        </dl>
      </Card>

      <SectionDivider className="mb-4">attendance history</SectionDivider>

      <div className="flex flex-col gap-3">
        {guest.visits.map((visit) => (
          <VisitCard key={visit.dinner.id} visit={visit} />
        ))}
      </div>
    </div>
  );
}

type GuestData = Awaited<ReturnType<typeof loader>>["guest"];
type Visit = GuestData["visits"][number];

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground mb-1 text-xs font-semibold">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function DinnerFact({ dinner }: { dinner: GuestData["firstDinner"] }) {
  const date = new Date(dinner.date);

  return (
    <>
      <Link
        to={`/admin/dinners/${dinner.id}/signups`}
        prefetch="intent"
        className="hover:text-accent-light font-semibold transition-colors"
      >
        {dinner.title}
      </Link>
      <span className="text-muted-foreground block">
        <time dateTime={date.toISOString()} suppressHydrationWarning>
          {formatAdminDate(date)}
        </time>
      </span>
    </>
  );
}

function roleLabel(visit: Visit) {
  if (visit.role === "signer") return "Own signup";
  if (visit.role === "legacy") return "Legacy signup";
  return "Came as a friend";
}

function VisitCard({ visit }: { visit: Visit }) {
  const date = new Date(visit.dinner.date);
  const signedUpAt = new Date(visit.signedUpAt);

  return (
    <Card
      interactive
      className="relative flex flex-wrap items-center gap-x-3 gap-y-2 p-4"
    >
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide">
          <time dateTime={date.toISOString()} suppressHydrationWarning>
            {formatAdminDateLine(date)}
          </time>
        </p>
        <h2 className="mt-1 truncate text-base font-semibold">
          <Link
            to={`/admin/dinners/${visit.dinner.id}/signups`}
            prefetch="intent"
            className="focus-visible:after:ring-ring after:absolute after:inset-0 focus-visible:after:ring-2 after:focus-visible:outline-hidden"
          >
            {visit.dinner.title}
          </Link>
        </h2>
      </div>
      <div className="flex flex-col gap-1 max-md:w-full md:items-end">
        <Badge
          variant={visit.role === "friend" ? "info" : "secondary"}
          className="w-fit"
        >
          {roleLabel(visit)}
        </Badge>
        <span className="text-muted-foreground text-xs">
          Signed up
          {visit.broughtBy ? (
            <>
              {" by "}
              <Link
                to={`/admin/guests/${visit.broughtBy.id}`}
                prefetch="intent"
                className="hover:text-foreground relative underline underline-offset-2 transition-colors"
              >
                {visit.broughtBy.name}
              </Link>
              {" ·"}
            </>
          ) : null}{" "}
          <time dateTime={signedUpAt.toISOString()} suppressHydrationWarning>
            {formatAdminTimestamp(signedUpAt)}
          </time>
        </span>
      </div>
    </Card>
  );
}
