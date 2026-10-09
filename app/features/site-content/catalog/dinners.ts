import { defineTextCategory } from "../types";

export const dinnersTexts = defineTextCategory({
  title: "Dinners list",
  description:
    "The /dinners page and the dinner cards shown there and on the homepage.",
  scope: "root",
  entries: {
    eyebrow: {
      group: "Page header",
      label: "Small heading above the title",
      kind: "line",
      default: "gatherings",
    },
    title: {
      group: "Page header",
      label: "Page title",
      kind: "line",
      default: "dinners",
    },
    introUpcoming: {
      group: "Page header",
      label: "Intro when a dinner is planned",
      kind: "paragraph",
      default:
        "a handful of seats open before each supper. reserve early, tables are small and fill quickly.",
    },
    introEmpty: {
      group: "Page header",
      label: "Intro when no dinner is planned",
      kind: "paragraph",
      default:
        "we run a handful of intimate dinners a year. there's nothing on the calendar right now, but the next one is never far off.",
    },

    nextDinnerHeading: {
      group: "Section headings",
      label: "Next dinner (screen readers)",
      help: "The page shows the hand-drawn “the next dinner” heading; screen readers read this out in its place.",
      kind: "line",
      default: "the next dinner",
    },
    laterDinnersHeading: {
      group: "Section headings",
      label: "More upcoming dinners",
      help: "Above any dinners planned after the next one.",
      kind: "line",
      default: "also coming up",
    },
    pastDinnersHeading: {
      group: "Section headings",
      label: "Past dinners (screen readers)",
      help: "The page shows the hand-drawn “past dinners” heading; screen readers read this out in its place.",
      kind: "line",
      default: "past dinners",
    },

    emptyKicker: {
      group: "When no dinner is planned",
      label: "Small line above the heading",
      kind: "line",
      default: "nothing on the calendar right now",
    },
    emptyTitle: {
      group: "When no dinner is planned",
      label: "Heading",
      kind: "line",
      default: "the table is being set",
    },
    emptyBody: {
      group: "When no dinner is planned",
      label: "Text",
      kind: "paragraph",
      default:
        "we're planning the next gathering. check back soon to see what's next, or follow along on instagram for the announcement.",
    },
    emptyInstagramButton: {
      group: "When no dinner is planned",
      label: "Instagram button",
      kind: "line",
      default: "follow on instagram",
    },

    nextDinnerBadge: {
      group: "Dinner cards",
      label: "Badge on the next dinner",
      help: "The small label on the photo of the next dinner, here and on the homepage.",
      kind: "line",
      default: "next dinner",
    },
    reserveButton: {
      group: "Dinner cards",
      label: "Reserve button",
      help: "On the next dinner's card; leads to the signup form.",
      kind: "line",
      default: "reserve a seat",
    },
    readMoreLink: {
      group: "Dinner cards",
      label: "Read more link",
      help: "Next to the reserve button; leads to the dinner's page.",
      kind: "line",
      default: "read more →",
    },
    photoCountOne: {
      group: "Dinner cards",
      label: "Photo count, one photo",
      help: "Under a past dinner whose gallery has a single photo. {count} is the number.",
      kind: "line",
      default: "{count} photo",
      placeholders: ["count"],
    },
    photoCountMany: {
      group: "Dinner cards",
      label: "Photo count, several photos",
      help: "Under a past dinner with a gallery. {count} is the number of photos.",
      kind: "line",
      default: "{count} photos",
      placeholders: ["count"],
    },

    metaTitle: {
      group: "Search engines and link previews",
      label: "Browser tab title",
      kind: "line",
      default: "Dinners",
    },
  },
});
