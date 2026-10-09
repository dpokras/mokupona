import { ChartColumnIcon } from "lucide-react";
import { useState } from "react";
import { useNavigation, useSearchParams } from "react-router";

import type { Route } from "./+types/admin.visits";

import {
  AdminEmptyState,
  AdminPageHeader,
  FilterChip,
} from "~/components/admin-ui";
import { Card } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  loadVisitDashboard,
  type VisitBar,
  type VisitDashboard,
} from "~/features/visits/dashboard.server";
import {
  DEFAULT_VISIT_RANGE,
  parseVisitRange,
  VISIT_RANGES,
} from "~/features/visits/ranges";
import { cn } from "~/lib/utils";

export async function loader({ request }: Route.LoaderArgs) {
  const range = parseVisitRange(new URL(request.url).searchParams.get("range"));
  return { range, ...(await loadVisitDashboard(range, new Date())) };
}

export const meta: Route.MetaFunction = () => [{ title: "Admin - Visits" }];

const numberFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
});
const percentFormat = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 0,
});

const DEVICE_LABELS = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
} as const;

export default function AdminVisitsPage({ loaderData }: Route.ComponentProps) {
  const { range, periodLabel, trackingSince, totalViews } = loaderData;
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const refreshing =
    navigation.state === "loading" &&
    navigation.location.pathname === "/admin/visits";

  return (
    <div className="animate-page-in">
      <AdminPageHeader
        eyebrow={periodLabel}
        title="Visits"
        subtitle="How many people look at the public website."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {VISIT_RANGES.map(({ id, label }) => (
          <FilterChip
            key={id}
            active={range === id}
            onClick={() =>
              setSearchParams(id === DEFAULT_VISIT_RANGE ? {} : { range: id }, {
                preventScrollReset: true,
              })
            }
          >
            {label}
          </FilterChip>
        ))}
      </div>

      <div
        className={cn(
          "transition-opacity",
          refreshing ? "opacity-60" : "opacity-100",
        )}
      >
        {totalViews > 0 ? (
          <VisitStats dashboard={loaderData} />
        ) : (
          <AdminEmptyState
            icon={<ChartColumnIcon className="size-6" />}
            title={trackingSince ? "No visits in this period" : "No visits yet"}
            description={
              trackingSince
                ? "Pick a longer period to see earlier visits."
                : "Visits show up here once people browse the public website."
            }
          />
        )}
      </div>

      <p className="text-muted-foreground mt-6 text-xs">
        No cookies, no IP addresses stored: each visitor gets an anonymous id
        that changes every day, so visitors are counted per day. Signed-in
        visits aren't counted, and data is kept for 13 months.
        {trackingSince ? ` Counting since ${trackingSince}.` : null}
      </p>
    </div>
  );
}

function VisitStats({ dashboard }: { dashboard: VisitDashboard }) {
  const { totalViews, avgDailyVisitors, chart, topPages, topReferrers } =
    dashboard;
  const topPage = topPages[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Page views" value={numberFormat.format(totalViews)} />
        <StatTile
          label="Visitors per day"
          value={numberFormat.format(avgDailyVisitors)}
          note="average, each day counted on its own"
        />
        <StatTile
          label="Top page"
          value={topPage.title ?? topPage.path}
          note={`${numberFormat.format(topPage.views)} views${topPage.title ? ` · ${topPage.path}` : ""}`}
        />
      </div>

      <Card className="p-4 md:p-5">
        <VisitChart unit={chart.unit} bars={chart.bars} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <RankingCard
          title="Top pages"
          column="Page"
          rows={topPages.map(({ path, title, views }) => ({
            label: title ?? path,
            detail: title ? path : undefined,
            views,
          }))}
          empty="No pages in this period."
        />
        <RankingCard
          title="Top referrers"
          column="Site"
          rows={topReferrers.map(({ host, views }) => ({ label: host, views }))}
          empty="No visits came from other sites in this period."
        />
      </div>

      <DeviceSplit devices={dashboard.devices} />
    </div>
  );
}

function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-1 p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="truncate text-2xl font-semibold" title={value}>
        {value}
      </p>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </Card>
  );
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = Math.max(1, factor * magnitude);
  const ticks: number[] = [];
  for (let tick = 0; tick < max + step; tick += step) ticks.push(tick);
  return ticks;
}

function axisLabelStep(unit: "day" | "month", count: number) {
  if (unit === "month" || count <= 7) return 1;
  return count <= 31 ? 7 : 15;
}

