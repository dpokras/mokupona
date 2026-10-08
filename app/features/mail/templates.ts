import type { MailBody } from "./compose";
import { action, compose, note, paragraph } from "./compose";

import type { TextKeyIn } from "~/features/site-content/catalog";
import { interpolate } from "~/features/site-content/text";
import type { SiteTexts, TextVariables } from "~/features/site-content/types";
import type { InvitableRole } from "~/features/users/invite.shared";

export type MailText = (
  key: TextKeyIn<"emails">,
  variables?: TextVariables,
) => string;

export function mailText(texts: SiteTexts): MailText {
  return (key, variables) => interpolate(texts[key] ?? key, variables);
}

export const mailTemplates = {
  verifyEmail: ({ url }: { url: string }, t: MailText) =>
    compose(t("emails.verifySubject"), [
      paragraph(t("emails.verifyGreeting")),
      paragraph(t("emails.verifyInstructions")),
      action(t("emails.verifyButton"), url, t("emails.linkFallback")),
      note(t("emails.verifyNote")),
    ]),

  resetPassword: ({ url }: { url: string }, t: MailText) =>
    compose(t("emails.resetSubject"), [
      paragraph(t("emails.resetIntro")),
      paragraph(t("emails.resetInstructions")),
      action(t("emails.resetButton"), url, t("emails.linkFallback")),
      note(t("emails.resetNote")),
    ]),

  invite: (
    { url, roleName }: { url: string; roleName: InvitableRole },
    t: MailText,
  ) =>
    compose(t("emails.inviteSubject"), [
      paragraph(
        roleName === "moderator"
          ? t("emails.inviteModerator")
          : t("emails.inviteMember"),
      ),
      paragraph(t("emails.inviteInstructions")),
      action(t("emails.inviteButton"), url, t("emails.linkFallback")),
      note(t("emails.inviteNote")),
    ]),
} satisfies Record<string, (props: never, t: MailText) => MailBody>;

type MailTemplates = typeof mailTemplates;
export type MailTemplateName = keyof MailTemplates;
export type MailTemplateProps<K extends MailTemplateName> = Parameters<
  MailTemplates[K]
>[0];
