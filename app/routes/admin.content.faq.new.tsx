import { parseWithZod } from "@conform-to/zod/v4";

import type { Route } from "./+types/admin.content.faq.new";

import { AdminFaqForm } from "~/features/faq/admin-faq-form";
import { FaqEntrySchema } from "~/features/faq/schema";
import { createFaqEntry } from "~/models/faq.server";
import { redirectWithToast } from "~/utils/toast.server";

export async function action({ request }: Route.ActionArgs) {
  const submission = parseWithZod(await request.formData(), {
    schema: FaqEntrySchema,
  });

  if (submission.status !== "success" || !submission.value) {
    return submission.reply();
  }

  await createFaqEntry(submission.value);

  return redirectWithToast("/admin/content/faq", {
    title: "Question added",
    type: "success",
  });
}

export const meta: Route.MetaFunction = () => [
  { title: "Admin - New FAQ question" },
];

export default function AdminFaqNewPage({ actionData }: Route.ComponentProps) {
  return (
    <AdminFaqForm
      lastResult={actionData}
      defaultValue={{ published: true }}
      title="New question"
      submitText="Add question"
    />
  );
}
