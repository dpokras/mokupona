import type { Route } from "./+types/healthcheck";

import { requestLoggerContext } from "~/features/auth/middleware.server";
import { pingDatabase } from "~/models/health.server";

// Always this process itself: a host taken from the request would let anyone
// point the check's outbound request at another server.
const SELF_URL = `http://127.0.0.1:${process.env.PORT ?? 3000}/`;

export const loader = async ({ context }: Route.LoaderArgs) => {
  const logger = context.get(requestLoggerContext);

  try {
    await Promise.all([
      pingDatabase(),
      fetch(SELF_URL, { method: "HEAD" }).then((r) => {
        if (!r.ok) return Promise.reject(r);
      }),
    ]);
    return new Response("OK");
  } catch (error: unknown) {
    logger.error({ error }, "Healthcheck failed");
    return new Response("ERROR", { status: 500 });
  }
};
