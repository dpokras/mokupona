import type { Logger } from "pino";
import {
  createContext,
  redirect,
  type MiddlewareFunction,
  type RouterContextProvider,
} from "react-router";

import { isAuthToggleEnabled } from "./auth-settings.server";
import { googleAuthEnabled } from "./auth.server";
import {
  getUserWithRole,
  loginRedirect,
  requireResolvedUserWithRole,
  type ValidatedUser,
} from "./guards.server";
import type { RoleName } from "./roles";

import { withRequestLogger } from "~/logger/request-context.server";
import { logger } from "~/logger.server";

export const optionalUserContext =
  createContext<() => Promise<ValidatedUser | null>>();
export const userContext = createContext<ValidatedUser>();

export const requestLoggerContext = createContext<Logger>(logger);

export const requestLoggerMiddleware: MiddlewareFunction<Response> = (
  { context },
  next,
) => {
  const requestId = crypto.randomUUID();
  const requestLogger = logger.child({ requestId });
  context.set(requestLoggerContext, requestLogger);
  return withRequestLogger(requestLogger, next);
};

export const resolveOptionalUserMiddleware: MiddlewareFunction<
  Response
> = async ({ request, context }) => {
  let resolution: Promise<ValidatedUser | null> | undefined;
  context.set(optionalUserContext, () => {
    resolution ??= getUserWithRole(request);
    return resolution;
  });
};

export async function requireResolvedUser(
  context: Readonly<RouterContextProvider>,
  request: Request,
): Promise<ValidatedUser> {
  const user = await context.get(optionalUserContext)();
  if (!user) {
    throw loginRedirect(new URL(request.url).pathname);
  }
  return user;
}

export async function anonymousAuthPageLoader({
  context,
}: {
  context: Readonly<RouterContextProvider>;
}) {
  const user = await context.get(optionalUserContext)();
  if (user) throw redirect("/admin");
  return {
    googleEnabled: googleAuthEnabled && isAuthToggleEnabled("google"),
  };
}

export function requireResolvedUserRoleMiddleware(
  roles: readonly RoleName[],
): MiddlewareFunction<Response> {
  return async ({ request, context }) => {
    const user = requireResolvedUserWithRole(
      await context.get(optionalUserContext)(),
      request,
      roles,
    );
    context.set(userContext, user);
  };
}
