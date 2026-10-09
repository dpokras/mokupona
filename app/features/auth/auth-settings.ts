export const AUTH_TOGGLES = ["google"] as const;
export type AuthToggle = (typeof AUTH_TOGGLES)[number];

/** Which self-service auth paths are currently open. */
export type AuthSettings = Record<AuthToggle, boolean>;

export const AUTH_TOGGLE_COPY = {
  google: {
    label: "google sign-in",
    description:
      "lets the team sign in with google, and invited people accept their invitation with google. turning it off refuses both.",
  },
} satisfies Record<AuthToggle, { label: string; description: string }>;

/** The error the OAuth callback redirects with for a stranger's google account. */
export const NOT_INVITED_ERROR = "not_invited";

/** The error code the OAuth callback redirects with once Google is off. */
export const GOOGLE_DISABLED_ERROR = "google_disabled";

/** Google's variant, where the email form is the way back in. */
export const GOOGLE_DISABLED_MESSAGE =
  "google sign-in is switched off right now. use your email address and password instead. if you only ever signed in with google, use forgot password to set one.";
