import type { Route } from "./+types/[robots.txt]";

import { getDomainUrl } from "~/shared/http.server";

const PRIVATE_PATHS = [
  "/admin",
  "/api/",
  "/login",
  "/invite/",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export function loader({ request }: Route.LoaderArgs) {
  const lines =
    process.env.ALLOW_INDEXING === "false"
      ? ["User-agent: *", "Disallow: /"]
      : [
          "User-agent: *",
          ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
          "",
          `Sitemap: ${getDomainUrl(request)}/sitemap.xml`,
        ];

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
