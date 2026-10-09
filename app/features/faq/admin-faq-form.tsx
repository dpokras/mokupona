import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  type DefaultValue,
  type SubmissionResult,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { Form, Link, useNavigation } from "react-router";
import type { z } from "zod";

import { FaqEntrySchema } from "./schema";

import {
  CheckboxField,
  ErrorList,
  Field,
  TextareaField,
} from "~/components/forms";
import { RICH_TEXT_HELP } from "~/components/rich-text";
import { BackLink, pageTitleClassName } from "~/components/section";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

export function AdminFaqForm({
  lastResult,
  defaultValue,
  title,
  submitText,
}: {
  lastResult?: SubmissionResult;
  defaultValue?: DefaultValue<z.input<typeof FaqEntrySchema>>;
  title: string;
  submitText: string;
}) {
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  const [form, fields] = useForm<
    z.input<typeof FaqEntrySchema>,
    z.output<typeof FaqEntrySchema>
  >({
    lastResult,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: FaqEntrySchema });
    },
  });

  return (
    <div className="animate-page-in flex flex-col gap-4 md:gap-6">
      <div>
        <BackLink to="/admin/content/faq" prefetch="intent">
          FAQ
        </BackLink>
        <h1 className={pageTitleClassName}>{title}</h1>
      </div>

      <Form method="POST" replace {...getFormProps(form)}>
        <Card className="flex max-w-3xl flex-col gap-5 p-5 md:p-6">
          <Field
            labelProps={{ children: "Question" }}
            inputProps={getInputProps(fields.question, { type: "text" })}
            errors={fields.question.errors}
          />

          <TextareaField
            labelProps={{ children: "Answer" }}
            description={RICH_TEXT_HELP}
            textareaProps={{
              ...getTextareaProps(fields.answer),
              rows: 10,
              className: "font-mono text-sm",
            }}
            errors={fields.answer.errors}
          />

          <CheckboxField
            labelProps={{ children: "Published" }}
            description="Only published questions show on the FAQ page. Untick it to keep a question as a draft."
            buttonProps={getInputProps(fields.published, { type: "checkbox" })}
            errors={fields.published.errors}
          />

          <ErrorList errors={form.errors} />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link
              to="/admin/content/faq"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : submitText}
            </Button>
          </div>
        </Card>
      </Form>
    </div>
  );
}
