import { redirect } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/admin.content.images.$slot";

import { withParsedImageForm } from "~/features/images/image-form-action.server";
import { IMAGE_SLOTS } from "~/features/site-content/image-slots";
import {
  replaceSiteImage,
  requireImageSlotKey,
} from "~/features/site-content/site-images.server";
import { imageFileSchema } from "~/shared/image";
import { redirectWithToast } from "~/utils/toast.server";

const SiteImageUploadSchema = z.object({
  image: imageFileSchema(),
});

export async function loader({ params }: Route.LoaderArgs) {
  requireImageSlotKey(params.slot);
  return redirect("/admin/content/images");
}

export async function action({ request, params }: Route.ActionArgs) {
  const key = requireImageSlotKey(params.slot);

  return withParsedImageForm(request, {
    fieldName: "image",
    schema: SiteImageUploadSchema,
    async onSuccess({ value }) {
      await replaceSiteImage(key, value.image);

      return redirectWithToast("/admin/content/images", {
        title: `${IMAGE_SLOTS[key].label} updated`,
        type: "success",
      });
    },
  });
}
