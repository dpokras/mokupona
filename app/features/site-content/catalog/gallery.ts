import { defineTextCategory } from "../types";

export const galleryTexts = defineTextCategory({
  title: "Gallery",
  description:
    "The gallery page, each dinner's photo album and the viewer that opens when someone clicks a photo.",
  scope: "root",
  entries: {
    metaTitle: {
      group: "Gallery page",
      label: "Browser tab title",
      help: "Shown in the browser tab and in search results.",
      kind: "line",
      default: "Gallery",
    },
    eyebrow: {
      group: "Gallery page",
      label: "Small line above the title",
      kind: "line",
      default: "from the table",
    },
    title: {
      group: "Gallery page",
      label: "Title",
      kind: "line",
      default: "gallery",
    },
    intro: {
      group: "Gallery page",
      label: "Intro",
      help: "The paragraph under the title.",
      kind: "paragraph",
      default:
        "plates, hands, half-finished glasses: everything we managed to photograph before it was eaten. one room per dinner.",
    },
    photoCountOne: {
      group: "Gallery page",
      label: "Number of photos in an album (one photo)",
      help: "Shown under the cover of an album that holds a single photo.",
      kind: "line",
      default: "{count} photo",
      placeholders: ["count"],
    },
    photoCountOther: {
      group: "Gallery page",
      label: "Number of photos in an album (several photos)",
      help: "Shown under the cover of an album that holds more than one photo.",
      kind: "line",
      default: "{count} photos",
      placeholders: ["count"],
    },
    empty: {
      group: "Gallery page",
      label: "Text when there are no albums yet",
      kind: "paragraph",
      default:
        "no photographs yet. the first album appears once a dinner has been eaten and someone remembers to bring a camera.",
    },

    albumMetaTitle: {
      group: "A dinner's photo album",
      label: "Browser tab title",
      help: "{dinner} is the dinner's title.",
      kind: "line",
      default: "{dinner}: gallery",
      placeholders: ["dinner"],
    },
    albumBackLink: {
      group: "A dinner's photo album",
      label: "Link back to the gallery page",
      kind: "line",
      default: "all galleries",
    },

    dinnerPageHeading: {
      group: "Photos on a dinner's page",
      label: "Heading above the photos",
      help: "Shown on the page of a past dinner, above that evening's photos.",
      kind: "line",
      default: "from that evening",
    },

    wallEmptyTitle: {
      group: "Photo wall",
      label: "No photos yet: small heading",
      help: "Shown in place of a photo wall that has nothing on it yet.",
      kind: "line",
      default: "no photos yet",
    },
    wallEmptyBody: {
      group: "Photo wall",
      label: "No photos yet: text",
      kind: "paragraph",
      default:
        "nothing on the wall yet. the next dinner will hang the first ones.",
    },

    viewerTitle: {
      group: "Photo viewer",
      label: "Name of the photo viewer (screen readers)",
      help: "Not visible; read out by screen readers when someone opens a photo full size.",
      kind: "line",
      default: "gallery",
    },
    viewerPrevious: {
      group: "Photo viewer",
      label: "Previous photo button (screen readers)",
      help: "Not visible; read out by screen readers for the left arrow.",
      kind: "line",
      default: "Previous slide",
    },
    viewerNext: {
      group: "Photo viewer",
      label: "Next photo button (screen readers)",
      help: "Not visible; read out by screen readers for the right arrow.",
      kind: "line",
      default: "Next slide",
    },
    viewerClose: {
      group: "Photo viewer",
      label: "Close button (screen readers)",
      help: "Not visible; read out by screen readers for the cross in the corner.",
      kind: "line",
      default: "Close",
    },
  },
});
