import { useRouteLoaderData } from "react-router";
import invariant from "tiny-invariant";

import type { Route as RootRoute } from "../+types/root";

import type { HoneypotInputProps } from "~/features/forms/honeypot";
import type { ImageSlotKey } from "~/features/site-content/image-slots";
import type { ImageMetadata } from "~/models/image.server";
import type { ImageProviderConfig } from "~/shared/image";

type RootLoaderData = RootRoute.ComponentProps["loaderData"];

export function getRootLoaderData(
  matches: readonly ({ id: string; loaderData: unknown } | undefined)[],
): RootLoaderData | undefined {
  const rootMatch = matches.find((match) => match?.id === "root");
  return rootMatch?.loaderData as RootLoaderData | undefined;
}

function toImageConfig(data: RootLoaderData | undefined): ImageProviderConfig {
  return {
    imageProvider: data?.imageProvider ?? "local",
    cloudinaryCloudName: data?.cloudinaryCloudName ?? null,
  };
}

export function getImageConfig(
  matches: readonly ({ id: string; loaderData: unknown } | undefined)[],
): ImageProviderConfig {
  return toImageConfig(getRootLoaderData(matches));
}

export function useImageConfig(): ImageProviderConfig {
  return toImageConfig(
    useRouteLoaderData("root") as RootLoaderData | undefined,
  );
}

/** The image uploaded into a site image slot, without the slot's fallback. */
export function getSiteImage(
  matches: readonly ({ id: string; loaderData: unknown } | undefined)[],
  key: ImageSlotKey,
): ImageMetadata | null {
  return getRootLoaderData(matches)?.siteImages[key] ?? null;
}

/**
 * Honeypot props for components (root loader data by route id).
 */
export function useHoneypotProps(): HoneypotInputProps {
  const data = useRouteLoaderData("root") as RootLoaderData | undefined;
  const honeypot = data?.honeypot;
  invariant(honeypot, "the root loader must supply honeypot props");

  return honeypot;
}
