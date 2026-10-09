import { normalizeInvitableRole } from "./invite.shared";
import type { InvitableRole } from "./invite.shared";

import { sendTemplate } from "~/features/mail/mail.server";
import { requestLogger } from "~/logger/request-context.server";
import type { InviteWithToken } from "~/models/invite.server";
import { refreshInvite, upsertInvite } from "~/models/invite.server";

async function sendInviteMail({
  invite,
  origin,
}: {
  invite: InviteWithToken;
  origin: string;
}) {
  const roleName = normalizeInvitableRole(invite.roleName);

  await sendTemplate("invite", invite.email, {
    url: `${origin}/invite/${invite.token}`,
    roleName,
  });
}

export async function createAndSendInvite({
  email,
  roleName,
  createdById,
  origin,
}: {
  email: string;
  roleName: InvitableRole;
  createdById: string;
  origin: string;
}): Promise<void> {
  const invite = await upsertInvite({ email, roleName, createdById });
  await sendInviteMail({ invite, origin });
}

export async function resendInvite({
  id,
  origin,
}: {
  id: string;
  origin: string;
}): Promise<string | null> {
  const invite = await refreshInvite(id);
  if (!invite) {
    requestLogger.warn(
      { inviteId: id },
      "Re-send found no live invite to refresh",
    );
    return null;
  }
  await sendInviteMail({ invite, origin });
  return invite.email;
}
