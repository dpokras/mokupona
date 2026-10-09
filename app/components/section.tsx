import { cva, type VariantProps } from "class-variance-authority";
import { ChevronLeftIcon } from "lucide-react";
import type { ComponentProps, ElementType, ReactNode } from "react";
import { Link } from "react-router";

import {
  HandwrittenHeading,
  type HandwrittenHeadingName,
} from "~/components/handwritten-heading";
import { cn } from "~/lib/utils";

export const pageTitleClassName =
  "text-3xl leading-tight font-light tracking-tight md:text-4xl";

export function PageContainer({
  as: Component = "main",
  className,
  children,
  ...rest
}: ComponentProps<"main"> & { as?: ElementType }) {
  return (
    <Component
      className={cn("mx-auto w-full max-w-5xl px-5 md:px-10", className)}
      {...rest}
    >
      {children}
    </Component>
  );
}

export function BackLink({
  to,
  prefetch,
  className,
  children,
}: {
  to: string;
  prefetch?: "intent";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      prefetch={prefetch}
      className={cn(
        "text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-2 text-sm transition-colors",
        className,
      )}
    >
      <ChevronLeftIcon className="size-4" />
      {children}
    </Link>
  );
}

export const pillVariants = cva(
  "flex items-center gap-2 border px-4 py-2 text-sm font-semibold",
  {
    variants: {
      accent: {
        true: "border-primary/35 bg-primary/10 text-accent-light",
        false: "text-muted-foreground",
      },
    },
    defaultVariants: {
      accent: false,
    },
  },
);

const eyebrowVariants = cva("block font-semibold", {
  variants: {
    variant: {
      tracked: "text-xs uppercase tracking-widest",
      kicker: "text-sm",
    },
    tone: {
      primary: "text-primary",
      light: "text-accent-light",
      label: "text-muted-foreground",
      onPrimary: "text-primary-foreground/70",
    },
  },
  defaultVariants: {
    variant: "tracked",
    tone: "primary",
  },
});

export function Eyebrow({
  variant,
  tone,
  className,
  children,
}: VariantProps<typeof eyebrowVariants> & {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn(eyebrowVariants({ variant, tone }), className)}>
      {children}
    </span>
  );
}

export function SectionDivider({
  className,
  /** When set, the drawn heading is shown and `children` becomes its alt text. */
  handwritten,
  children,
}: {
  className?: string;
  handwritten?: HandwrittenHeadingName;
  children: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {handwritten ? (
        <HandwrittenHeading name={handwritten} alt={children} />
      ) : (
        <Eyebrow variant="tracked" tone="label">
          {children}
        </Eyebrow>
      )}
      <span aria-hidden className="bg-border h-px flex-1" />
    </div>
  );
}

export function SecondaryCTA({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "border-foreground/40 hover:border-foreground w-fit border-b pb-1 text-base transition-colors",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export const chipVariants = cva("border transition-colors", {
  variants: {
    active: {
      true: "border-primary/35 bg-primary/10 text-accent-light font-semibold",
      false: "text-muted-foreground hover:text-foreground",
    },
    size: {
      default:
        "inline-flex items-center px-4 py-2 text-xs font-semibold whitespace-nowrap",
      nav: "block px-3 py-2 text-sm md:rounded-lg",
    },
  },
  compoundVariants: [
    { active: false, size: "default", class: "hover:border-foreground/20" },
    {
      active: false,
      size: "nav",
      class: "md:hover:bg-foreground/5 md:border-transparent",
    },
  ],
  defaultVariants: {
    active: false,
    size: "default",
  },
});

export function Glow({
  strong = false,
  className,
}: {
  strong?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-full",
        strong ? "glow-primary-strong" : "glow-primary",
        className,
      )}
    />
  );
}

export const segmentGroupClassName = "flex border p-1";

export const segmentVariants = cva(
  "flex h-9 flex-1 items-center justify-center rounded-md text-sm font-semibold transition-colors",
  {
    variants: {
      active: {
        true: "bg-primary text-primary-foreground",
        false: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);
