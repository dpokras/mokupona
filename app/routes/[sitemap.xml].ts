import type { Route } from "./+types/[sitemap.xml]";

import { listEventIds } from "~/models/event.server";
import { getDomainUrl } from "~/shared/http.server";

const PAGES = [
  "/",
  "/dinners",
  "/gallery",
  "/about",
  "/faq",
  "/impressum",
  "/privacy",
];

export async function loader({ request }: Route.LoaderArgs) {
  const origin = getDomainUrl(request);
  const paths = [
    ...PAGES,
    ...(await listEventIds()).map((id) => `/dinners/${id}`),
  ];

  const urls = paths
    .map((path) => `  <url><loc>${origin}${path}</loc></url>`)
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
