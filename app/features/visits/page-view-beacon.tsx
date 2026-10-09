import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

import { isTrackedPath } from "./tracked-paths";

import { useOptionalUser } from "~/hooks/useOptionalUser";

const ENDPOINT = "/api/pageview";

function optedOut() {
  const { doNotTrack, globalPrivacyControl } = navigator as Navigator & {
    globalPrivacyControl?: boolean;
  };
  return doNotTrack === "1" || globalPrivacyControl === true;
}

function send(body: string) {
  if (navigator.sendBeacon?.(ENDPOINT, body)) return;
  fetch(ENDPOINT, { method: "POST", body, keepalive: true }).catch(() => {});
}

export function PageViewBeacon() {
  const { pathname } = useLocation();
  const signedIn = Boolean(useOptionalUser());
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    const isLanding = lastPath.current === null;
    lastPath.current = pathname;

    if (signedIn || !isTrackedPath(pathname) || optedOut()) return;

    const referrer = isLanding ? document.referrer : "";
    send(
      JSON.stringify(
        referrer ? { path: pathname, referrer } : { path: pathname },
      ),
    );
  }, [pathname, signedIn]);

  return null;
}
