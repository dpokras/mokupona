import type { LinksFunction } from "react-router";
import {
  data,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { Footer } from "./components/footer";
import { RouteErrorContent } from "./components/route-error-content";
import { SiteNav } from "./components/site-nav";
import { Toaster } from "./components/ui/sonner";
import { useToast } from "./hooks/useToast";
import { getNextEvent } from "./models/event.server";
import { getDomainUrl } from "./shared/http.server";
import { getToast } from "./utils/toast.server";

import {
  optionalUserContext,
  requestLoggerMiddleware,
  resolveOptionalUserMiddleware,
} from "~/features/auth/middleware.server";
import { getHoneypotInputProps } from "~/features/forms/honeypot.server";
import { useNonce } from "~/shared/nonce";
import { applySecurityHeaders } from "~/shared/security-headers.server";
import { loadSiteImages } from "~/features/site-content/site-images.server";
import { MatchedSiteTextProvider } from "~/features/site-content/site-text";
import { loadRootSiteTexts } from "~/features/site-content/site-texts.server";
import { PageViewBeacon } from "~/features/visits/page-view-beacon";
import stylesheet from "~/tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  {
    rel: "icon",
    type: "image/png",
    sizes: "32x32",
    href: "/favicon-32x32.png",
  },
  {
    rel: "icon",
    type: "image/png",
    sizes: "16x16",
    href: "/favicon-16x16.png",
  },
  { rel: "manifest", href: "/site.webmanifest" },
];

const securityHeadersMiddleware: Route.MiddlewareFunction = async (_, next) => {
  const response = await next();
  applySecurityHeaders(response.headers);
  return response;
};

export const middleware: Route.MiddlewareFunction[] = [
  securityHeadersMiddleware,
  requestLoggerMiddleware,
  resolveOptionalUserMiddleware,
];

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const domainUrl = getDomainUrl(request);
  const user = await context.get(optionalUserContext)();
  const nextEvent = await getNextEvent();
  const siteTexts = await loadRootSiteTexts();
  const siteImages = await loadSiteImages();
  const { toast, headers } = await getToast(request);
  const allowIndexing = process.env.ALLOW_INDEXING !== "false";
  const cypressSupport = process.env.CYPRESS_SUPPORT === "true";
  const imageProvider: "local" | "cloudinary" =
    process.env.IMAGE_PROVIDER === "cloudinary" ? "cloudinary" : "local";
  return data(
    {
      user,
      toast,
      domainUrl,
      allowIndexing,
      cypressSupport,
      nextDinnerId: nextEvent?.id ?? null,
      imageProvider,
      cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? null,
      honeypot: getHoneypotInputProps(),
      siteTexts,
      siteImages,
    },
    { headers: headers ?? undefined },
  );
};

export default function App({ loaderData }: Route.ComponentProps) {
  const { allowIndexing, cypressSupport } = loaderData;
  const nonce = useNonce();

  return (
    <html lang="en" className="h-full scroll-smooth">
      <head>
        {cypressSupport ? (
          <script data-cy-bootstrap nonce={nonce} suppressHydrationWarning>
            {"/* placeholder */"}
          </script>
        ) : null}
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {allowIndexing ? null : (
          <meta name="robots" content="noindex, nofollow" />
        )}
        <Meta />
        <Links />
      </head>
      <body className="dark h-full">
        <Document
          toast={loaderData.toast}
          nextDinnerId={loaderData.nextDinnerId}
        />
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
        <Toaster />
      </body>
    </html>
  );
}

function Document({
  toast,
  nextDinnerId,
}: {
  toast: Route.ComponentProps["loaderData"]["toast"];
  nextDinnerId: string | null;
}) {
  useToast(toast);

  const joinHref = nextDinnerId ? `/dinners/${nextDinnerId}` : "/dinners";

  return (
    <MatchedSiteTextProvider>
      <div className="flex min-h-full flex-col">
        <SiteNav joinHref={joinHref} />
        <div className="flex grow flex-col">
          <Outlet />
        </div>
        <Footer />
        <PageViewBeacon />
      </div>
    </MatchedSiteTextProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorContent error={error} />;
}
