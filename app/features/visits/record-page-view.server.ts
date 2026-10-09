import { createHash } from "node:crypto";

import { isbot } from "isbot";
import { z } from "zod";

import { deviceFromUserAgent } from "./device";
import { isTrackedPath } from "./tracked-paths";
import { visitRetentionStart, zurichDay } from "./visit-day";

import {
  createPageView,
  getOrCreateVisitSalt,
} from "~/models/page-view.server";
import { getClientIPAddress } from "~/shared/http.server";

const MAX_BODY_LENGTH = 2048;

const payloadSchema = z.object({
  path: z
    .string()
    .max(300)
    .regex(/^\/[\x21-\x7e]*$/)
    .refine((path) => !/[?#]/.test(path)),
  referrer: z.string().max(1024).optional(),
});

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function referrerHost(referrer: string | undefined, ownHost: string) {
  if (!referrer) return null;

  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = bareHost(url.hostname);
  return host && host !== ownHost ? host : null;
}

async function readPayload(request: Request) {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_BODY_LENGTH) return null;

  const body = await request.text();
  if (body.length > MAX_BODY_LENGTH) return null;

  try {
    const parsed = payloadSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function optedOut(request: Request) {
  return (
    request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1"
  );
}

function crossSite(request: Request) {
  const site = request.headers.get("Sec-Fetch-Site");
  return site !== null && site !== "same-origin";
}

function visitorIdFor(salt: string, ip: string, userAgent: string) {
  return createHash("sha256")
    .update(`${salt}|${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Stores one page view from the beacon, or silently drops it: bots, opted-out
 * browsers, signed-in users, non-public paths and malformed payloads are not
 * counted. The IP address only feeds the daily visitor hash.
 */
export async function recordPageView({
  request,
  now,
  isSignedIn,
}: {
  request: Request;
  now: Date;
  isSignedIn: () => Promise<boolean>;
}): Promise<void> {
  if (optedOut(request) || crossSite(request)) return;

  const userAgent = request.headers.get("User-Agent");
  if (!userAgent || isbot(userAgent)) return;

  const payload = await readPayload(request);
  if (!payload) return;

  const path = normalizePath(payload.path);
  if (!isTrackedPath(path)) return;

  if (await isSignedIn()) return;

  const day = zurichDay(now);
  const salt = await getOrCreateVisitSalt(day, visitRetentionStart(day));
  const ownHost = bareHost(new URL(request.url).hostname);

  await createPageView({
    day,
    path,
    referrer: referrerHost(payload.referrer, ownHost),
    visitorId: visitorIdFor(salt, getClientIPAddress(request) ?? "", userAgent),
    device: deviceFromUserAgent(userAgent),
  });
}
