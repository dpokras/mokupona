import { redirect } from "react-router";

import type { Route } from "./+types/admin.content.images.$slot.remove";

import { IMAGE_SLOTS } from "~/features/site-content/image-slots";
import {
  removeSiteImage,
  requireImageSlotKey,
} from "~/features/site-content/site-images.server";
import { redirectWithToast } from "~/utils/toast.server";

export async function loader({ params }: Route.LoaderArgs) {
  requireImageSlotKey(params.slot);
  return redirect("/admin/content/images");
}

export async function action({ params }: Route.ActionArgs) {
  const key = requireImageSlotKey(params.slot);
  const { label, fallback } = IMAGE_SLOTS[key];

  if (!(await removeSiteImage(key))) {
    return redirectWithToast("/admin/content/images", {
      title: "Nothing to remove",
      type: "message",
    });
  }

  return redirectWithToast("/admin/content/images", {
    title: `${label} removed`,
    description: fallback
      ? "The default image is back."
      : "The page shows no photo until you upload a new one.",
    type: "success",
  });
}
