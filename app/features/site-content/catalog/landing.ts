import { defineTextCategory } from "../types";

export const landingTexts = defineTextCategory({
  title: "Homepage",
  description:
    "The title card, the vision section and the dinners preview on the homepage.",
  scope: "root",
  entries: {
    wordmarkAlt: {
      group: "Title card",
      label: "Logo description (screen readers)",
      help: "Not visible; read out by screen readers in place of the hand-drawn logo at the top of the homepage.",
      kind: "line",
      default: "moku pona",
    },
    tagline: {
      group: "Title card",
      label: "Line under the logo",
      kind: "line",
      default: "a dinner society in zürich",
    },
    scrollCue: {
      group: "Title card",
      label: "Scroll hint",
      help: "The small word above the arrow at the bottom of the title card.",
      kind: "line",
      default: "scroll",
    },

    visionHeading: {
      group: "Vision section",
      label: "Heading (screen readers)",
      help: "The page shows the hand-drawn “our vision” heading; screen readers read this out in its place. Keep it matching the drawing.",
      kind: "line",
      default: "our vision",
    },
    visionHeadline: {
      group: "Vision section",
      label: "Headline",
      kind: "line",
      default: "food as a way to connect",
    },
    visionBody: {
      group: "Vision section",
      label: "Text",
      kind: "paragraph",
      default:
        "moku pona began as a passion project by a group of friends who love cooking and wanted a creative way to explore our culinary interests. for us, food is a way to express creativity, share experiences, and connect with others. through our dinner club, we surprise our guests with unique flavors and ingredients, introducing them to diverse cuisines and the stories behind them.",
    },

    nextDinnerHeading: {
      group: "Dinners preview",
      label: "Next dinner heading (screen readers)",
      help: "The page shows the hand-drawn “the next dinner” heading; screen readers read this out in its place.",
      kind: "line",
      default: "the next dinner",
    },
    noUpcomingDinner: {
      group: "Dinners preview",
      label: "Text when no dinner is planned",
      help: "Shown in place of the next dinner when none is scheduled.",
      kind: "paragraph",
      default:
        "nothing on the calendar right now. we're planning the next gathering. the table is never empty for long.",
    },
    pastDinnersHeading: {
      group: "Dinners preview",
      label: "Past dinners heading (screen readers)",
      help: "The page shows the hand-drawn “past dinners” heading; screen readers read this out in its place.",
      kind: "line",
      default: "past dinners",
    },
    seeMoreLink: {
      group: "Dinners preview",
      label: "Link after the past dinners",
      help: "Shown next to the last past dinner when the dinners page has more.",
      kind: "line",
      default: "see more →",
    },
    seeAllLink: {
      group: "Dinners preview",
      label: "Link to all dinners",
      help: "Shown under the dinners when every past dinner already fits on the homepage.",
      kind: "line",
      default: "see all dinners →",
    },

    metaTitle: {
      group: "Search engines and link previews",
      label: "Browser tab title",
      help: "Also the title shown when someone shares a link to the homepage.",
      kind: "line",
      default: "moku pona",
    },
    metaDescription: {
      group: "Search engines and link previews",
      label: "Description",
      help: "Shown under the title in search results and link previews.",
      kind: "line",
      default:
        "A dinner society in Zurich, bringing people together through shared meals, stories, and the joy of discovery.",
    },
  },
});
