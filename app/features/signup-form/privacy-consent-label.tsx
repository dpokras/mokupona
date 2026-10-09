import { Link } from "react-router";

import { useText } from "~/features/site-content/site-text";

/** The privacy checkbox label, with the policy link where the text has `{link}`. */
export function PrivacyConsentLabel() {
  const t = useText();
  const [before, ...after] = t("dinner.privacyConsent").split("{link}");

  return (
    <span className="text-sm">
      {before}
      {after.length > 0 ? (
        <>
          <Link to="/privacy" className="text-primary">
            {t("dinner.privacyConsentLink")}
          </Link>
          {after.join("")}
        </>
      ) : null}
    </span>
  );
}
