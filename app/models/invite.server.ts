import { createHash, randomBytes } from "node:crypto";

import type { Invite } from "#prisma/generated/client";

import { prisma } from "~/db.server";
import type { InvitableRole } from "~/features/users/invite.shared";
import { requestLogger } from "~/logger/request-context.server";

export type InviteWithToken = Invite & { token: string };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = SEVEN_DAYS_MS;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function freshToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    fields: {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  };
}

export async function upsertInvite({
  email,
  roleName,
  createdById,
}: {
  email: string;
  roleName: InvitableRole;
  createdById: string;
}): Promise<InviteWithToken> {
  const normalizedEmail = email.toLowerCase();
  const { token, fields } = freshToken();
  const inviteBody = { roleName, createdById, ...fields };

  const invite = await prisma.$transaction(async (tx) => {
    const existingInvite = await tx.invite.findFirst({
      where: { email: normalizedEmail, acceptedAt: null },
      select: { id: true },
    });

    return existingInvite
      ? tx.invite.update({
          where: { id: existingInvite.id },
          data: inviteBody,
        })
      : tx.invite.create({
          data: { email: normalizedEmail, ...inviteBody },
        });
  });

  return { ...invite, token };
}

export async function refreshInvite(
  id: string,
): Promise<InviteWithToken | null> {
  const existingInvite = await prisma.invite.findUnique({ where: { id } });
  if (!existingInvite || existingInvite.acceptedAt) return null;
  const { token, fields } = freshToken();
  const updated = await prisma.invite.update({
    where: { id },
    data: fields,
  });
  return { ...updated, token };
}

export async function listPendingInvites(): Promise<Invite[]> {
  return prisma.invite.findMany({
    where: { acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function hasPendingInviteFor(email: string): Promise<boolean> {
  const invite = await prisma.invite.findFirst({
    where: {
      email: email.toLowerCase(),
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return invite !== null;
}

export async function getInviteByToken(
  token: string,
): Promise<(Invite & { createdBy: { name: string } }) | null> {
  if (!token) return null;
  return prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { createdBy: { select: { name: true } } },
  });
}

type InviteValidity = "valid" | "invalid" | "expired" | "used";

export function inviteValidity(invite: Invite | null): InviteValidity {
  if (!invite) return "invalid";
  if (invite.acceptedAt) return "used";
  if (invite.expiresAt < new Date()) return "expired";
  return "valid";
}

export async function revokeInvite(id: string): Promise<void> {
  await prisma.invite.deleteMany({ where: { id } });
}

export class InviteNoLongerValidError extends Error {
  constructor() {
    super("Invite is no longer valid");
  }
}

export async function acceptInvite({
  invite,
  userId,
}: {
  invite: Pick<Invite, "id" | "roleName">;
  userId: string;
}): Promise<void> {
  const promotedTo = await prisma.$transaction(async (tx) => {
    const consumed = await tx.invite.updateMany({
      where: { id: invite.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });

    if (consumed.count === 0) {
      throw new InviteNoLongerValidError();
    }

    let promoteToRoleId: string | null = null;
    if (invite.roleName === "moderator") {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { role: { select: { name: true } } },
      });
      if (user.role.name === "user") {
        const moderatorRole = await tx.role.findUnique({
          where: { name: "moderator" },
          select: { id: true },
        });
        if (!moderatorRole) {
          throw new Error("Invite carries an unknown role");
        }
        promoteToRoleId = moderatorRole.id;
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        ...(promoteToRoleId && { role: { connect: { id: promoteToRoleId } } }),
      },
    });

    return promoteToRoleId ? invite.roleName : null;
  });

  if (promotedTo) {
    requestLogger.warn(
      { userId, inviteId: invite.id, role: promotedTo },
      "Invite promoted a user's role",
    );
  }
}
