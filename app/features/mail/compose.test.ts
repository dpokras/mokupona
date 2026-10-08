import { describe, expect, it } from "vitest";

import { action, compose, note, paragraph } from "./compose";
import { mailTemplates, mailText } from "./templates";

import { getDefaultTexts } from "~/features/site-content/catalog";

const HINT = "If the link doesn't work, copy and paste this address:";

describe("compose", () => {
  it("renders one set of blocks into both text and html", () => {
    const body = compose("Subject", [
      paragraph("First line."),
      action("Do the thing", "https://example.com/go?token=abc", HINT),
      note("Ignore this if it wasn't you."),
    ]);

    expect(body.subject).toBe("Subject");
    expect(body.text).toBe(
      [
        "First line.",
        "",
        "https://example.com/go?token=abc",
        "",
        "Ignore this if it wasn't you.",
      ].join("\n"),
    );
    expect(body.html).toContain("<p>First line.</p>");
    expect(body.html).toContain(
      '<a href="https://example.com/go?token=abc">Do the thing</a>',
    );
    expect(body.html).toContain("Ignore this if it wasn&#39;t you.");
  });

  it("leaves the action URL bare on its own line in text, for Cypress", () => {
    const { text } = compose("Subject", [
      paragraph("Click:"),
      action("Go", "https://example.com/invite/tok", HINT),
    ]);

    const links = text.match(/https?:\/\/[^\s"'<>)]+/g);
    expect(links).toEqual(["https://example.com/invite/tok"]);
  });

  it("repeats the action URL as a copy-paste fallback in html", () => {
    const { html } = compose("Subject", [
      action("Go", "https://example.com/invite/tok", HINT),
    ]);

    expect(html).toContain("copy and paste this address:<br>");
    expect(html?.match(/https:\/\/example\.com\/invite\/tok/g)).toHaveLength(2);
  });

  it("escapes interpolated content instead of trusting the caller", () => {
    const { html, text } = compose("Subject", [
      paragraph('<script>alert("x")</script> & co'),
    ]);

    expect(html).toContain(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co</p>",
    );
    expect(html).not.toContain("<script>");
    expect(text).toContain('<script>alert("x")</script> & co');
  });

  it("keeps line breaks typed into a paragraph", () => {
    const { html, text } = compose("Subject", [
      paragraph("Dear guest,\nsee you soon."),
    ]);

    expect(html).toContain("<p>Dear guest,<br>see you soon.</p>");
    expect(text).toBe("Dear guest,\nsee you soon.");
  });

  it("rejects action links that aren't http(s)", () => {
    expect(() =>
      compose("Subject", [action("Go", "javascript:alert(1)", HINT)]),
    ).toThrow(/must be http\(s\)/);

    expect(() => compose("Subject", [action("Go", "/relative", HINT)])).toThrow(
      /must be an absolute URL/,
    );
  });
});

describe("mailTemplates", () => {
  const url = "https://mokupona.ch/verify?token=t";
  const defaults = getDefaultTexts(["emails"]);
  const t = mailText(defaults);

  it.each(["verifyEmail", "resetPassword"] as const)(
    "%s carries the link in both text and html",
    (name) => {
      const body = mailTemplates[name]({ url }, t);

      expect(body.subject).toBeTruthy();
      expect(body.text).toContain(url);
      expect(body.html).toContain(url);
    },
  );

  it("names the role in the invite copy only for moderators", () => {
    const moderator = mailTemplates.invite({ url, roleName: "moderator" }, t);
    const user = mailTemplates.invite({ url, roleName: "user" }, t);

    expect(moderator.text).toContain("as a moderator");
    expect(moderator.html).toContain("as a moderator");
    expect(user.text).not.toContain("moderator");
    expect(user.text).toContain("You've been invited to join moku pona.");
  });

  it("uses the texts an admin edited", () => {
    const body = mailTemplates.resetPassword(
      { url },
      mailText({
        ...defaults,
        "emails.resetSubject": "New password for moku pona",
        "emails.resetButton": "Choose a new password",
        "emails.linkFallback": "Button not working? Use this address:",
      }),
    );

    expect(body.subject).toBe("New password for moku pona");
    expect(body.html).toContain(`<a href="${url}">Choose a new password</a>`);
    expect(body.html).toContain("Button not working? Use this address:<br>");
  });
});
