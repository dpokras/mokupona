import { getFormProps, getSelectProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { Form, redirect } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/admin.users.$userId_.edit";

import { SelectField } from "~/components/forms";
import { Button } from "~/components/ui/button";
import {
  requestLoggerContext,
  userContext,
} from "~/features/auth/middleware.server";
import { isAdminRole } from "~/features/auth/roles";
import {
  INVITABLE_ROLE_OPTIONS,
  INVITABLE_ROLES,
} from "~/features/users/invite.shared";
import { getRoleByName } from "~/models/role.server";
import {
  getUserAccountSummary,
  updateNonAdminUserRole,
} from "~/models/user.server";
import { requireFound } from "~/shared/http.server";
import { redirectWithToast } from "~/utils/toast.server";

const schema = z.object({
  roleName: z.enum(INVITABLE_ROLES),
});

export async function loader({ params }: Route.LoaderArgs) {
  const { userId } = params;

  const user = requireFound(await getUserAccountSummary(userId));

  return {
    user,
  };
}

export const meta: Route.MetaFunction = () => {
  return [{ title: "Admin - Edit User" }];
};

export async function action({ request, params, context }: Route.ActionArgs) {
  const { userId } = params;

  const formData = await request.formData();
  const submission = await parseWithZod(formData, {
    schema: (intent) =>
      schema.transform(async (data, ctx) => {
        if (intent !== null) return { ...data, roleId: null };
        const role = await getRoleByName(data.roleName);
        if (!role) {
          ctx.addIssue({
            path: ["roleName"],
            code: "custom",
            message: "Invalid role",
          });
          return z.NEVER;
        }

        return { ...data, roleId: role.id };
      }),
    async: true,
  });

  if (
    submission.status !== "success" ||
    !submission.value ||
    !submission.value.roleId
  ) {
    return submission.reply();
  }

  const { roleId, roleName } = submission.value;

  if (!(await updateNonAdminUserRole(userId, roleId))) {
    return redirectWithToast("/admin/users", {
      type: "error",
      title: "That role can't be changed",
    });
  }

  context.get(requestLoggerContext).warn(
    {
      userId: context.get(userContext).id,
      targetUserId: userId,
      role: roleName,
    },
    "Admin changed a user's role",
  );

  return redirect(`/admin/users`);
}

export default function DinnersPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { user } = loaderData;
  const lastResult = actionData;
  const [form, fields] = useForm({
    lastResult,
    shouldValidate: "onBlur",
    constraint: getZodConstraint(schema),
    defaultValue: {
      roleName: user.role.name,
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
  });

  const isAdmin = isAdminRole(user.role.name);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl leading-tight font-light tracking-tight">
          User Information
        </h1>
        <p>
          Information for <span className="text-primary">{user.email}</span>
        </p>
      </div>

      <Form
        method="POST"
        replace
        className="mt-4 flex flex-col gap-4"
        {...getFormProps(form)}
      >
        <SelectField
          labelProps={{ children: "Role" }}
          selectProps={{
            ...getSelectProps(fields.roleName),
            disabled: isAdmin,
            options: [...INVITABLE_ROLE_OPTIONS],
          }}
          errors={fields.roleName.errors}
        />

        <Button type="submit">Update User</Button>
      </Form>
    </div>
  );
}
