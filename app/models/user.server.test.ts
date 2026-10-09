import { beforeAll, describe, expect, it } from "vitest";

import {
  buildEventData,
  createTestUser,
  ensureAuthRoles,
} from "../../test/factories";

import { createEvent } from "./event.server";
import { getRoleByName } from "./role.server";
import { deleteNonAdminUserById, updateNonAdminUserRole } from "./user.server";

import { prisma } from "~/db.server";

describe("deleteNonAdminUserById", () => {
  it("deletes a non-admin user", async () => {
    const user = await createTestUser("user");

    await expect(deleteNonAdminUserById(user.id)).resolves.toMatchObject({
      id: user.id,
    });
    await expect(
      prisma.user.findUnique({ where: { id: user.id } }),
    ).resolves.toBeNull();
  });

  it("does not delete an admin user", async () => {
    const admin = await createTestUser("admin");

    await expect(deleteNonAdminUserById(admin.id)).resolves.toBeNull();
    await expect(
      prisma.user.findUnique({ where: { id: admin.id } }),
    ).resolves.not.toBeNull();
  });

  it("keeps an owned event, clearing authorship (SetNull)", async () => {
    const data = await buildEventData();
    const event = await createEvent(data);

    await deleteNonAdminUserById(data.createdById);

    const after = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(after.createdById).toBeNull();
    await expect(
      prisma.form.findUnique({ where: { id: event.formId } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.image.findFirst({ where: { event: { id: event.id } } }),
    ).resolves.not.toBeNull();
  });

  it("treats a missing user as an idempotent no-op", async () => {
    await expect(deleteNonAdminUserById("does-not-exist")).resolves.toBeNull();
  });
});

describe("updateNonAdminUserRole", () => {
  beforeAll(async () => {
    await ensureAuthRoles();
  });

  it("changes a non-admin's role and reports it", async () => {
    const user = await createTestUser("user");
    const moderator = await getRoleByName("moderator");

    await expect(updateNonAdminUserRole(user.id, moderator!.id)).resolves.toBe(
      true,
    );
  });

  it("leaves admins and missing users alone without throwing", async () => {
    const admin = await createTestUser("admin");
    const user = await getRoleByName("user");

    await expect(updateNonAdminUserRole(admin.id, user!.id)).resolves.toBe(
      false,
    );
    await expect(
      updateNonAdminUserRole("no-such-user", user!.id),
    ).resolves.toBe(false);
    await expect(
      prisma.user.findUnique({
        where: { id: admin.id },
        select: { role: { select: { name: true } } },
      }),
    ).resolves.toMatchObject({ role: { name: "admin" } });
  });
});
