import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applySecurityHeaders,
  contentSecurityPolicy,
} from "./security-headers.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("security headers", () => {
  it("sets the protective headers on any response", () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = new Headers();

    applySecurityHeaders(headers);

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("only lets scripts run from this origin or with the response's nonce", () => {
    vi.stubEnv("NODE_ENV", "production");

    const policy = contentSecurityPolicy("abc123");

    expect(policy).toContain("script-src 'self' 'nonce-abc123'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("stays out of the way of the dev server", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(contentSecurityPolicy("abc123")).toBeNull();
  });
});
