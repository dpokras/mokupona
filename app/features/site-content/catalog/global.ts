import { defineTextCategory } from "../types";

export const globalTexts = defineTextCategory({
  title: "Navigation, footer and errors",
  description:
    "Texts that appear on every page: the menu, the footer and the error page.",
  scope: "root",
  entries: {
    brandName: {
      group: "Brand",
      label: "Name",
      help: "Shown next to the logo in the footer, and read out by screen readers.",
      kind: "line",
      default: "moku pona",
    },
    tagline: {
      group: "Brand",
      label: "Footer line",
      help: "The small line under the name in the footer and the mobile menu.",
      kind: "line",
      default: "made with love in zürich",
    },

    dinnersLink: {
      group: "Menu and footer links",
      label: "Dinners",
      kind: "line",
      default: "dinners",
    },
    galleryLink: {
      group: "Menu and footer links",
      label: "Gallery",
      kind: "line",
      default: "gallery",
    },
    aboutLink: {
      group: "Menu and footer links",
      label: "About",
      kind: "line",
      default: "about",
    },
    faqLink: {
      group: "Menu and footer links",
      label: "FAQ",
      kind: "line",
      default: "faq",
    },
    instagramLink: {
      group: "Menu and footer links",
      label: "Instagram",
      kind: "line",
      default: "instagram",
    },
    privacyLink: {
      group: "Menu and footer links",
      label: "Privacy policy",
      kind: "line",
      default: "privacy policy",
    },
    impressumLink: {
      group: "Menu and footer links",
      label: "Impressum",
      kind: "line",
      default: "impressum",
    },
    joinButton: {
      group: "Menu and footer links",
      label: "Join button",
      help: "The highlighted button in the menu that leads to the next dinner.",
      kind: "line",
      default: "join a dinner",
    },
    openMenu: {
      group: "Menu and footer links",
      label: "Open menu (screen readers)",
      help: "Not visible; read out by screen readers for the phone menu button.",
      kind: "line",
      default: "open menu",
    },
    closeMenu: {
      group: "Menu and footer links",
      label: "Close menu (screen readers)",
      kind: "line",
      default: "close menu",
    },
    menuTitle: {
      group: "Menu and footer links",
      label: "Phone menu name (screen readers)",
      help: "What screen readers call the menu that opens on phones.",
      kind: "line",
      default: "menu",
    },
    skipToContent: {
      group: "Menu and footer links",
      label: "Skip to content link",
      help: "Only appears for keyboard users, as the first thing they reach on every page.",
      kind: "line",
      default: "skip to content",
    },
    footerExploreHeading: {
      group: "Menu and footer links",
      label: "Footer heading above the page links",
      kind: "line",
      default: "explore",
    },
    footerFollowHeading: {
      group: "Menu and footer links",
      label: "Footer heading above instagram",
      kind: "line",
      default: "follow",
    },

    notFoundTitle: {
      group: "Error page",
      label: "Page not found: title",
      kind: "line",
      default: "page not found",
    },
    notFoundBody: {
      group: "Error page",
      label: "Page not found: text",
      kind: "paragraph",
      default: "the page you were looking for doesn't exist or has moved.",
    },
    errorTitle: {
      group: "Error page",
      label: "Something went wrong: title",
      kind: "line",
      default: "something went wrong",
    },
    errorBody: {
      group: "Error page",
      label: "Something went wrong: text",
      kind: "paragraph",
      default: "please try again in a moment.",
    },
    backHome: {
      group: "Error page",
      label: "Link back to the homepage",
      kind: "line",
      default: "back to the homepage",
    },
  },
});
