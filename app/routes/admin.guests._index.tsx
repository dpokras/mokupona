import { DownloadIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/admin.guests._index";

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminSearchField,
  FilterChip,
  InitialsAvatar,
} from "~/components/admin-ui";
import { buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { formatAdminDate } from "~/features/events/date-format";
import { getGuests, summarizeGuest } from "~/features/guests/guests.server";

export async function loader() {
  const now = new Date();
  const guests = await getGuests();

  return { guests: guests.map((guest) => summarizeGuest(guest, now)) };
}

export const meta: Route.MetaFunction = () => {
  return [{ title: "Admin - Guests" }];
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "returning", label: "Came more than once" },
  { id: "this-year", label: "This year" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

export default function AdminGuestsPage({ loaderData }: Route.ComponentProps) {
  const { guests } = loaderData;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const q = query.trim().toLowerCase();
  const visible = guests
    .filter((guest) =>
      filter === "all"
        ? true
        : filter === "returning"
          ? guest.dinnerCount > 1
          : guest.cameThisYear,
    )
    .filter(
      (guest) =>
        !q || guest.name.toLowerCase().includes(q) || guest.email.includes(q),
    );

  return (
    <div className="animate-page-in">
      <AdminPageHeader
        eyebrow={`${guests.length} guests`}
        title="Guests"
        actions={
          <a
            href="/admin/guests.csv"
            className={buttonVariants({ variant: "outline" })}
          >
            <DownloadIcon className="size-4" />
            Export CSV
          </a>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <AdminSearchField
          value={query}
          onChange={setQuery}
          placeholder="Search by name or email"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ id, label }) => (
            <FilterChip
              key={id}
              active={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </FilterChip>
          ))}
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="flex flex-col gap-3">
          {visible.map((guest, index) => (
            <GuestCard key={guest.id} guest={guest} seed={index} />
          ))}
        </div>
      ) : guests.length === 0 ? (
        <AdminEmptyState
          icon={<UsersIcon className="size-6" />}
          title="No guests yet"
          description="Everyone who signs up for a dinner shows up here."
        />
      ) : (
        <AdminEmptyState
          icon={<UsersIcon className="size-6" />}
          title="No guests match"
          description="Try a different search or filter."
        />
      )}
    </div>
  );
}

type GuestRow = Awaited<ReturnType<typeof loader>>["guests"][number];

function GuestCard({ guest, seed }: { guest: GuestRow; seed: number }) {
  const lastDate = new Date(guest.lastDinner.date);

  return (
    <Card
      interactive
      className="relative flex flex-wrap items-center gap-x-3 gap-y-2 p-4"
    >
      <InitialsAvatar name={guest.name} seed={seed} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold">
          <Link
            to={guest.id}
            prefetch="intent"
            className="focus-visible:after:ring-ring after:absolute after:inset-0 focus-visible:after:ring-2 after:focus-visible:outline-hidden"
          >
            {guest.name || "Unnamed guest"}
          </Link>
        </h2>
        <p className="text-muted-foreground mt-1 truncate text-sm">
          {guest.email}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1 text-sm max-md:w-full max-md:pl-13 md:max-w-xs md:items-end md:text-right">
        <span className="font-semibold">
          {guest.dinnerCount} {guest.dinnerCount === 1 ? "dinner" : "dinners"}
        </span>
        <span className="text-muted-foreground truncate">
          <time dateTime={lastDate.toISOString()} suppressHydrationWarning>
            {formatAdminDate(lastDate)}
          </time>
          {" · "}
          {guest.lastDinner.title}
        </span>
      </div>
    </Card>
  );
}
