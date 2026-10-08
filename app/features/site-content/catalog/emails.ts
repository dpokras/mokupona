import { defineTextCategory } from "../types";

export const emailTexts = defineTextCategory({
  title: "Emails",
  description:
    "The emails the site sends: account verification, password reset and invitations.",
  scope: "server",
  entries: {},
});