function VisitChart({
  unit,
  bars,
}: {
  unit: "day" | "month";
  bars: VisitBar[];
}) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(...bars.map((bar) => bar.views)));
  const top = ticks[ticks.length - 1] || 1;
  const labelStep = axisLabelStep(unit, bars.length);
  const activeBar = active === null ? null : bars[active];
  const position = active === null ? 0 : (active + 0.5) / bars.length;
  const gap = bars.length > 45 ? "gap-px" : "gap-0.5";

  function move(index: number) {
    setActive(Math.min(bars.length - 1, Math.max(0, index)));
  }

  return (
    <figure>
      <figcaption className="mb-4 text-base font-semibold">
        Views per {unit}
      </figcaption>

      <div className="flex gap-2">
        <div
          aria-hidden
          className="text-muted-foreground relative h-40 w-8 shrink-0 text-right text-xs tabular-nums"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {numberFormat.format(tick)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40"
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="bg-border absolute inset-x-0 h-px"
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}
          </div>

          <div
            role="group"
            aria-label={`Views per ${unit}, use the arrow keys to read each ${unit}`}
            tabIndex={0}
            onFocus={() => setActive((current) => current ?? bars.length - 1)}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            onKeyDown={(event) => {
              const current = active ?? bars.length - 1;
              const moves: Record<string, number> = {
                ArrowLeft: current - 1,
                ArrowRight: current + 1,
                Home: 0,
                End: bars.length - 1,
              };
              if (event.key in moves) {
                event.preventDefault();
                move(moves[event.key]);
              }
            }}
            className={cn(
              "focus-visible:ring-ring relative flex h-40 items-end outline-none focus-visible:ring-2",
              gap,
            )}
          >
            {bars.map((bar, index) => (
              <div
                key={bar.key}
                onPointerEnter={() => setActive(index)}
                className={cn(
                  "flex h-full min-w-0 flex-1 items-end justify-center",
                  active === index && "bg-foreground/5",
                )}
              >
                <div
                  className="bg-teal-deep w-full max-w-6"
                  style={{
                    height: `${(bar.views / top) * 100}%`,
                    minHeight: bar.views > 0 ? 2 : 0,
                  }}
                />
              </div>
            ))}
          </div>

          <div
            aria-hidden
            className={cn("text-muted-foreground mt-2 flex h-4 text-xs", gap)}
          >
            {bars.map((bar, index) => (
              <div key={bar.key} className="relative min-w-0 flex-1">
                {(bars.length - 1 - index) % labelStep === 0 ? (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                    {bar.axisLabel}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {activeBar ? (
            <div
              aria-hidden
              className={cn(
                "bg-popover text-popover-foreground pointer-events-none absolute bottom-full z-10 mb-2 border px-3 py-2 text-xs whitespace-nowrap shadow-sm",
                position < 0.2
                  ? "translate-x-0"
                  : position > 0.8
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: `${position * 100}%` }}
            >
              <p className="text-sm font-semibold">
                {numberFormat.format(activeBar.views)} views
              </p>
              <p className="text-muted-foreground">
                {activeBar.title} · {activeBar.detail}
              </p>
            </div>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {activeBar
              ? `${activeBar.title}: ${activeBar.views} views, ${activeBar.detail}`
              : ""}
          </p>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
          Show as table
        </summary>
        <Table className="mt-2">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{unit === "day" ? "Day" : "Month"}</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">Visitors</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bars.map((bar) => (
              <TableRow key={bar.key}>
                <TableCell className="py-2">{bar.title}</TableCell>
                <TableCell className="py-2 text-right tabular-nums">
                  {numberFormat.format(bar.views)}
                </TableCell>
                <TableCell className="text-muted-foreground py-2 text-right">
                  {bar.detail}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </figure>
  );
}

function RankingCard({
  title,
  column,
  rows,
  empty,
}: {
  title: string;
  column: string;
  rows: { label: string; detail?: string; views: number }[];
  empty: string;
}) {
  return (
    <Card className="overflow-hidden">
      <h2 className="px-4 pt-4 text-base font-semibold">{title}</h2>
      {rows.length > 0 ? (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{column}</TableHead>
              <TableHead className="w-24 text-right">Views</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.detail ?? row.label}>
                <TableCell className="py-3">
                  <p className="truncate" title={row.label}>
                    {row.label}
                  </p>
                  {row.detail ? (
                    <p
                      className="text-muted-foreground truncate text-xs"
                      title={row.detail}
                    >
                      {row.detail}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums">
                  {numberFormat.format(row.views)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground px-4 pt-2 pb-4 text-sm">{empty}</p>
      )}
    </Card>
  );
}

function DeviceSplit({ devices }: { devices: VisitDashboard["devices"] }) {
  return (
    <Card className="p-4 md:p-5">
      <h2 className="mb-3 text-base font-semibold">Devices</h2>
      <ul className="flex flex-col gap-3">
        {devices.map(({ device, views, share }) => (
          <li key={device} className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0">{DEVICE_LABELS[device]}</span>
            <div className="bg-foreground/10 h-2 flex-1">
              <div
                className="bg-teal-deep h-full"
                style={{ width: `${share * 100}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
              {percentFormat.format(share)}
            </span>
            <span className="text-muted-foreground w-20 shrink-0 text-right tabular-nums">
              {numberFormat.format(views)} views
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
