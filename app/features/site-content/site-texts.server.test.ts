import { afterEach, describe, expect, it } from "vitest";

import {
  getEditableCategory,
  getServerText,
  loadRootSiteTexts,
  saveCategoryTexts,
} from "./site-texts.server";

import { prisma } from "~/db.server";

afterEach(async () => {
  await saveCategoryTexts("global", {
    tagline: "made with love in zürich",
    joinButton: "join a dinner",
  });
});

describe("site texts", () => {
  it("serves defaults until an admin overrides them", async () => {
    const texts = await loadRootSiteTexts();
    expect(texts["global.joinButton"]).toBe("join a dinner");
  });

  it("stores only real changes and shows them right away", async () => {
    const { changed } = await saveCategoryTexts("global", {
      joinButton: "  book a seat \r\n",
      tagline: "made with love in zürich",
    });

    expect(changed).toBe(1);
    expect((await loadRootSiteTexts())["global.joinButton"]).toBe(
      "book a seat",
    );
    expect(await getServerText("global.joinButton")).toBe("book a seat");
    expect(
      await prisma.siteText.findMany({
        where: { key: { startsWith: "global." } },
      }),
    ).toHaveLength(1);

    const editable = await getEditableCategory("global");
    expect(editable.find((text) => text.key === "joinButton")).toMatchObject({
      value: "book a seat",
      isCustomized: true,
    });
  });

  it("drops the override when the default text is saved again", async () => {
    await saveCategoryTexts("global", { joinButton: "book a seat" });
    await saveCategoryTexts("global", { joinButton: "join a dinner" });

    expect(
      await prisma.siteText.count({ where: { key: "global.joinButton" } }),
    ).toBe(0);
    expect((await loadRootSiteTexts())["global.joinButton"]).toBe(
      "join a dinner",
    );
  });
});
