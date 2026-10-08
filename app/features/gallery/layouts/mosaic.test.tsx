import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SITE_TEXTS } from "../../../../test/site-texts";
import type { GalleryImageModel } from "../view-models";

import { MosaicGallery } from "./mosaic";
import type { GalleryLayoutProps } from "./types";

import { SiteTextProvider } from "~/features/site-content/site-text";
import type { SiteTexts } from "~/features/site-content/types";
import type { ImageProviderConfig } from "~/shared/image";

// the tiles render OptimizedImage, which reads delivery config from the root
// loader; pin it so the test never needs the real root route
vi.mock("~/shared/root-data", () => ({
  useImageConfig: (): ImageProviderConfig => ({
    imageProvider: "local",
    cloudinaryCloudName: null,
  }),
}));

function makeImage(
  overrides: Partial<GalleryImageModel> & { id: string },
): GalleryImageModel {
  return {
    image: {
      id: `img-${overrides.id}`,
      storageKey: `key-${overrides.id}`,
      version: 1,
      width: 1200,
      height: 800,
      blurDataUrl: null,
    },
    alt: `photo ${overrides.id}`,
    caption: null,
    event: {
      id: "dinner-1",
      title: "nine courses",
      date: "2026-04-11T18:00:00.000Z",
    },
    ...overrides,
  };
}

function renderMosaic(
  props: GalleryLayoutProps,
  texts: SiteTexts = DEFAULT_SITE_TEXTS,
) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <MosaicGallery {...props} /> },
  ]);

  return render(
    <SiteTextProvider texts={texts}>
      <Stub initialEntries={["/"]} />
    </SiteTextProvider>,
  );
}

/**
 * The page variant hangs a wall per column count — one below md, two at md,
 * three from lg up — so every query has to name the wall it means.
 */
function wallsOf(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(".items-start"));
}

function firstWallOf(container: HTMLElement) {
  return within(wallsOf(container)[0]);
}

/** Which photos hang in one column, top to bottom. */
function altsIn(column: Element) {
  return within(column as HTMLElement)
    .getAllByRole("img")
    .map((img) => img.getAttribute("alt"));
}

/** The frame OptimizedImage reserves — the tile's real aspect ratio. */
function frameOf(wall: ReturnType<typeof within>, alt: string) {
  const img = wall.getByAltText(alt);
  return {
    width: Number(img.getAttribute("width")),
    height: Number(img.getAttribute("height")),
  };
}

