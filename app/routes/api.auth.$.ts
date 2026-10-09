import type { Route } from "./+types/api.auth.$";

import { auth } from "~/features/auth/auth.server";
import { requestLoggerContext } from "~/features/auth/middleware.server";
import { getClientIPAddress } from "~/shared/http.server";

// The Google toggle lives in `~/features/auth/google-gate.server`.
const SIGN_UP_EMAIL_PATH = "/sign-up/email";

export const loader = async ({ request }: Route.LoaderArgs) =>
  auth.handler(request);

export const action = async ({ request, context }: Route.ActionArgs) => {
  const { pathname } = new URL(request.url);

  if (pathname.endsWith(SIGN_UP_EMAIL_PATH)) {
    const logger = context.get(requestLoggerContext);
    logger.warn(
      { ip: getClientIPAddress(request) },
      "Blocked a self sign-up; accounts are invite-only",
    );
    return Response.json(
      { code: "SIGNUP_DISABLED", message: "Accounts are by invitation only" },
      { status: 403 },
    );
  }

  return auth.handler(request);
};
