export const AUTH_TOGGLES = ["emailSignup", "google"] as const;
export type AuthToggle = (typeof AUTH_TOGGLES)[number];

/** Which self-service auth paths are currently open. */
export type AuthSettings = Record<AuthToggle, boolean>;

export const AUTH_TOGGLE_COPY = {
  emailSignup: {
    label: "email sign-ups",
    description: "lets anyone create an account from the sign-up form.",
  },
  google: {
    label: "google sign-in",
    description:
      "lets anyone sign in, sign up, or link an account with google. turning it off refuses all three.",
  },
} satisfies Record<AuthToggle, { label: string; description: string }>;

/** The error code the OAuth callback redirects with once Google is off. */
export const GOOGLE_DISABLED_ERROR = "google_disabled";

export const SIGNUP_CLOSED_MESSAGE =
  "sign-ups are closed right now. if you were invited, use the link in your invitation email.";

export const EMAIL_SIGNUP_CLOSED_MESSAGE =
  "email sign-ups are closed right now. you can still continue with google below.";

/** Google's variant, where the email form is the way back in. */
export const GOOGLE_DISABLED_MESSAGE =
  "google sign-in is switched off right now. use your email address and password instead. if you only ever signed in with google, use forgot password to set one.";
