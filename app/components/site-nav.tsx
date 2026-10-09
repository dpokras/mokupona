import { ChevronRightIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Link, useLocation } from "react-router";

import { BrandLockup } from "./brand-lockup";
import { Glow } from "./section";
import { buttonVariants } from "./ui/button";

import { InstagramIcon } from "~/components/icons";
import { useText, type TextFunction } from "~/features/site-content/site-text";
import { cn } from "~/lib/utils";

const INSTAGRAM_URL = "https://instagram.com/mokupona";
const MOBILE_MENU_ID = "mobile-menu";

type NavItem =
  | {
      kind: "link";
      label: string;
      to: string;
      isActive: (pathname: string) => boolean;
    }
  | { kind: "instagram" };

function buildNavItems(t: TextFunction): NavItem[] {
  return [
    {
      kind: "link",
      label: t("global.dinnersLink"),
      to: "/dinners",
      // a dinner's album belongs to the gallery tab, not this one
      isActive: (pathname) =>
        pathname.startsWith("/dinners") && !pathname.endsWith("/gallery"),
    },
    {
      kind: "link",
      label: t("global.galleryLink"),
      to: "/gallery",
      // per-dinner albums live under /dinners/:id/gallery, so also light up
      // this tab when the reader is inside one
      isActive: (pathname) =>
        pathname.startsWith("/gallery") || pathname.endsWith("/gallery"),
    },
    {
      kind: "link",
      label: t("global.aboutLink"),
      to: "/about",
      isActive: (pathname) => pathname.startsWith("/about"),
    },
    {
      kind: "link",
      label: t("global.faqLink"),
      to: "/faq",
      isActive: (pathname) => pathname.startsWith("/faq"),
    },
    { kind: "instagram" },
  ];
}

export function SiteNav({ joinHref }: { joinHref: string }) {
  const t = useText();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  const navItems = buildNavItems(t);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const sectionLinkClasses = (active: boolean) =>
    cn(
      "hover:text-foreground pb-1",
      active && "text-foreground border-b border-primary",
    );

  return (
    <>
      <nav className="border-b">
        <div className="flex h-16 items-center justify-between px-10 max-md:hidden">
          <BrandLockup to="/" showWordmark={false} logoClassName="size-11" />

          <div className="text-foreground/80 flex items-center gap-7 text-sm">
            {navItems.map((item) => {
              switch (item.kind) {
                case "link":
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={sectionLinkClasses(
                        item.isActive(location.pathname),
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                case "instagram":
                  return (
                    <a
                      key="instagram"
                      href={INSTAGRAM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground"
                    >
                      <InstagramIcon className="size-5" />
                      <span className="sr-only">
                        {t("global.instagramLink")}
                      </span>
                    </a>
                  );
              }
            })}

            <Link to={joinHref} className={buttonVariants({ size: "sm" })}>
              {t("global.joinButton")}
            </Link>
          </div>
        </div>

        <div className="flex h-14 items-center justify-between px-5 md:hidden">
          <BrandLockup to="/" showWordmark={false} logoClassName="size-10" />
          <button
            ref={openButtonRef}
            type="button"
            aria-label={t("global.openMenu")}
            aria-expanded={menuOpen}
            aria-controls={MOBILE_MENU_ID}
            className="flex flex-col gap-1 py-2"
            onClick={() => setMenuOpen(true)}
          >
            <span className="bg-foreground/80 h-0.5 w-5" />
            <span className="bg-foreground/80 h-0.5 w-5" />
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <MobileMenu
          joinHref={joinHref}
          navItems={navItems}
          onClose={() => {
            setMenuOpen(false);
            openButtonRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function MobileMenu({
  joinHref,
  navItems,
  onClose: closeMenu,
}: {
  joinHref: string;
  navItems: NavItem[];
  onClose: () => void;
}) {
  const t = useText();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeMenuRef = useRef(closeMenu);
  closeMenuRef.current = closeMenu;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      );
    focusable()[0]?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenuRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      ref={panelRef}
      id={MOBILE_MENU_ID}
      role="dialog"
      aria-modal="true"
      aria-label={t("global.menuTitle")}
      className="bg-background fixed inset-0 z-50 flex flex-col overflow-hidden md:hidden"
    >
      <Glow strong className="-top-10 -right-10 size-72" />

      <div className="relative border-b">
        <div className="flex h-14 items-center justify-between px-5">
          <BrandLockup to="/" showWordmark={false} logoClassName="size-10" />
          <button
            type="button"
            aria-label={t("global.closeMenu")}
            className="p-2"
            onClick={closeMenu}
          >
            <XIcon className="size-5" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col overflow-y-auto px-5 pt-10 pb-8">
        <div className="flex flex-col">
          {navItems.map((item) => {
            switch (item.kind) {
              case "link":
                return (
                  <MobileMenuLink key={item.to} to={item.to}>
                    {item.label}
                  </MobileMenuLink>
                );
              case "instagram":
                return null;
            }
          })}
        </div>

        <Link
          to={joinHref}
          className={cn(buttonVariants({ size: "lg" }), "mt-8")}
        >
          {t("global.joinButton")}
        </Link>

        <div className="mt-auto flex flex-col gap-4 pt-9">
          <div className="text-foreground/80 flex gap-6 text-sm">
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
              {t("global.instagramLink")}
            </a>
            <Link to="/privacy">{t("global.privacyLink")}</Link>
            <Link to="/impressum">{t("global.impressumLink")}</Link>
          </div>
          <span className="text-muted-foreground text-xs">
            {t("global.tagline")}
          </span>
        </div>
      </div>
    </div>
  );
}

function MobileMenuLink({
  className,
  children,
  ...rest
}: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "flex items-center justify-between border-b py-4 text-xl tracking-tight",
        className,
      )}
      {...rest}
    >
      {children}
      <ChevronRightIcon className="text-primary size-5" />
    </Link>
  );
}
