import { redirect } from "react-router";

import { STARTER_FAQ_QUESTIONS } from "~/features/faq/starter-questions";
import { createFaqEntriesIfEmpty } from "~/models/faq.server";
import { redirectWithToast } from "~/utils/toast.server";

export async function loader() {
  return redirect("/admin/content/faq");
}

export async function action() {
  const added = await createFaqEntriesIfEmpty(
    STARTER_FAQ_QUESTIONS.map((entry) => ({ ...entry, published: false })),
  );

  return added > 0
    ? redirectWithToast("/admin/content/faq", {
        title: `Added ${added} draft questions`,
        description: "Edit and publish them when they read right.",
        type: "success",
      })
    : redirect("/admin/content/faq");
}
