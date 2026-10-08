import type { MailBody } from "./compose";
import { createCaptureProvider } from "./providers/capture.server";
import { createConsoleProvider } from "./providers/console.server";
import { createResendProvider } from "./providers/resend.server";
import { mailTemplates, mailText } from "./templates";
import type {
  MailTemplateName,
  MailTemplateProps,
  MailText,
} from "./templates";
import type { MailProvider } from "./types";

import { loadSiteTexts } from "~/features/site-content/site-texts.server";
import { requestLogger } from "~/logger/request-context.server";
import { logger } from "~/logger.server";
import { singleton } from "~/utils/singleton.server";

function mailProviderName(env: NodeJS.ProcessEnv) {
  return env.MAIL_PROVIDER ?? "console";
}

export function createMailProvider(
  env: NodeJS.ProcessEnv = process.env,
): MailProvider {
  const name = mailProviderName(env);
  switch (name) {
    case "console":
      return createConsoleProvider();
    case "capture":
      return createCaptureProvider(env.MAIL_CAPTURE_DIR);
    case "resend":
      return createResendProvider(env);
    default:
      throw new Error(
        `Unknown MAIL_PROVIDER "${name}" — expected "resend", "console" or "capture"`,
      );
  }
}

const provider = singleton("mail-provider", () => {
  const instance = createMailProvider();
  logger.info(
    { provider: mailProviderName(process.env) },
    "mail provider selected",
  );
  return instance;
});

export async function sendTemplate<Name extends MailTemplateName>(
  name: Name,
  to: string,
  props: MailTemplateProps<Name>,
): Promise<void> {
  const render = mailTemplates[name] as (
    props: MailTemplateProps<Name>,
    t: MailText,
  ) => MailBody;

  try {
    const t = mailText(await loadSiteTexts("emails"));
    await provider.send({ to, ...render(props, t) });
  } catch (error) {
    requestLogger.error(
      { template: name, email: to, error },
      "Failed to send mail",
    );
    throw error;
  }

  requestLogger.info({ template: name, email: to }, "Sent mail");
}