describe("mosaic layout", () => {
  it("renders every image in the feed", () => {
    const { container } = renderMosaic({
      images: [
        makeImage({ id: "a" }),
        makeImage({ id: "b" }),
        makeImage({ id: "c" }),
      ],
    });

    for (const wall of wallsOf(container)) {
      const hung = within(wall);
      expect(hung.getAllByRole("img")).toHaveLength(3);
      for (const id of ["a", "b", "c"]) {
        expect(hung.getByAltText(`photo ${id}`)).toBeInTheDocument();
      }
    }
  });

  it("keeps each photo's intrinsic aspect ratio", () => {
    const { container } = renderMosaic({
      images: [
        makeImage({
          id: "wide",
          alt: "panorama",
          image: {
            id: "img-wide",
            storageKey: "wide",
            version: null,
            width: 2000,
            height: 1000,
            blurDataUrl: null,
          },
        }),
        makeImage({
          id: "tall",
          alt: "portrait",
          image: {
            id: "img-tall",
            storageKey: "tall",
            version: null,
            width: 800,
            height: 1200,
            blurDataUrl: null,
          },
        }),
      ],
    });

    const hung = firstWallOf(container);
    const wide = frameOf(hung, "panorama");
    const tall = frameOf(hung, "portrait");

    expect(wide.width / wide.height).toBeCloseTo(2, 2);
    expect(tall.width / tall.height).toBeCloseTo(800 / 1200, 2);
    // the reserved box must be there for the first paint, not measured later
    expect(hung.getByAltText("portrait").parentElement).toHaveStyle({
      aspectRatio: `${tall.width} / ${tall.height}`,
    });
  });

  it("falls back to a 3:2 frame when the row has no intrinsic dimensions", () => {
    const { container } = renderMosaic({
      images: [
        makeImage({
          id: "unknown",
          alt: "no dimensions",
          image: {
            id: "img-unknown",
            storageKey: "unknown",
            version: null,
            width: null,
            height: null,
            blurDataUrl: null,
          },
        }),
      ],
    });

    const frame = frameOf(firstWallOf(container), "no dimensions");
    expect(frame.width / frame.height).toBeCloseTo(3 / 2, 2);
  });

  it("reads the caption under the photo below md and as a scrim from md up", () => {
    const { container } = renderMosaic({
      images: [makeImage({ id: "a", caption: "the last course, half eaten" })],
    });

    const caption = container.querySelector("figcaption");
    expect(caption).not.toHaveClass("hidden");
    expect(caption).toHaveClass("md:absolute", "md:opacity-0");
    expect(caption).toHaveTextContent("the last course, half eaten");
    // the overlay is faded out at rest, not hidden from assistive tech
    expect(caption?.closest("[aria-hidden]")).toBeNull();
  });

  it("makes the caption scrim cover the whole tile without taking focus", () => {
    const { container } = renderMosaic({
      images: [makeImage({ id: "a", caption: "the last course, half eaten" })],
    });

    const caption = container.querySelector("figcaption");
    expect(caption).toHaveClass("md:absolute", "md:inset-0");
    expect(caption).not.toHaveAttribute("tabindex");
  });

  it("lets the keyboard reveal the scrim on a tile with no dinner link", () => {
    const { container } = renderMosaic({
      images: [makeImage({ id: "orphan", event: null, caption: "a candle" })],
    });

    expect(container.querySelector("figcaption")).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("leaves the tiles' photos to lazy loading", () => {
    const { container } = renderMosaic({
      images: [makeImage({ id: "a" }), makeImage({ id: "b" })],
    });

    for (const img of within(wallsOf(container)[0]).getAllByRole("img")) {
      expect(img).toHaveAttribute("loading", "lazy");
    }
  });

  it("labels the dinner an image came from with a link to it", () => {
    const { container } = renderMosaic({
      images: [makeImage({ id: "a", caption: "steam off the pot" })],
    });

    const link = firstWallOf(container).getByRole("link", {
      name: /nine courses/,
    });
    expect(link).toHaveAttribute("href", "/dinners/dinner-1");
    expect(link).toHaveTextContent("apr 2026");
  });

  it("renders an image no dinner claims without a label", () => {
    const { container } = renderMosaic({
      images: [makeImage({ id: "orphan", event: null, caption: "a candle" })],
    });

    const hung = firstWallOf(container);
    expect(hung.getByAltText("photo orphan")).toBeInTheDocument();
    expect(hung.getByText("a candle")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("drops the (redundant) dinner labels in the section variant", () => {
    renderMosaic({
      images: [makeImage({ id: "a", caption: "steam off the pot" })],
      variant: "section",
    });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/nine courses/)).not.toBeInTheDocument();
    // the caption itself survives — it is the only text the tile carries
    expect(screen.getByText("steam off the pot")).toBeInTheDocument();
  });

  it("hangs a one-column wall below md, two at md and three from lg up", () => {
    const { container } = renderMosaic({
      images: [
        makeImage({ id: "a" }),
        makeImage({ id: "b" }),
        makeImage({ id: "c" }),
      ],
    });

    const [narrow, medium, wide] = wallsOf(container);
    expect(narrow).toHaveClass("flex", "gap-3", "md:hidden");
    expect(medium).toHaveClass("hidden", "gap-5", "md:flex", "lg:hidden");
    expect(wide).toHaveClass("hidden", "gap-5", "lg:flex");
    expect(narrow.children).toHaveLength(1);
    expect(medium.children).toHaveLength(2);
    expect(wide.children).toHaveLength(3);

    // the tiles carry no spacing of their own: a figure sits straight in its
    // column and the column's own gap does the stacking
    for (const [wall, gap] of [
      [narrow, "gap-3"],
      [medium, "gap-5"],
      [wide, "gap-5"],
    ] as const) {
      for (const column of Array.from(wall.children)) {
        expect(column).toHaveClass("flex", "flex-col", gap);
        for (const tile of Array.from(column.children)) {
          expect(tile.tagName).toBe("FIGURE");
        }
      }
    }
  });

  it("deals each tile into the shortest column, ties to the left", () => {
    // heights are 1/aspect, so 2:1 → 0.5, 1:2 → 2, 1:1 → 1: wide lands left
    // (0.5 | 0), tall right (0.5 | 2), square left again (1.5 | 2)
    const { container } = renderMosaic({
      variant: "section",
      images: [
        makeImage({
          id: "wide",
          image: {
            id: "img-wide",
            storageKey: "wide",
            version: null,
            width: 2000,
            height: 1000,
            blurDataUrl: null,
          },
        }),
        makeImage({
          id: "tall",
          image: {
            id: "img-tall",
            storageKey: "tall",
            version: null,
            width: 1000,
            height: 2000,
            blurDataUrl: null,
          },
        }),
        makeImage({
          id: "square",
          image: {
            id: "img-square",
            storageKey: "square",
            version: null,
            width: 1000,
            height: 1000,
            blurDataUrl: null,
          },
        }),
      ],
    });

    const [left, right] = Array.from(wallsOf(container)[0].children);
    expect(altsIn(left)).toEqual(["photo wide", "photo square"]);
    expect(altsIn(right)).toEqual(["photo tall"]);
  });

  it("shows a quiet empty state on the page variant", () => {
    renderMosaic({ images: [] });

    expect(screen.getByText("no photos yet")).toBeInTheDocument();
    expect(screen.getByText(/nothing on the wall yet/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the empty state an admin wrote", () => {
    renderMosaic(
      { images: [] },
      { ...DEFAULT_SITE_TEXTS, "gallery.wallEmptyTitle": "the wall is bare" },
    );

    expect(screen.getByText("the wall is bare")).toBeInTheDocument();
  });

  it("opens the viewer with its controls labelled from the site texts", async () => {
    const { container } = renderMosaic(
      { images: [makeImage({ id: "a" }), makeImage({ id: "b" })] },
      {
        ...DEFAULT_SITE_TEXTS,
        "gallery.viewerPrevious": "earlier photo",
        "gallery.viewerNext": "later photo",
        "gallery.viewerClose": "back to the wall",
      },
    );

    fireEvent.click(within(wallsOf(container)[0]).getAllByRole("button")[0]);

    const viewer = await screen.findByRole("dialog");
    expect(
      within(viewer).getByRole("button", { name: "earlier photo" }),
    ).toBeInTheDocument();
    expect(
      within(viewer).getByRole("button", { name: "later photo" }),
    ).toBeInTheDocument();
    expect(
      within(viewer).getByRole("button", { name: "back to the wall" }),
    ).toBeInTheDocument();
  });

  it("renders nothing at all on an empty section variant", () => {
    const { container } = renderMosaic({ images: [], variant: "section" });

    expect(container).toBeEmptyDOMElement();
  });
});
