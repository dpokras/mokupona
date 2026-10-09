import type { Route } from "./+types/api.pageview";

import {
  optionalUserContext,
  requestLoggerContext,
} from "~/features/auth/middleware.server";
import { recordPageView } from "~/features/visits/record-page-view.server";

export const loader = () =>
  new Response(null, { status: 405, headers: { Allow: "POST" } });

export const action = async ({ request, context }: Route.ActionArgs) => {
  try {
    await recordPageView({
      request,
      now: new Date(),
      isSignedIn: () =>
        context
          .get(optionalUserContext)()
          .then(
            (user) => user !== null,
            () => true,
          ),
    });
  } catch (error: unknown) {
    context
      .get(requestLoggerContext)
      .warn({ error }, "Could not record a page view");
  }
  return new Response(null, { status: 204 });
};
