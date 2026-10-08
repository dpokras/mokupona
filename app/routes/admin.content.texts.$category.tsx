import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  type FieldMetadata,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { ArrowLeftIcon } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";

import type { Route } from "./+types/admin.content.texts.$category";

import { AdminPageHeader } from "~/components/admin-ui";
import { ErrorList } from "~/components/forms";
import { RICH_TEXT_HELP } from "~/components/rich-text";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  getTextCategory,
  isTextCategoryId,
  type TextCategoryId,
} from "~/features/site-content/catalog";
import {
  buildTextCategorySchema,
  type EditableEntryRules,
} from "~/features/site-content/category-schema";
import {
  getEditableCategory,
  saveCategoryTexts,
} from "~/features/site-content/site-texts.server";
import type { TextKind } from "~/features/site-content/types";
import { redirectWithToast } from "~/utils/toast.server";

function requireCategoryId(param: string | undefined): TextCategoryId {
  if (!param || !isTextCategoryId(param)) {
    throw new Response("Not found", { status: 404 });
  }
  return param;
}

function rulesOf(categoryId: TextCategoryId) {
  return Object.fromEntries(
    Object.entries(getTextCategory(categoryId).entries).map(([key, entry]) => [
      key,
      {
        kind: entry.kind,
        optional: entry.optional,
        placeholders: entry.placeholders,
      },
    ]),
  ) satisfies Record<string, EditableEntryRules>;
}

export async function loader({ params }: Route.LoaderArgs) {
  const categoryId = requireCategoryId(params.category);
  const category = getTextCategory(categoryId);
  const texts = await getEditableCategory(categoryId);

  return {
    categoryId,
    title: category.title,
    description: category.description,
    rules: rulesOf(categoryId),
    texts: texts.map(({ key, entry, value, isCustomized }) => ({
      key,
      value,
      isCustomized,
      label: entry.label,
      help: entry.help ?? null,
      kind: entry.kind,
      group: entry.group ?? null,
      defaultValue: entry.default,
      placeholders: entry.placeholders ?? [],
      optional: entry.optional ?? false,
    })),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const categoryId = requireCategoryId(params.category);
  const schema = buildTextCategorySchema(rulesOf(categoryId));
  const submission = parseWithZod(await request.formData(), { schema });

  if (submission.status !== "success" || !submission.value) {
    return submission.reply();
  }

  const { changed } = await saveCategoryTexts(categoryId, submission.value);

  return redirectWithToast(`/admin/content/texts/${categoryId}`, {
    title:
      changed === 0
        ? "Nothing to save"
        : `Saved ${changed} ${changed === 1 ? "change" : "changes"}`,
    type: changed === 0 ? "message" : "success",
  });
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `Admin - ${loaderData?.title ?? "Texts"}` },
];

type EditableTextRow = Route.ComponentProps["loaderData"]["texts"][number];

export default function AdminContentTextsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { title, description, rules, texts } = loaderData;
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";
  const schema = buildTextCategorySchema(rules);

  const [form, fields] = useForm({
    id: `texts-${loaderData.categoryId}`,
    lastResult: navigation.state === "idle" ? actionData : null,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: Object.fromEntries(
      texts.map((text) => [text.key, text.value]),
    ),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
  });

  const groups = groupTexts(texts);
  const hasRichText = texts.some((text) => text.kind === "rich");

  return (
    <div className="animate-page-in pb-24">
      <Link
        to="/admin/content"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" />
        site content
      </Link>

      <AdminPageHeader eyebrow="texts" title={title} subtitle={description} />

      {hasRichText ? (
        <Card className="mb-4 p-4 text-sm md:p-5">
          <p className="font-semibold">Formatting long texts</p>
          <p className="text-muted-foreground mt-1">{RICH_TEXT_HELP}</p>
        </Card>
      ) : null}

      <Form
        method="POST"
        {...getFormProps(form)}
        className="flex flex-col gap-4"
      >
        {groups.map(({ group, rows }) => (
          <Card key={group ?? "texts"} className="p-4 md:p-5">
            {group ? (
              <h2 className="mb-1 text-base font-semibold">{group}</h2>
            ) : null}
            <div className="flex flex-col">
              {rows.map((text) => {
                const field = fields[text.key];
                return field ? (
                  <TextRow
                    key={text.key}
                    text={text}
                    field={field}
                    onUseOriginal={() =>
                      form.update({
                        name: field.name,
                        value: text.defaultValue,
                      })
                    }
                  />
                ) : null;
              })}
            </div>
          </Card>
        ))}

        <ErrorList errors={form.errors} />

        <div className="bg-background/95 sticky bottom-0 -mx-1 flex items-center justify-end gap-3 border-t px-1 py-3 backdrop-blur">
          {form.dirty ? (
            <span className="text-muted-foreground text-sm">
              You have unsaved changes
            </span>
          ) : null}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Form>
    </div>
  );
}

function groupTexts(texts: EditableTextRow[]) {
  const groups: { group: string | null; rows: EditableTextRow[] }[] = [];
  for (const text of texts) {
    const last = groups.at(-1);
    if (last && last.group === text.group) last.rows.push(text);
    else groups.push({ group: text.group, rows: [text] });
  }
  return groups;
}

function rowsFor(kind: TextKind, value: string) {
  if (kind === "rich")
    return Math.min(Math.max(value.split("\n").length + 2, 10), 40);
  return Math.min(Math.max(value.split("\n").length + 1, 3), 14);
}

function TextRow({
  text,
  field,
  onUseOriginal,
}: {
  text: EditableTextRow;
  field: FieldMetadata<string | undefined>;
  onUseOriginal: () => void;
}) {
  const currentValue = typeof field.value === "string" ? field.value : "";
  const isDefault = currentValue.trim() === text.defaultValue;
  const errorId = field.errors?.length ? field.errorId : undefined;

  return (
    <div className="flex flex-col gap-2 border-b py-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={field.id}>{text.label}</Label>
        {text.isCustomized ? (
          <Badge variant="info" pill>
            edited
          </Badge>
        ) : null}
        {text.optional ? (
          <span className="text-muted-foreground text-xs">optional</span>
        ) : null}
      </div>

      {text.help || text.placeholders.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          {text.help}
          {text.placeholders.length > 0 ? (
            <>
              {text.help ? " " : null}
              The site fills in{" "}
              {text.placeholders.map((name, index) => (
                <span key={name}>
                  {index > 0 ? ", " : null}
                  <code className="bg-foreground/5 px-1">{`{${name}}`}</code>
                </span>
              ))}
              .
            </>
          ) : null}
        </p>
      ) : null}

      {text.kind === "line" ? (
        <Input {...getInputProps(field, { type: "text" })} key={field.key} />
      ) : (
        <Textarea
          {...getTextareaProps(field)}
          key={field.key}
          rows={rowsFor(text.kind, text.value)}
          className={text.kind === "rich" ? "font-mono text-sm" : undefined}
        />
      )}

      {errorId ? <ErrorList id={errorId} errors={field.errors} /> : null}

      {!isDefault ? (
        <details className="text-sm">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
            Show the original text
          </summary>
          <div className="mt-2 flex flex-col items-start gap-2">
            <p className="text-muted-foreground border-l-2 pl-3 whitespace-pre-line">
              {text.defaultValue}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onUseOriginal}
            >
              Use the original text
            </Button>
          </div>
        </details>
      ) : null}
    </div>
  );
}
