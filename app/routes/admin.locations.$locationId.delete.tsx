import { redirect } from "react-router";

import type { Route } from "./+types/admin.locations.$locationId.delete";

import { deleteAddress } from "~/models/address.server";
import { redirectWithToast } from "~/utils/toast.server";

export async function loader() {
  return redirect("/admin/locations");
}

export async function action({ params }: Route.ActionArgs) {
  const { locationId } = params;

  const deleted = await deleteAddress(locationId);
  return redirectWithToast(
    "/admin/locations",
    deleted
      ? { type: "success", title: "Location deleted" }
      : {
          type: "error",
          title: "This location is used by a dinner, so it can't be deleted",
        },
  );
}
