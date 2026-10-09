const UNTRACKED_PREFIXES = [
  "/admin",
  "/login",
  "/join",
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/check-your-inbox",
  "/invite",
  "/api",
  "/file",
  "/healthcheck",
  "/me",
];

export function isTrackedPath(pathname: string): boolean {
  return !UNTRACKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
