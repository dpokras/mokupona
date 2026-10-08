import { defineTextCategory } from "../types";

export const aboutTexts = defineTextCategory({
  title: "About",
  description:
    "The about page: who we are and the hall of fame of the people who run moku pona.",
  scope: "root",
  entries: {
    metaTitle: {
      group: "Search engines and browser tab",
      label: "Browser tab title",
      kind: "line",
      default: "About",
    },
    metaDescription: {
      group: "Search engines and browser tab",
      label: "Description for search engines",
      help: "Not shown on the page; search engines and link previews may show it under the title.",
      kind: "line",
      default:
        "The people behind moku pona: a dinner society in Zurich built on community, creativity, and hospitality.",
    },

    eyebrow: {
      group: "Top of the page",
      label: "Small line above the title",
      kind: "line",
      default: "the people",
    },
    title: {
      group: "Top of the page",
      label: "Title",
      kind: "line",
      default: "about",
    },
    intro: {
      group: "Top of the page",
      label: "Intro",
      help: "The paragraph under the title.",
      kind: "paragraph",
      default:
        "moku pona runs on volunteers: the ones who cook, host, wash up, and somehow still have room for dessert.",
    },

    whoWeAreEyebrow: {
      group: "Who we are",
      label: "Small line above the heading",
      kind: "line",
      default: "who we are",
    },
    whoWeAreHeading: {
      group: "Who we are",
      label: "Heading",
      kind: "line",
      default: "a community of around fifteen",
    },
    whoWeAreBody: {
      group: "Who we are",
      label: "Text",
      kind: "paragraph",
      default:
        "what started as a shared love of cooking has grown into a community who come together to create, host, and share meals. as an association, moku pona is about community, creativity, and hospitality, not just dining, but making people feel welcome.",
    },

    hallOfFameHeading: {
      group: "Hall of fame",
      label: "Heading above the people",
      help: "The people themselves are added and changed in the board tab of the admin area.",
      kind: "line",
      default: "the moku pona hall of fame",
    },
    hallOfFameEmpty: {
      group: "Hall of fame",
      label: "Text when nobody is listed yet",
      kind: "paragraph",
      default:
        "the hall is still being hung. check back once we've persuaded everyone to sit still for a photograph.",
    },
  },
});
