import { parseWithZod } from "@conform-to/zod/v4";
import { redirect } from "react-router";

import type { Route } from "./+types/admin.content.faq.$entryId.move";

import { FaqMoveSchema } from "~/features/faq/schema";
import { moveFaqEntry } from "~/models/faq.server";

export async function loader() {
  return redirect("/admin/content/faq");
}

export async function action({ request, params }: Route.ActionArgs) {
  const submission = parseWithZod(await request.formData(), {
    schema: FaqMoveSchema,
  });

  if (submission.status !== "success" || !submission.value) {
    throw new Response("Bad request", { status: 400 });
  }

  await moveFaqEntry(params.entryId, submission.value.direction);

  return redirect("/admin/content/faq");
}
