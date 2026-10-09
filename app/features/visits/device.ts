export const VISIT_DEVICES = ["mobile", "tablet", "desktop"] as const;

export type VisitDevice = (typeof VISIT_DEVICES)[number];

// iPadOS Safari sends a desktop Mac user agent, so those iPads count as desktop
export function deviceFromUserAgent(userAgent: string): VisitDevice {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(userAgent)) return "tablet";
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(userAgent)) {
    return "mobile";
  }
  return "desktop";
}
