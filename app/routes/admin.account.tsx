import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { CheckIcon } from "lucide-react";
import { useEffect } from "react";
import { data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import type { Route } from "./+types/admin.account";

import { InitialsAvatar } from "~/components/admin-ui";
import { ErrorList, Field } from "~/components/forms";
import {
  Eyebrow,
  pageTitleClassName,
  pillVariants,
} from "~/components/section";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { fieldShellClassName, Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { isAuthToggleEnabled } from "~/features/auth/auth-settings.server";
import { authClient } from "~/features/auth/auth.client";
import { auth, googleAuthEnabled } from "~/features/auth/auth.server";
import { GoogleMark } from "~/features/auth/components/google-button";
import { displayNameSchema } from "~/features/auth/form-schemas";
import {
  requestLoggerContext,
  requireResolvedUser,
} from "~/features/auth/middleware.server";
import { withPasswordConfirmation } from "~/features/auth/password-schema";
import { cn } from "~/lib/utils";
import { getUserAuthOverview, updateUserName } from "~/models/user.server";
import { unknownIntent } from "~/shared/http.server";

const nameSchema = z.object({
  intent: z.literal("update-name"),
  name: displayNameSchema,
});

const passwordActionSchema = withPasswordConfirmation({
  intent: z.enum(["change-password", "set-password"]),
  currentPassword: z.string().optional(),
}).check((ctx) => {
  if (ctx.value.intent === "change-password" && !ctx.value.currentPassword) {
    ctx.issues.push({
      code: "custom",
      path: ["currentPassword"],
      message: "Current password is required",
      input: ctx.value.currentPassword,
    });
  }
});

export const meta: Route.MetaFunction = () => [{ title: "your account" }];

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const user = await requireResolvedUser(context, request);
  const authOverview = await getUserAuthOverview(user.id);

  return {
    user: {
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      role: { name: user.role.name },
    },
    ...authOverview,
    googleEnabled: googleAuthEnabled && isAuthToggleEnabled("google"),
  };
};

export const action = async ({ request, context }: Route.ActionArgs) => {
  const { id: userId } = await requireResolvedUser(context, request);
  const log = context.get(requestLoggerContext);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-name") {
    const submission = parseWithZod(formData, { schema: nameSchema });
    if (submission.status !== "success") {
      return data({ result: submission.reply(), done: null });
    }
    await updateUserName(userId, submission.value.name);
    return data({ result: submission.reply(), done: "name" as const });
  }

  if (intent === "change-password" || intent === "set-password") {
    const submission = parseWithZod(formData, { schema: passwordActionSchema });
    if (submission.status !== "success") {
      return data({ result: submission.reply(), done: null });
    }

    try {
      if (intent === "change-password") {
        await auth.api.changePassword({
          body: {
            currentPassword: submission.value.currentPassword!,
            newPassword: submission.value.password,
            revokeOtherSessions: false,
          },
          headers: request.headers,
        });
      } else {
        await auth.api.setPassword({
          body: { newPassword: submission.value.password },
          headers: request.headers,
        });
      }
    } catch (error) {
      log.warn({ userId, intent, error }, "Password change failed");
      return data({
        result: submission.reply({
          fieldErrors:
            intent === "change-password"
              ? {
                  currentPassword: [
                    "that doesn't match your current password.",
                  ],
                }
              : {
                  password: [
                    "a password is already set. reload the page to change it.",
                  ],
                },
        }),
        done: null,
      });
    }
    return data({
      result: submission.reply({ resetForm: true }),
      done: "password" as const,
    });
  }

  if (intent === "unlink-google") {
    try {
      await auth.api.unlinkAccount({
        body: { providerId: "google" },
        headers: request.headers,
      });
      return data({ result: null, done: "unlink" as const });
    } catch (error) {
      log.warn({ userId, error }, "Unlinking the Google account failed");
      return data({ result: null, done: null });
    }
  }

  if (intent === "revoke-others") {
    await auth.api.revokeOtherSessions({ headers: request.headers });
    return data({ result: null, done: "sessions" as const });
  }

  throw unknownIntent();
};

function useActionToast(
  actionData: Route.ComponentProps["actionData"],
  state: string,
  done: "name" | "password" | "unlink" | "sessions",
  message: string,
) {
  useEffect(() => {
    if (actionData?.done === done && state === "idle") toast.success(message);
  }, [actionData, done, message, state]);
}

