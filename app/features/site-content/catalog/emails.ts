import { defineTextCategory } from "../types";

export const emailTexts = defineTextCategory({
  title: "Emails",
  description:
    "The emails the site sends: account verification, password reset and invitations.",
  scope: "server",
  entries: {
    verifySubject: {
      group: "Confirm email address",
      label: "Subject",
      help: "Sent when someone needs to confirm their email address before they can log in.",
      kind: "line",
      default: "Verify your email address",
    },
    verifyGreeting: {
      group: "Confirm email address",
      label: "First paragraph",
      kind: "paragraph",
      default: "Welcome to moku pona!",
    },
    verifyInstructions: {
      group: "Confirm email address",
      label: "Text above the button",
      kind: "paragraph",
      default: "Confirm your email address to activate your account:",
    },
    verifyButton: {
      group: "Confirm email address",
      label: "Button",
      kind: "line",
      default: "Verify email address",
    },
    verifyNote: {
      group: "Confirm email address",
      label: "Small print at the end",
      kind: "paragraph",
      default: "If you didn't create an account, you can ignore this email.",
    },

    resetSubject: {
      group: "Reset password",
      label: "Subject",
      help: "Sent when someone asks to reset a forgotten password.",
      kind: "line",
      default: "Reset your password",
    },
    resetIntro: {
      group: "Reset password",
      label: "First paragraph",
      kind: "paragraph",
      default: "Someone requested a password reset for your moku pona account.",
    },
    resetInstructions: {
      group: "Reset password",
      label: "Text above the button",
      help: "The link stops working after one hour; keep that in mind if you mention it.",
      kind: "paragraph",
      default: "Set a new password here (the link expires in one hour):",
    },
    resetButton: {
      group: "Reset password",
      label: "Button",
      kind: "line",
      default: "Reset password",
    },
    resetNote: {
      group: "Reset password",
      label: "Small print at the end",
      kind: "paragraph",
      default:
        "If this wasn't you, you can ignore this email. Your password stays unchanged.",
    },

    inviteSubject: {
      group: "Invitation",
      label: "Subject",
      help: "Sent when an admin invites someone to create an account.",
      kind: "line",
      default: "You're invited to moku pona",
    },
    inviteMember: {
      group: "Invitation",
      label: "First paragraph, for a member",
      kind: "paragraph",
      default: "You've been invited to join moku pona.",
    },
    inviteModerator: {
      group: "Invitation",
      label: "First paragraph, for a moderator",
      help: "Used instead of the one above when the person is invited as a moderator.",
      kind: "paragraph",
      default:
        "You've been invited to join moku pona as a moderator and help run our dinners.",
    },
    inviteInstructions: {
      group: "Invitation",
      label: "Text above the button",
      help: "The link only works for the invited email address and stops working after 7 days; keep that in mind if you mention it.",
      kind: "paragraph",
      default:
        "Accept your invite here (the link is tied to this email address and expires in 7 days):",
    },
    inviteButton: {
      group: "Invitation",
      label: "Button",
      kind: "line",
      default: "Accept invite",
    },
    inviteNote: {
      group: "Invitation",
      label: "Small print at the end",
      kind: "paragraph",
      default: "If you weren't expecting this, you can ignore this email.",
    },

    linkFallback: {
      group: "Every email",
      label: "Help under the button",
      help: "Shown under the button in every email, followed by the link written out in full.",
      kind: "paragraph",
      default:
        "If the link doesn't work, copy and paste this address into your browser:",
    },
  },
});
