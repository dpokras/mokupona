export const VISIT_RANGES = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "12m", label: "12 months" },
] as const;

export type VisitRangeId = (typeof VISIT_RANGES)[number]["id"];

export const DEFAULT_VISIT_RANGE: VisitRangeId = "30d";

export function parseVisitRange(value: string | null): VisitRangeId {
  return (
    VISIT_RANGES.find((range) => range.id === value)?.id ?? DEFAULT_VISIT_RANGE
  );
}