export default function AdminAccountPage({ loaderData }: Route.ComponentProps) {
  const { user, hasPassword, googleLinked, sessionCount, googleEnabled } =
    loaderData;

  return (
    <div className="animate-page-in flex flex-col gap-5">
      <div className="mb-1">
        <Eyebrow variant="tracked" tone="label" className="mb-2">
          account
        </Eyebrow>
        <h1 className={pageTitleClassName}>your account</h1>
      </div>

      <ProfileCard user={user} />

      <PasswordCard hasPassword={hasPassword} />

      {googleEnabled || googleLinked ? (
        <ConnectedAccountsCard
          email={user.email}
          googleEnabled={googleEnabled}
          googleLinked={googleLinked}
          hasPassword={hasPassword}
        />
      ) : null}

      <SessionsCard sessionCount={sessionCount} />
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" className="flex flex-col gap-5 p-6 md:p-7">
      {title ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle ? (
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </Card>
  );
}

function ProfileCard({
  user,
}: {
  user: Route.ComponentProps["loaderData"]["user"];
}) {
  const fetcher = useFetcher<typeof action>();
  const [form, fields] = useForm({
    lastResult: fetcher.data?.result ?? null,
    constraint: getZodConstraint(nameSchema),
    defaultValue: { name: user.name },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: nameSchema });
    },
  });

  const { state } = fetcher;
  useActionToast(fetcher.data, state, "name", "name updated");

  return (
    <SectionCard>
      <div className="flex items-center gap-4">
        <InitialsAvatar
          name={user.name}
          seed={0}
          className="size-12 text-base"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{user.name}</p>
        </div>
        <span className={pillVariants({ accent: true })}>{user.role.name}</span>
      </div>

      <fetcher.Form
        method="post"
        className="flex flex-col gap-4"
        {...getFormProps(form)}
      >
        <input type="hidden" name="intent" value="update-name" />
        <div className="flex flex-col gap-2">
          <Label htmlFor={fields.name.id}>name</Label>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              {...getInputProps(fields.name, { type: "text" })}
            />
            <Button type="submit" variant="outline" disabled={state !== "idle"}>
              save
            </Button>
          </div>
          <ErrorList id={fields.name.errorId} errors={fields.name.errors} />
        </div>
      </fetcher.Form>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">email</span>
        <div
          className={cn(
            fieldShellClassName,
            "text-muted-foreground flex items-center justify-between text-sm",
          )}
        >
          <span className="truncate">{user.email}</span>
          {user.emailVerified ? (
            <Badge variant="info" pill className="ml-2 shrink-0 gap-1">
              <CheckIcon className="size-3" /> verified
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          your email is your login and can&apos;t be changed here.
        </p>
      </div>
    </SectionCard>
  );
}

function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const [form, fields] = useForm({
    lastResult: fetcher.data?.result ?? null,
    constraint: getZodConstraint(passwordActionSchema),
    defaultValue: {
      intent: hasPassword ? "change-password" : "set-password",
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: passwordActionSchema });
    },
  });
  const intent = hasPassword ? "change-password" : "set-password";
  const { state } = fetcher;
  useActionToast(
    fetcher.data,
    state,
    "password",
    hasPassword ? "password updated" : "password set",
  );

  return (
    <SectionCard
      title={hasPassword ? "password" : "set a password"}
      subtitle={
        hasPassword
          ? "change the password you use to sign in."
          : "you signed up with google. add a password to sign in either way — no current password needed."
      }
    >
      <fetcher.Form
        method="post"
        className="flex flex-col gap-4"
        {...getFormProps(form)}
      >
        <input type="hidden" name="intent" value={intent} />

        {hasPassword ? (
          <Field
            labelProps={{ children: "current password" }}
            inputProps={{
              ...getInputProps(fields.currentPassword, { type: "password" }),
              required: true,
            }}
            errors={fields.currentPassword.errors}
          />
        ) : null}

        <Field
          labelProps={{ children: "new password" }}
          inputProps={{
            ...getInputProps(fields.password, { type: "password" }),
          }}
          errors={fields.password.errors}
        />

        <Field
          labelProps={{ children: "confirm new password" }}
          inputProps={{
            ...getInputProps(fields.confirmPassword, { type: "password" }),
          }}
          errors={fields.confirmPassword.errors}
        />

        <Button
          type="submit"
          className="self-start"
          disabled={state !== "idle"}
        >
          {hasPassword ? "update password" : "set password"}
        </Button>
      </fetcher.Form>
    </SectionCard>
  );
}

function ConnectedAccountsCard({
  email,
  googleEnabled,
  googleLinked,
  hasPassword,
}: {
  email: string;
  googleEnabled: boolean;
  googleLinked: boolean;
  hasPassword: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const unlinkBlocked = googleLinked && !hasPassword;

  const { state } = fetcher;
  useActionToast(fetcher.data, state, "unlink", "google unlinked");

  return (
    <SectionCard
      title="connected accounts"
      subtitle="sign in faster by linking a provider."
    >
      <div className="flex items-center gap-4 rounded-lg border px-4 py-4">
        <GoogleMark className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">google</p>
          <p className="text-muted-foreground truncate text-sm">
            {googleLinked ? `linked as ${email}` : "not linked"}
          </p>
        </div>
        {googleLinked ? (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="unlink-google" />
            <Button
              type="submit"
              size="sm"
              variant="destructive-outline"
              disabled={unlinkBlocked || state !== "idle"}
            >
              unlink
            </Button>
          </fetcher.Form>
        ) : googleEnabled ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              authClient.linkSocial({
                provider: "google",
                callbackURL: "/admin/account",
              })
            }
          >
            link
          </Button>
        ) : null}
      </div>
      {unlinkBlocked ? (
        <p className="text-muted-foreground text-sm">
          google is your only way to sign in right now. set a password first,
          then you can unlink.
        </p>
      ) : null}
    </SectionCard>
  );
}

function SessionsCard({ sessionCount }: { sessionCount: number }) {
  const fetcher = useFetcher<typeof action>();

  const { state } = fetcher;
  useActionToast(fetcher.data, state, "sessions", "signed out everywhere else");

  return (
    <SectionCard title="sessions">
      <p className="text-muted-foreground text-sm">
        you&apos;re signed in on{" "}
        <strong className="text-foreground font-semibold">
          {sessionCount === 1 ? "1 device" : `${sessionCount} devices`}
        </strong>
        , including this one.
      </p>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="revoke-others" />
        <Button
          type="submit"
          variant="outline"
          disabled={sessionCount <= 1 || state !== "idle"}
        >
          sign out other sessions
        </Button>
      </fetcher.Form>
    </SectionCard>
  );
}
