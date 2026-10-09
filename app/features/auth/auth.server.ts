import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import invariant from "tiny-invariant";

import { NOT_INVITED_ERROR } from "./auth-settings";
import { googleGate } from "./google-gate.server";

import { prisma } from "~/db.server";
import { sendTemplate } from "~/features/mail/mail.server";
import { requestLogger } from "~/logger/request-context.server";
import { logger } from "~/logger.server";
import { hasPendingInviteFor } from "~/models/invite.server";
import { getRoleByName } from "~/models/role.server";
import { setUserEmailVerified } from "~/models/user.server";
import { singleton } from "~/utils/singleton.server";

invariant(process.env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET must be set");

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleProvider =
  googleClientId && googleClientSecret
    ? {
        prompt: "select_account" as const,
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      }
    : undefined;

export const googleAuthEnabled = Boolean(googleProvider);

export const auth = singleton("better-auth", () => {
  logger.info({ googleAuthEnabled }, "auth configured");

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "sqlite" }),
    onAPIError: { errorURL: "/login" },
    // Fly sets Fly-Client-IP to the real peer; X-Forwarded-For (the default)
    // can carry addresses the client made up, which would skew rate limits.
    advanced: { ipAddress: { ipAddressHeaders: ["fly-client-ip"] } },
    user: {
      additionalFields: {
        roleId: { type: "string", required: false, input: false },
      },
    },
    socialProviders: googleProvider ? { google: googleProvider } : undefined,
    hooks: { before: googleGate },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: ({ user, url }) =>
        sendTemplate("resetPassword", user.email, { url }),
      onPasswordReset: ({ user }) => setUserEmailVerified(user.id),
    },
    emailVerification: {
      // We send the mail manually after users self-signup.
      // On the invite-flow the email should not be sent, as
      // the reception of the invite-mail proves ownership.
      sendOnSignUp: false,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: ({ user, url }) =>
        sendTemplate("verifyEmail", user.email, { url }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            // Accounts are invite-only. Server code (the invite page, seeds)
            // creates users directly; anything arriving over HTTP, such as
            // a first google sign-in, needs an open invite for that email.
            if (context?.request && !(await hasPendingInviteFor(user.email))) {
              requestLogger.warn(
                { email: user.email },
                "Refused to create an account without an invite",
              );
              throw new APIError("FORBIDDEN", { message: NOT_INVITED_ERROR });
            }

            const role = await getRoleByName("user");
            if (!role) {
              requestLogger.error(
                { email: user.email },
                "Default role 'user' missing during signup",
              );
              throw new Error("Default role 'user' is not seeded");
            }
            return { data: { ...user, roleId: role.id } };
          },
        },
        update: {
          after: async (user) => {
            requestLogger.info({ userId: user.id }, "User record updated");
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            requestLogger.info({ userId: session.userId }, "Session created");
          },
        },
      },
      account: {
        create: {
          after: async (account) => {
            requestLogger.warn(
              { userId: account.userId, provider: account.providerId },
              "Account linked to a user",
            );
          },
        },
      },
    },
  });
});
