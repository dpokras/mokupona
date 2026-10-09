import { redirect } from "react-router";

import type { Route } from "./+types/admin.content.faq.$entryId.delete";

import { deleteFaqEntry } from "~/models/faq.server";
import { redirectWithToast } from "~/utils/toast.server";

export async function loader() {
  return redirect("/admin/content/faq");
}

export async function action({ params }: Route.ActionArgs) {
  const deleted = await deleteFaqEntry(params.entryId);

  return deleted
    ? redirectWithToast("/admin/content/faq", {
        title: "Question deleted",
        type: "success",
      })
    : redirect("/admin/content/faq");
}
