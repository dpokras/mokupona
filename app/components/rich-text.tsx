import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

/**
 * The formatting admins can use in long texts, kept small on purpose:
 *
 *   ## Heading           ### Smaller heading
 *   - bullet             1. numbered item
 *   **bold**             [link text](https://example.com)
 *
 * A blank line starts a new paragraph; a single line break stays a line
 * break. Bare web and email addresses become links on their own.
 */
export const RICH_TEXT_HELP =
  "Leave an empty line between paragraphs. Start a line with ## for a heading, ### for a smaller heading, - for a bullet or 1. for a numbered list. Use **double stars** for bold and [text](https://link) for a link.";

export type RichTextBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] };

const BULLET = /^[-*]\s+/;
const NUMBERED = /^\d+[.)]\s+/;

export function parseRichText(source: string): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  let paragraph: string[] = [];
  let list: Extract<RichTextBlock, { type: "list" }> | null = null;

  const flush = () => {
    if (paragraph.length > 0)
      blocks.push({ type: "paragraph", lines: paragraph });
    if (list) blocks.push(list);
    paragraph = [];
    list = null;
  };

  for (const rawLine of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();

    if (line === "") {
      flush();
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1].length === 2 ? 2 : 3,
        text: heading[2],
      });
      continue;
    }

    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      if (paragraph.length > 0 || (list && list.ordered !== ordered)) flush();
      list ??= { type: "list", ordered, items: [] };
      list.items.push(line.replace(ordered ? NUMBERED : BULLET, ""));
      continue;
    }

    if (list) flush();
    paragraph.push(line);
  }

  flush();
  return blocks;
}

export type RichTextInline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; label: string; href: string };

const INLINE =
  /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<]*[^\s<.,;:!?)])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function safeHref(href: string): string | null {
  if (/^(https?:|mailto:|tel:)/i.test(href) || href.startsWith("/")) {
    return href;
  }
  if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(href)) return `mailto:${href}`;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(href)) return `https://${href}`;
  return null;
}

export function parseInline(text: string): RichTextInline[] {
  const parts: RichTextInline[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last)
      parts.push({ type: "text", value: text.slice(last, start) });

    const [whole, bold, label, target, url, email] = match;
    if (bold !== undefined) {
      parts.push({ type: "bold", value: bold });
    } else if (label !== undefined && target !== undefined) {
      const href = safeHref(target);
      parts.push(
        href ? { type: "link", label, href } : { type: "text", value: whole },
      );
    } else if (url !== undefined) {
      parts.push({ type: "link", label: url, href: url });
    } else if (email !== undefined) {
      parts.push({ type: "link", label: email, href: `mailto:${email}` });
    }

    last = start + whole.length;
  }

  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

function Inline({ text }: { text: string }) {
  return parseInline(text).map((part, index): ReactNode => {
    switch (part.type) {
      case "text":
        return part.value;
      case "bold":
        return (
          <strong key={index} className="font-semibold">
            {part.value}
          </strong>
        );
      case "link": {
        const external = /^https?:/i.test(part.href);
        return (
          <a
            key={index}
            href={part.href}
            className="text-primary underline underline-offset-2"
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {part.label}
          </a>
        );
      }
    }
  });
}

const bodyClassName = "text-foreground/80 text-base font-light";

export function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {parseRichText(text).map((block, index) => {
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2
                key={index}
                className="mt-6 text-2xl leading-tight font-light tracking-tight first:mt-0 md:text-3xl"
              >
                <Inline text={block.text} />
              </h2>
            ) : (
              <h3
                key={index}
                className="mt-2 text-xl font-light tracking-tight first:mt-0"
              >
                <Inline text={block.text} />
              </h3>
            );
          case "paragraph":
            return (
              <p key={index} className={bodyClassName}>
                {block.lines.map((line, lineIndex) => (
                  <span key={lineIndex}>
                    {lineIndex > 0 ? <br /> : null}
                    <Inline text={line} />
                  </span>
                ))}
              </p>
            );
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag
                key={index}
                className={cn(
                  bodyClassName,
                  "space-y-1 pl-5",
                  block.ordered ? "list-decimal" : "list-disc",
                )}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </ListTag>
            );
          }
        }
      })}
    </div>
  );
}
