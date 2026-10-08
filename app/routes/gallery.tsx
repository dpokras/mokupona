import { Link } from "react-router";

import type { Route } from "./+types/gallery";

import { CoverImage } from "~/components/cover-image";
import { RouteErrorContent } from "~/components/route-error-content";
import {
  Eyebrow,
  PageContainer,
  pageTitleClassName,
} from "~/components/section";
import { formatEventMonthYear } from "~/features/events/date-format";
import { listGalleryAlbums } from "~/features/gallery/gallery.server";
import type { GalleryAlbumModel } from "~/features/gallery/view-models";
import { metaText, useText } from "~/features/site-content/site-text";

export async function loader() {
  return { albums: await listGalleryAlbums() };
}

export const meta: Route.MetaFunction = ({ matches }) => [
  { title: metaText(matches, "gallery.metaTitle") },
];

export default function GalleryPage({ loaderData }: Route.ComponentProps) {
  const { albums } = loaderData;
  const t = useText();

  return (
    <PageContainer className="grow pt-14 pb-32 md:pt-20">
      <div className="mb-14 flex flex-col gap-4 md:mb-20">
        <Eyebrow variant="tracked" tone="primary">
          {t("gallery.eyebrow")}
        </Eyebrow>
        <h1 className={pageTitleClassName}>{t("gallery.title")}</h1>
        <p className="text-muted-foreground max-w-2xl text-base font-light whitespace-pre-line md:text-lg">
          {t("gallery.intro")}
        </p>
      </div>

      {albums.length > 0 ? (
        <ul className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground max-w-md text-base font-light whitespace-pre-line md:text-lg">
          {t("gallery.empty")}
        </p>
      )}
    </PageContainer>
  );
}

function AlbumCard({ album }: { album: GalleryAlbumModel }) {
  const t = useText();
  const date = new Date(album.date);

  return (
    <li>
      <Link
        to={`/dinners/${album.id}/gallery`}
        className="group flex flex-col gap-3"
      >
        <div className="overflow-hidden">
          <CoverImage
            image={album.cover}
            alt={album.coverAlt}
            sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 90vw"
            className="w-full transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground flex items-center gap-2 text-xs">
            <time dateTime={date.toISOString()} suppressHydrationWarning>
              {formatEventMonthYear(date)}
            </time>
            <span aria-hidden="true">·</span>
            <span>
              {t(
                album.imageCount === 1
                  ? "gallery.photoCountOne"
                  : "gallery.photoCountOther",
                { count: album.imageCount },
              )}
            </span>
          </span>
          <h2 className="text-lg leading-tight font-light group-hover:underline md:text-xl">
            {album.title}
          </h2>
        </div>
      </Link>
    </li>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <PageContainer className="grow pt-14 pb-32 md:pt-20">
      <RouteErrorContent error={error} />
    </PageContainer>
  );
}
