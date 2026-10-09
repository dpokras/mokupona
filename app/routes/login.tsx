import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { data, Form, Link, redirect, useSearchParams } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/login";

import { AuthShell } from "~/components/auth-layout";
import { AuthNotice } from "~/components/auth-notice";
import { CheckboxField, ErrorList, Field } from "~/components/forms";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  GOOGLE_DISABLED_ERROR,
  GOOGLE_DISABLED_MESSAGE,
  NOT_INVITED_ERROR,
} from "~/features/auth/auth-settings";
import { auth } from "~/features/auth/auth.server";
import { GoogleSignInButton } from "~/features/auth/components/google-button";
import { emailSchema, parseRequestForm } from "~/features/auth/form-schemas";
import {
  anonymousAuthPageLoader,
  requestLoggerContext,
} from "~/features/auth/middleware.server";
import { getClientIPAddress, safeRedirect } from "~/shared/http.server";

const schema = z.object({
  email: emailSchema,
  password: z.string({ error: "Password is required" }),
  redirectTo: z.string().optional(),
  remember: z.boolean().optional().default(false),
});

export const loader = anonymousAuthPageLoader;

export const action = async ({ request, context }: Route.ActionArgs) => {
  const logger = context.get(requestLoggerContext);
  const submission = await parseRequestForm(request, schema);

  if (submission.status !== "success") {
    return data({ result: submission.reply(), authError: null });
  }

  const { email, password, remember } = submission.value;
  const redirectTo = safeRedirect(submission.value.redirectTo, "/admin");

  try {
    const { headers } = await auth.api.signInEmail({
      body: {
        email,
        password,
        rememberMe: remember,
        callbackURL: `/verify-email?email=${encodeURIComponent(email)}`,
      },
      headers: request.headers,
      returnHeaders: true,
    });

    logger.info(
      {
        ip: getClientIPAddress(request),
        email,
      },
      "Successful login request",
    );

    return redirect(redirectTo, { headers });
  } catch (error) {
    const code =
      error instanceof Error && "body" in error
        ? (error as { body?: { code?: string } }).body?.code
        : undefined;

    logger.warn(
      {
        ip: getClientIPAddress(request),
        email,
        reason: code ?? "unknown",
      },
      "Failed login request",
    );

    if (code === "EMAIL_NOT_VERIFIED") {
      return data({
        result: submission.reply(),
        authError: { kind: "unverified" as const, email },
      });
    }

    return data({
      result: submission.reply(),
      authError: { kind: "credentials" as const, email },
    });
  }
};

export const meta: Route.MetaFunction = () => [{ title: "Login" }];

export default function LoginPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/admin";
  const authError = actionData?.authError ?? null;
  const [form, fields] = useForm({
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    constraint: getZodConstraint(schema),
    defaultValue: { redirectTo },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
  });
  const credentialsRejected = authError?.kind === "credentials";
  // set by the OAuth callback when it turned a google sign-in away
  const googleRefused = searchParams.get("error") === GOOGLE_DISABLED_ERROR;
  const notInvited = searchParams.get("error") === NOT_INVITED_ERROR;

  return (
    <AuthShell>
      <h1 className="mt-1 text-3xl leading-tight font-light tracking-tight">
        log in
      </h1>

      <Form
        method="post"
        className="flex flex-col gap-4"
        {...getFormProps(form)}
      >
        {credentialsRejected ? (
          <AuthNotice variant="destructive">
            we couldn&apos;t sign you in. check your email and password, then
            try again.
          </AuthNotice>
        ) : null}
        {googleRefused ? (
          <AuthNotice
            variant="destructive"
            title="google sign-in is turned off"
          >
            {GOOGLE_DISABLED_MESSAGE}
          </AuthNotice>
        ) : null}
        {notInvited ? (
          <AuthNotice variant="destructive" title="no account for that email">
            accounts are by invitation only. if you help run moku pona, ask an
            admin to invite you, then use the link in the invitation email.
          </AuthNotice>
        ) : null}
        {authError?.kind === "unverified" ? (
          <AuthNotice variant="accent" title="your email isn't verified yet">
            <p>
              we just sent a fresh verification link to{" "}
              <strong className="text-foreground font-semibold">
                {authError.email}
              </strong>
              . open it, then come back and log in.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              didn&apos;t get it? give it a minute, then check your spam folder.
            </p>
          </AuthNotice>
        ) : null}

        <Field
          labelProps={{ children: "email address" }}
          inputProps={{
            ...getInputProps(fields.email, { type: "email" }),
            "aria-invalid":
              credentialsRejected || fields.email.errors?.length
                ? true
                : undefined,
          }}
          errors={fields.email.errors}
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor={fields.password.id}>password</Label>
            <Link
              to="/forgot-password"
              className="text-primary font-semibold hover:underline"
            >
              forgot password?
            </Link>
          </div>
          <Input
            {...getInputProps(fields.password, { type: "password" })}
            aria-invalid={
              credentialsRejected || fields.password.errors?.length
                ? true
                : undefined
            }
          />
          <ErrorList
            id={fields.password.errorId}
            errors={fields.password.errors}
          />
        </div>

        <Input type="hidden" name="redirectTo" value={redirectTo} />

        <CheckboxField
          buttonProps={{ id: "remember", name: "remember" }}
          labelProps={{ children: "remember me" }}
        />

        <Button type="submit" size="lg" className="w-full">
          log in
        </Button>

        {loaderData.googleEnabled ? (
          <GoogleSignInButton callbackURL={redirectTo} />
        ) : null}

        <p className="text-muted-foreground text-center text-xs">
          by continuing you accept the{" "}
          <Link to="/privacy" className="text-primary hover:underline">
            privacy policy
          </Link>
        </p>
      </Form>
    </AuthShell>
  );
}
