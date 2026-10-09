// @vitest-environment node

import { faker } from "@faker-js/faker";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestUser, ensureAuthRoles } from "../../../test/factories";

import { auth } from "./auth.server";
import { createUserViaAuth } from "./create-user.server";

import { prisma } from "~/db.server";
import { hasPendingInviteFor, upsertInvite } from "~/models/invite.server";

const ORIGIN = "http://localhost:3000";

function signUpOverHttp(email: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        email,
        password: "a-long-enough-password",
        name: "Someone",
      }),
    }),
  );
}

function freshEmail() {
  return `person-${faker.string.uuid()}@example.com`;
}

beforeAll(async () => {
  await ensureAuthRoles();
});

describe("invite-only accounts", () => {
  it("refuses an account created over HTTP without an invite", async () => {
    const email = freshEmail();

    const response = await signUpOverHttp(email);

    expect(response.status).toBe(403);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("lets an invited email through", async () => {
    const admin = await createTestUser("admin");
    const email = freshEmail();
    await upsertInvite({ email, roleName: "user", createdById: admin.id });

    const response = await signUpOverHttp(email.toUpperCase());

    expect(response.status).toBe(200);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("still lets server code create accounts directly", async () => {
    const email = freshEmail();

    const user = await createUserViaAuth({
      email,
      password: "a-long-enough-password",
      name: "Seeded",
    });

    expect(user.email).toBe(email);
  });
});

describe("hasPendingInviteFor", () => {
  it("only counts invites that are open and unexpired", async () => {
    const admin = await createTestUser("admin");
    const open = freshEmail();
    const expired = freshEmail();
    const accepted = freshEmail();

    await upsertInvite({
      email: open,
      roleName: "user",
      createdById: admin.id,
    });
    const expiredInvite = await upsertInvite({
      email: expired,
      roleName: "user",
      createdById: admin.id,
    });
    await prisma.invite.update({
      where: { id: expiredInvite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const acceptedInvite = await upsertInvite({
      email: accepted,
      roleName: "user",
      createdById: admin.id,
    });
    await prisma.invite.update({
      where: { id: acceptedInvite.id },
      data: { acceptedAt: new Date() },
    });

    expect(await hasPendingInviteFor(open.toUpperCase())).toBe(true);
    expect(await hasPendingInviteFor(expired)).toBe(false);
    expect(await hasPendingInviteFor(accepted)).toBe(false);
    expect(await hasPendingInviteFor(freshEmail())).toBe(false);
  });
});
