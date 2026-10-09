import { defineTextCategory } from "../types";

export const impressumTexts = defineTextCategory({
  title: "Impressum",
  description:
    "The legal notice at /impressum. Swiss law (Art. 3 UWG) expects the name, postal address and email address of whoever runs the website, so keep those current.",
  scope: "route",
  entries: {
    eyebrow: {
      group: "Page header",
      label: "Small line above the title",
      kind: "line",
      default: "legal notice",
    },
    title: {
      group: "Page header",
      label: "Title",
      kind: "line",
      default: "impressum",
    },
    intro: {
      group: "Page header",
      label: "Intro",
      help: "The short text under the title. Leave empty to hide it.",
      kind: "paragraph",
      optional: true,
      default: "who runs this website and how to reach us.",
    },

    operatorHeading: {
      group: "Who runs the website",
      label: "Heading",
      kind: "line",
      default: "who runs this website",
    },
    organisationName: {
      group: "Who runs the website",
      label: "Name of the association",
      kind: "line",
      default: "moku pona",
    },
    street: {
      group: "Who runs the website",
      label: "Street and number",
      kind: "line",
      default: "Regensbergstrasse 24",
    },
    postcodeCity: {
      group: "Who runs the website",
      label: "Postcode and city",
      kind: "line",
      default: "8050 Zürich",
    },
    country: {
      group: "Who runs the website",
      label: "Country",
      kind: "line",
      default: "Switzerland",
    },
    responsiblePersonLabel: {
      group: "Who runs the website",
      label: "Responsible person: label",
      kind: "line",
      default: "responsible person",
    },
    responsiblePerson: {
      group: "Who runs the website",
      label: "Responsible person: name",
      help: "The person answerable for the website, for example the president of the association. Leave empty to hide the line.",
      kind: "line",
      optional: true,
      default: "",
    },
    uidLabel: {
      group: "Who runs the website",
      label: "Company number: label",
      kind: "line",
      default: "company number (UID)",
    },
    uid: {
      group: "Who runs the website",
      label: "Company number: value",
      help: "The UID, like CHE-123.456.789, if the association is in the commercial register. Leave empty to hide the line.",
      kind: "line",
      optional: true,
      default: "",
    },

    contactHeading: {
      group: "Contact",
      label: "Heading",
      kind: "line",
      default: "contact",
    },
    emailLabel: {
      group: "Contact",
      label: "Email: label",
      kind: "line",
      default: "email",
    },
    email: {
      group: "Contact",
      label: "Email address",
      help: "Required by law. Messages to this address should reach someone who reads them.",
      kind: "line",
      default: "mokuponadinnerclub@gmail.com",
    },
    websiteLabel: {
      group: "Contact",
      label: "Website: label",
      kind: "line",
      default: "website",
    },
    website: {
      group: "Contact",
      label: "Website address",
      help: "Leave empty to hide the line.",
      kind: "line",
      optional: true,
      default: "https://mokupona.ch",
    },

    additionalInfo: {
      group: "Additional information",
      label: "Text",
      help: "Disclaimers and notes below the contact details. Leave empty to hide it.",
      kind: "rich",
      optional: true,
      default: [
        "## liability for content",
        "we put care into everything on this website, but we can't promise that it is complete, correct or up to date. details such as dates, menus and prices can change, and the dinner page always has the latest.",
        "",
        "## external links",
        "this website links to other websites we have no control over. their operators are responsible for what they publish, and we accept no liability for it.",
        "",
        "## copyright",
        "the texts and photos on this website belong to moku pona or to the people who made them. please ask us before you use them anywhere else.",
      ].join("\n"),
    },

    metaTitle: {
      group: "Search engines and browser tab",
      label: "Page title",
      help: "Shown in the browser tab and in search results.",
      kind: "line",
      default: "Impressum",
    },
    metaDescription: {
      group: "Search engines and browser tab",
      label: "Description",
      help: "The short summary search engines show under the title.",
      kind: "line",
      default:
        "Legal notice for the moku pona website: who runs it and how to reach us.",
    },
  },
});
