import type React from "react";

import type { TitleCardBlockType } from "./model";

import { HandDrawnRule } from "~/components/hand-drawn";
import { cn } from "~/lib/utils";

type TitleCardBlockViewProps = React.ComponentPropsWithoutRef<"section"> & {
  blockData: TitleCardBlockType;
};

/**
 * The title card: the club's name, a great deal of quiet, and a cue to scroll.
 * Deliberately holds nothing else — the dinners live below the fold.
 */
export function TitleCardBlockView({
  blockData,
  className,
  ...rest
}: TitleCardBlockViewProps) {
  const { title, logo, tagline, scrollCue } = blockData.data;

  return (
    <section
      className={cn(
        // Sits just under the sticky nav, so subtract its height rather than
        // using a bare 100svh, which would push the cue off-screen on mobile.
        "flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center px-5 py-16",
        className,
      )}
      {...rest}
    >
      <div className="flex flex-col items-center gap-6">
        {logo ? (
          <img
            src={logo.src}
            width={logo.width}
            height={logo.height}
            alt={title}
            // Brand artwork, above the fold — never lazy-load it.
            loading="eager"
            decoding="sync"
            // The wordmark is a JPEG in an SVG wrapper, so it carries an
            // opaque white box instead of alpha. Multiply drops white to the
            // paper beneath while leaving the dark strokes untouched.
            className="h-auto w-[min(80vw,34rem)] mix-blend-multiply"
          />
        ) : (
          <h1 className="text-center text-6xl leading-none font-light tracking-tight sm:text-7xl md:text-8xl">
            {title}
          </h1>
        )}

        <HandDrawnRule className="text-crayon/45 w-[min(70vw,26rem)]" />

        {tagline ? (
          <p className="text-muted-foreground max-w-md text-center text-sm font-light tracking-wide md:text-base">
            {tagline}
          </p>
        ) : null}
      </div>

      {scrollCue ? <ScrollCue {...scrollCue} /> : null}
    </section>
  );
}

function ScrollCue({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-20 flex flex-col items-center gap-2 rounded-md px-3 py-2 text-xs tracking-[0.2em] uppercase transition-colors focus-visible:ring-2 focus-visible:outline-hidden md:mt-28"
    >
      <span>{label}</span>
      <svg
        viewBox="0 0 24 30"
        fill="none"
        aria-hidden="true"
        className="h-6 w-5 motion-safe:animate-bounce"
      >
        <path
          d="M12 3c-.6 7 .8 14-.4 22"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M5 18c3.2 3.1 5.2 6.4 7 8.7 2-2.6 3.9-5.6 7-8.4"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}
