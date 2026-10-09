import { parseWithZod } from "@conform-to/zod/v4";
import { Form } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/admin.settings";

import { AdminPageHeader } from "~/components/admin-ui";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  AUTH_TOGGLE_COPY,
  AUTH_TOGGLES,
  type AuthSettings,
  type AuthToggle,
} from "~/features/auth/auth-settings";
import {
  getAuthSettings,
  setAuthToggleEnabled,
} from "~/features/auth/auth-settings.server";
import {
  requestLoggerContext,
  requireResolvedUserRoleMiddleware,
} from "~/features/auth/middleware.server";
import { redirectWithToast } from "~/utils/toast.server";

export const middleware: Route.MiddlewareFunction[] = [
  requireResolvedUserRoleMiddleware(["admin"]),
];

const schema = z.object({
  toggle: z.enum(AUTH_TOGGLES),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export async function loader() {
  return { authSettings: getAuthSettings() };
}

export async function action({ request, context }: Route.ActionArgs) {
  const logger = context.get(requestLoggerContext);
  const submission = parseWithZod(await request.formData(), { schema });

  if (submission.status !== "success" || !submission.value) {
    throw new Response("Bad request", { status: 400 });
  }

  const { toggle, enabled } = submission.value;
  setAuthToggleEnabled(toggle, enabled);

  logger.info({ toggle, enabled }, "Self-service auth setting changed");

  return redirectWithToast("/admin/settings", {
    title: `${AUTH_TOGGLE_COPY[toggle].label} ${enabled ? "enabled" : "disabled"}`,
    type: "success",
  });
}

export const meta: Route.MetaFunction = () => [{ title: "Admin - Settings" }];

export default function AdminSettingsPage({
  loaderData,
}: Route.ComponentProps) {
  const { authSettings } = loaderData;

  return (
    <div className="animate-page-in">
      <AdminPageHeader
        eyebrow="settings"
        title="Access"
        subtitle="Accounts are by invitation only (see Users). Here you choose whether the team can also sign in with Google."
      />

      <Card className="p-4 md:p-5">
        <h2 className="text-base font-semibold">Self-service</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          These switches reset to enabled whenever the server restarts.
        </p>

        <div className="mt-3 flex flex-col">
          {AUTH_TOGGLES.map((toggle) => (
            <AuthToggleRow
              key={toggle}
              toggle={toggle}
              settings={authSettings}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function AuthToggleRow({
  toggle,
  settings,
}: {
  toggle: AuthToggle;
  settings: AuthSettings;
}) {
  const enabled = settings[toggle];

  return (
    <div className="flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">
            {AUTH_TOGGLE_COPY[toggle].label}
          </p>
          <Badge variant={enabled ? "info" : "secondary"} pill>
            {enabled ? "open" : "closed"}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {AUTH_TOGGLE_COPY[toggle].description}
        </p>
      </div>

      <Form method="post" replace>
        <input type="hidden" name="toggle" value={toggle} />
        <input
          type="hidden"
          name="enabled"
          value={enabled ? "false" : "true"}
        />
        <Button
          type="submit"
          size="sm"
          variant={enabled ? "destructive-outline" : "outline"}
        >
          {enabled ? "disable" : "enable"}
        </Button>
      </Form>
    </div>
  );
}
