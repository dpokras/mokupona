import {
  Form,
  isRouteErrorResponse,
  Outlet,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/admin";

import { AdminTabs } from "~/components/admin-tabs";
import { RouteErrorContent } from "~/components/route-error-content";
import { PageContainer } from "~/components/section";
import { Button } from "~/components/ui/button";
import {
  requireResolvedUserRoleMiddleware,
  userContext,
} from "~/features/auth/middleware.server";
import { ADMIN_ROLE_NAMES, isAdminRole } from "~/features/auth/roles";
import { countAddresses } from "~/models/address.server";
import { countBoardMembers } from "~/models/board-member.server";
import { countEvents } from "~/models/event.server";
import { countUsers } from "~/models/user.server";

export const middleware: Route.MiddlewareFunction[] = [
  requireResolvedUserRoleMiddleware(ADMIN_ROLE_NAMES),
];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  const isAdmin = isAdminRole(user.role.name);

  const [dinners, locations, board, users] = await Promise.all([
    countEvents(),
    countAddresses(),
    countBoardMembers(),
    isAdmin ? countUsers() : Promise.resolve(null),
  ]);

  return { counts: { dinners, locations, board, users }, isAdmin };
}

export const meta: Route.MetaFunction = () => {
  return [{ title: "Admin" }];
};

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <AdminTabs counts={loaderData.counts} isAdmin={loaderData.isAdmin} />
      <PageContainer className="grow pt-7 pb-20">
        <Outlet />
      </PageContainer>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // the layout's loader only ran if the account passed the area-wide check,
  // so a 403 with layout data comes from an admin-only page inside it
  const insideAdminArea = Boolean(useRouteLoaderData("routes/admin"));

  if (isRouteErrorResponse(error) && error.status === 403 && !insideAdminArea) {
    return (
      <PageContainer className="flex grow flex-col items-center gap-4 pt-16 pb-20 text-center">
        <h1 className="text-2xl font-semibold">No admin access</h1>
        <p className="text-muted-foreground max-w-md">
          You're logged in, but this account doesn't have access to the admin
          area. Ask an admin to invite you with the right role.
        </p>
        <Form method="POST" action="/logout">
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </Form>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="grow pt-7 pb-20">
      <RouteErrorContent error={error} />
    </PageContainer>
  );
}
