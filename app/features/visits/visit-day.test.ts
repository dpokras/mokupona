import { describe, expect, it } from "vitest";

import { deviceFromUserAgent } from "./device";
import { isTrackedPath } from "./tracked-paths";
import {
  addDays,
  addMonths,
  daysBetween,
  visitRetentionStart,
  zurichDay,
} from "./visit-day";

describe("zurichDay", () => {
  it("uses the Zurich calendar day, across daylight saving changes", () => {
    expect(zurichDay(new Date("2026-03-28T22:59:00Z"))).toBe("2026-03-28");
    expect(zurichDay(new Date("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
    expect(zurichDay(new Date("2026-07-14T21:59:00Z"))).toBe("2026-07-14");
    expect(zurichDay(new Date("2026-07-14T22:00:00Z"))).toBe("2026-07-15");
  });
});

describe("day arithmetic", () => {
  it("steps days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-02-27", "2026-03-02")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("clamps months to the end of a shorter month", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-10-01", -11)).toBe("2025-11-01");
    expect(visitRetentionStart("2026-10-08")).toBe("2025-09-08");
  });
});

describe("tracked paths", () => {
  it("tracks the public site only", () => {
    expect(isTrackedPath("/")).toBe(true);
    expect(isTrackedPath("/dinners/abc")).toBe(true);
    expect(isTrackedPath("/membership")).toBe(true);
    expect(isTrackedPath("/admin")).toBe(false);
    expect(isTrackedPath("/invite/token")).toBe(false);
    expect(isTrackedPath("/me")).toBe(false);
  });
});

describe("deviceFromUserAgent", () => {
  it("tells phones, tablets and computers apart", () => {
    expect(
      deviceFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
      ),
    ).toBe("mobile");
    expect(
      deviceFromUserAgent(
        "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
      ),
    ).toBe("tablet");
    expect(
      deviceFromUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("tablet");
    expect(
      deviceFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
      ),
    ).toBe("desktop");
  });
});
