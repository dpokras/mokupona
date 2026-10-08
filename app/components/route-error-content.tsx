import { isRouteErrorResponse, Link } from "react-router";

import { useText } from "~/features/site-content/site-text";

export function RouteErrorContent({ error }: { error: unknown }) {
  const t = useText();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  let detail: string | null = null;
  if (isRouteErrorResponse(error)) {
    detail = `${error.status} ${typeof error.data === "string" ? error.data : error.statusText}`;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 px-5 pt-4 text-center">
      <h1 className="text-2xl font-light tracking-tight">
        {notFound ? t("global.notFoundTitle") : t("global.errorTitle")}
      </h1>
      <p className="text-foreground/80 font-light">
        {notFound ? t("global.notFoundBody") : t("global.errorBody")}
      </p>
      {detail ? (
        <p className="text-muted-foreground text-xs">{detail}</p>
      ) : null}
      <Link to="/" className="text-primary mt-2 text-sm underline">
        {t("global.backHome")}
      </Link>
    </div>
  );
}
