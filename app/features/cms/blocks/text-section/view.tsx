import type React from "react";

import type { TextSectionBlockType } from "./model";

import { HandDrawnRule } from "~/components/hand-drawn";
import { HandwrittenHeading } from "~/components/handwritten-heading";
import { Eyebrow, PageContainer } from "~/components/section";

type TextSectionBlockViewProps = React.ComponentPropsWithoutRef<"div"> & {
  blockData: TextSectionBlockType;
};

export function TextSectionBlockView({
  blockData,
  ...rest
}: TextSectionBlockViewProps) {
  const { data } = blockData;
  const { eyebrow, eyebrowHandwritten, headline, body, variant } = data;

  const eyebrowNode = eyebrowHandwritten ? (
    <HandwrittenHeading name={eyebrowHandwritten} alt={eyebrow ?? ""} />
  ) : eyebrow ? (
    <Eyebrow>{eyebrow}</Eyebrow>
  ) : null;

  // The feature variant used to be a skewed purple slab. It now earns its
  // emphasis from space and type size instead of a filled block, so the page
  // stays ink on paper the whole way down.
  if (variant === "feature") {
    return (
      <PageContainer as="div" {...rest}>
        <section className="flex max-w-3xl flex-col gap-5 py-16 md:gap-6 md:py-28">
          <HandDrawnRule className="text-crayon/45 w-32" />
          {eyebrowNode}
          <h2 className="text-3xl leading-tight font-light tracking-tight text-balance md:text-4xl">
            {headline}
          </h2>
          <p className="text-muted-foreground text-lg font-light whitespace-pre-line md:text-xl">
            {body}
          </p>
        </section>
      </PageContainer>
    );
  }

  return (
    <PageContainer as="div" {...rest}>
      <section className="grid items-start gap-3 py-14 md:grid-cols-[1fr_1.2fr] md:gap-12 md:py-24">
        <div className="flex flex-col gap-3 md:gap-4">
          {eyebrowNode}
          <h2 className="text-2xl leading-tight font-light tracking-tight md:text-3xl">
            {headline}
          </h2>
        </div>
        <p className="text-muted-foreground text-base font-light whitespace-pre-line md:text-lg">
          {body}
        </p>
      </section>
    </PageContainer>
  );
}
