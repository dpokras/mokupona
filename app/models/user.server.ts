import type { Prisma, Role, User } from "#prisma/generated/client";

import { prisma } from "~/db.server";

export type { User } from "#prisma/generated/client";

export async function getUserByIdWithRole(
  id: string,
): Promise<(User & { role: Role }) | null> {
  return prisma.user.findUnique({ where: { id }, include: { role: true } });
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

export async function countUsers(): Promise<number> {
  return prisma.user.count();
}

export async function listUsersWithRoleName(): Promise<
  { id: string; email: string; role: { name: string } }[]
> {
  return prisma.user.findMany({
    select: { id: true, email: true, role: { select: { name: true } } },
  });
}

export async function getUserAccountSummary(id: string): Promise<{
  name: string;
  email: string;
  emailVerified: boolean;
  role: { name: string; description: string };
} | null> {
  return prisma.user.findUnique({
    where: { id },
    select: {
      name: true,
      email: true,
      emailVerified: true,
      role: { select: { name: true, description: true } },
    },
  });
}

export async function getUserAuthOverview(id: string): Promise<{
  hasPassword: boolean;
  googleLinked: boolean;
  sessionCount: number;
}> {
  const [accounts, sessionCount] = await Promise.all([
    prisma.account.findMany({
      where: { userId: id },
      select: { providerId: true },
    }),
    prisma.session.count({
      where: { userId: id, expiresAt: { gt: new Date() } },
    }),
  ]);

  return {
    hasPassword: accounts.some((a) => a.providerId === "credential"),
    googleLinked: accounts.some((a) => a.providerId === "google"),
    sessionCount,
  };
}

export async function updateUserName(id: string, name: string): Promise<void> {
  await prisma.user.update({ where: { id }, data: { name } });
}

export async function setUserEmailVerified(id: string): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: { emailVerified: true },
  });
}

/** False when the user is missing or an admin, whose role never changes here. */
export async function updateNonAdminUserRole(
  userId: string,
  roleId: string,
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, role: { NOT: { name: "admin" } } },
    data: { roleId },
  });
  return count > 0;
}

async function deleteUserInTx(tx: Prisma.TransactionClient, id: string) {
  return tx.user.delete({ where: { id } });
}

export async function deleteUserById(id: string): Promise<User> {
  return prisma.$transaction((tx) => deleteUserInTx(tx, id));
}

export async function deleteNonAdminUserById(id: string): Promise<User | null> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user || user.role.name === "admin") return null;

    return deleteUserInTx(tx, id);
  });
}
