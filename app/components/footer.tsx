import { Link } from "react-router";

import { BrandLockup } from "./brand-lockup";
import { Eyebrow } from "./section";

import { useText } from "~/features/site-content/site-text";

const linkClasses = "text-sm text-foreground/80 hover:text-foreground";

const INSTAGRAM_URL = "https://instagram.com/mokupona";

export function Footer() {
  const t = useText();

  const pageLinks = [
    { to: "/dinners", label: t("global.dinnersLink") },
    { to: "/gallery", label: t("global.galleryLink") },
    { to: "/about", label: t("global.aboutLink") },
    { to: "/faq", label: t("global.faqLink") },
    { to: "/privacy", label: t("global.privacyLink") },
    { to: "/impressum", label: t("global.impressumLink") },
  ];

  const instagramLink = (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClasses}
    >
      {t("global.instagramLink")}
    </a>
  );

  return (
    <footer className="border-t">
      <div className="flex items-start justify-between gap-8 px-10 py-11 max-md:hidden">
        <div className="flex flex-col gap-3">
          <BrandLockup logoClassName="size-5" />
          <span className="text-muted-foreground text-xs">
            {t("global.tagline")}
          </span>
        </div>
        <div className="flex gap-14">
          <div className="flex flex-col gap-2">
            <Eyebrow variant="tracked" tone="label">
              {t("global.footerExploreHeading")}
            </Eyebrow>
            {pageLinks.map((link) => (
              <Link key={link.to} to={link.to} className={linkClasses}>
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Eyebrow variant="tracked" tone="label">
              {t("global.footerFollowHeading")}
            </Eyebrow>
            {instagramLink}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 pt-7 pb-10 md:hidden">
        <BrandLockup logoClassName="size-4" wordmarkClassName="text-base" />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {pageLinks.map((link) => (
            <Link key={link.to} to={link.to} className={linkClasses}>
              {link.label}
            </Link>
          ))}
          {instagramLink}
        </div>
        <span className="text-muted-foreground text-xs">
          {t("global.tagline")}
        </span>
      </div>
    </footer>
  );
}
