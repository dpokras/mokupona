import { defineTextCategory } from "../types";

export const faqTexts = defineTextCategory({
  title: "FAQ page",
  description:
    "The title and intro of the FAQ page. The questions themselves are edited under FAQ.",
  scope: "root",
  entries: {
    eyebrow: {
      group: "Page header",
      label: "Small line above the title",
      kind: "line",
      default: "good to know",
    },
    title: {
      group: "Page header",
      label: "Title",
      kind: "line",
      default: "faq",
    },
    intro: {
      group: "Page header",
      label: "Intro",
      help: "The short text under the title.",
      kind: "paragraph",
      default:
        "the things people ask us most, from signing up to what ends up on the plate.",
    },

    empty: {
      group: "Questions",
      label: "When there are no questions",
      help: "Shown instead of the questions while none are published.",
      kind: "paragraph",
      default:
        "no questions here yet. if something is on your mind, write to us and we'll answer it.",
    },

    contactHeading: {
      group: "Below the questions",
      label: "Heading",
      kind: "line",
      default: "still wondering?",
    },
    contactBody: {
      group: "Below the questions",
      label: "Text",
      help: "Leave empty to hide this part of the page.",
      kind: "rich",
      optional: true,
      default:
        "write to us at mokuponadinnerclub@gmail.com and we'll get back to you.",
    },

    metaTitle: {
      group: "Search engines and browser tab",
      label: "Page title",
      help: "Shown in the browser tab and in search results.",
      kind: "line",
      default: "FAQ",
    },
    metaDescription: {
      group: "Search engines and browser tab",
      label: "Description",
      help: "The short summary search engines show under the title.",
      kind: "line",
      default:
        "Answers to common questions about moku pona dinners in Zürich: how to sign up, what it costs, bringing friends and dietary needs.",
    },
  },
});
