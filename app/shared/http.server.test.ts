import { afterEach, describe, expect, it, vi } from "vitest";

import { getClientIPAddress, getDomainUrl, safeRedirect } from "./http.server";

function requestWith(headers: Record<string, string>) {
  return new Request("https://mokupona.ch/", { headers });
}

describe("getClientIPAddress", () => {
  it("returns the IPv4 address the Fly proxy observed", () => {
    expect(
      getClientIPAddress(requestWith({ "Fly-Client-IP": "203.0.113.9" })),
    ).toBe("203.0.113.9");
  });

  it("normalises IPv6 to lower case", () => {
    expect(
      getClientIPAddress(requestWith({ "Fly-Client-IP": "2001:DB8::1" })),
    ).toBe("2001:db8::1");
  });

  it("unwraps IPv4-mapped IPv6 so one client has one identity", () => {
    expect(
      getClientIPAddress(
        requestWith({ "Fly-Client-IP": "::ffff:203.0.113.9" }),
      ),
    ).toBe("203.0.113.9");
  });

  it("ignores X-Client-IP", () => {
    expect(getClientIPAddress(requestWith({ "X-Client-IP": "1.2.3.4" }))).toBe(
      null,
    );
  });

  it("ignores X-Forwarded-For", () => {
    expect(
      getClientIPAddress(
        requestWith({ "X-Forwarded-For": "1.2.3.4, 66.241.125.28" }),
      ),
    ).toBe(null);
  });

  it("rejects a value that is not an IP address", () => {
    expect(
      getClientIPAddress(requestWith({ "Fly-Client-IP": "not-an-ip" })),
    ).toBe(null);
  });

  it("rejects an oversized header without parsing it", () => {
    expect(
      getClientIPAddress(requestWith({ "Fly-Client-IP": "1".repeat(2048) })),
    ).toBe(null);
  });

  it("returns null when the request did not pass through the proxy", () => {
    expect(getClientIPAddress(requestWith({}))).toBe(null);
  });
});

describe("safeRedirect", () => {
  it("keeps paths on this site", () => {
    expect(safeRedirect("/admin/users?tab=1")).toBe("/admin/users?tab=1");
  });

  it("refuses anything that would leave the site", () => {
    for (const to of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "admin",
    ]) {
      expect(safeRedirect(to, "/admin")).toBe("/admin");
    }
  });
});

describe("getDomainUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured origin and ignores forwarded hosts", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://mokupona.ch");
    const request = new Request("https://mokupona.ch/admin/users", {
      headers: { "X-Forwarded-Host": "evil.example", Host: "evil.example" },
    });

    expect(getDomainUrl(request)).toBe("https://mokupona.ch");
  });
});
