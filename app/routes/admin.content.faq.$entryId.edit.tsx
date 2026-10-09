import { parseWithZod } from "@conform-to/zod/v4";

import type { Route } from "./+types/admin.content.faq.$entryId.edit";

import { AdminFaqForm } from "~/features/faq/admin-faq-form";
import { FaqEntrySchema } from "~/features/faq/schema";
import { getFaqEntryById, updateFaqEntry } from "~/models/faq.server";
import { requireFound } from "~/shared/http.server";
import { redirectWithToast } from "~/utils/toast.server";

export async function loader({ params }: Route.LoaderArgs) {
  const { question, answer, published } = requireFound(
    await getFaqEntryById(params.entryId),
  );

  return { entry: { question, answer, published } };
}

export async function action({ request, params }: Route.ActionArgs) {
  const submission = parseWithZod(await request.formData(), {
    schema: FaqEntrySchema,
  });

  if (submission.status !== "success" || !submission.value) {
    return submission.reply();
  }

  if (!(await updateFaqEntry(params.entryId, submission.value))) {
    throw new Response("Not found", { status: 404 });
  }

  return redirectWithToast("/admin/content/faq", {
    title: "Question saved",
    type: "success",
  });
}

export const meta: Route.MetaFunction = () => [
  { title: "Admin - Edit FAQ question" },
];

export default function AdminFaqEditPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <AdminFaqForm
      lastResult={actionData}
      defaultValue={loaderData.entry}
      title="Edit question"
      submitText="Save question"
    />
  );
}
