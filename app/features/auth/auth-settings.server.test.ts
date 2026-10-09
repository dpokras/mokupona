import { afterEach, describe, expect, it } from "vitest";

import {
  getAuthSettings,
  isAuthToggleEnabled,
  resetAuthSettings,
  setAuthToggleEnabled,
} from "./auth-settings.server";

afterEach(() => {
  resetAuthSettings();
});

describe("auth settings store", () => {
  it("leaves google sign-in open until something closes it", () => {
    expect(getAuthSettings()).toEqual({ google: true });
  });

  it("closes and reopens google sign-in", () => {
    setAuthToggleEnabled("google", false);
    expect(isAuthToggleEnabled("google")).toBe(false);

    setAuthToggleEnabled("google", true);
    expect(getAuthSettings()).toEqual({ google: true });
  });

  it("hands loaders a snapshot they cannot write back through", () => {
    const snapshot = getAuthSettings();
    snapshot.google = false;

    expect(isAuthToggleEnabled("google")).toBe(true);
  });
});
