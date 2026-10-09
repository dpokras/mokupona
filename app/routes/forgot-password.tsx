import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { MailIcon } from "lucide-react";
import { data, Form, Link } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/forgot-password";

import { AuthShell } from "~/components/auth-layout";
import { AuthStatus } from "~/components/auth-status";
import { ErrorList, Field } from "~/components/forms";
import { Button, buttonVariants } from "~/components/ui/button";
import { auth } from "~/features/auth/auth.server";
import { emailSchema, parseRequestForm } from "~/features/auth/form-schemas";
import { requestLoggerContext } from "~/features/auth/middleware.server";
import { cn } from "~/lib/utils";
import { getClientIPAddress } from "~/shared/http.server";
import { rateLimitKey, rateLimiters } from "~/shared/rate-limit.server";

const schema = z.object({
  email: emailSchema,
});

export const action = async ({ request, context }: Route.ActionArgs) => {
  const logger = context.get(requestLoggerContext);
  const submission = await parseRequestForm(request, schema);

  if (submission.status !== "success") {
    return data({ result: submission.reply(), sentTo: null });
  }

  const { email } = submission.value;
  const ip = getClientIPAddress(request);

  if (!rateLimiters.passwordMailByIp.hit(rateLimitKey(ip)).allowed) {
    logger.warn({ ip, email }, "Password reset requests throttled");
    return data(
      {
        result: submission.reply({
          formErrors: ["Too many requests. Wait a few minutes and try again."],
        }),
        sentTo: null,
      },
      { status: 429 },
    );
  }

  // Past the per-address budget the page still says the mail went out, so
  // it never tells anyone whether an account exists for that address.
  if (rateLimiters.passwordMailByEmail.hit(email.toLowerCase()).allowed) {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: request.headers,
    });
    logger.info({ ip, email }, "Password reset requested");
  } else {
    logger.warn(
      { ip, email },
      "Password reset mail skipped: address throttled",
    );
  }

  return data({ result: submission.reply(), sentTo: email });
};

export const meta: Route.MetaFunction = () => [{ title: "Forgot password" }];

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  const sentTo = actionData?.sentTo ?? null;
  const [form, fields] = useForm({
    lastResult: actionData?.result,
    shouldValidate: "onBlur",
    constraint: getZodConstraint(schema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
  });

  if (sentTo) {
    return (
      <AuthStatus
        standalone
        icon={<MailIcon className="size-7" />}
        heading="check your inbox"
        body={
          <>
            if an account exists for{" "}
            <strong className="text-foreground font-semibold">{sentTo}</strong>,
            we&apos;ve sent a link to reset your password.
          </>
        }
      >
        <Link
          to="/login"
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          back to log in
        </Link>
      </AuthStatus>
    );
  }

  return (
    <AuthShell
      brand={{
        eyebrow: "reset",
        heading: "happens to everyone",
        body: "tell us your email and we'll send a link to set a new password.",
      }}
    >
      <div className="mt-1 flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-light tracking-tight">
          forgot your password?
        </h1>
        <p className="text-muted-foreground text-sm">
          enter the email you signed up with and we&apos;ll send a reset link.
        </p>
      </div>

      <Form
        method="post"
        className="flex flex-col gap-4"
        {...getFormProps(form)}
      >
        <Field
          labelProps={{ children: "email address" }}
          inputProps={{
            ...getInputProps(fields.email, { type: "email" }),
            placeholder: "you@example.com",
          }}
          errors={fields.email.errors}
        />

        <ErrorList id={form.errorId} errors={form.errors} />

        <Button type="submit" size="lg" className="w-full">
          send reset link
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          remembered it?{" "}
          <Link
            to="/login"
            className="text-primary font-semibold hover:underline"
          >
            back to log in
          </Link>
        </p>
      </Form>
    </AuthShell>
  );
}
