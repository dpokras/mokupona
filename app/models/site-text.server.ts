import { prisma } from "~/db.server";

export async function listSiteTextOverrides(): Promise<
  { key: string; value: string }[]
> {
  return prisma.siteText.findMany({ select: { key: true, value: true } });
}

/**
 * Applies one category's edits in a single transaction: `set` upserts an
 * override, `clear` removes it so the code default shows again.
 */
export async function saveSiteTextOverrides({
  set,
  clear,
}: {
  set: { key: string; value: string }[];
  clear: string[];
}): Promise<void> {
  await prisma.$transaction([
    prisma.siteText.deleteMany({ where: { key: { in: clear } } }),
    ...set.map(({ key, value }) =>
      prisma.siteText.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      }),
    ),
  ]);
}
