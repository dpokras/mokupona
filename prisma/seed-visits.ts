import { faker } from "@faker-js/faker";

import { prisma } from "~/db.server";
import { addDays, zurichDay } from "~/features/visits/visit-day";

const DAYS = 60;

const REFERRERS = [
  { value: "instagram.com", weight: 8 },
  { value: "google.com", weight: 6 },
  { value: "l.instagram.com", weight: 2 },
  { value: "duckduckgo.com", weight: 1 },
  { value: "facebook.com", weight: 1 },
  { value: "linkedin.com", weight: 1 },
];

const DEVICES = [
  { value: "mobile", weight: 6 },
  { value: "desktop", weight: 3 },
  { value: "tablet", weight: 1 },
];

export async function seedVisits({
  upcomingDinnerId,
  pastDinnerId,
}: {
  upcomingDinnerId: string;
  pastDinnerId: string;
}) {
  await prisma.pageView.deleteMany();
  await prisma.visitSalt.deleteMany();

  const pages = [
    { value: "/", weight: 10 },
    { value: "/dinners", weight: 8 },
    { value: `/dinners/${upcomingDinnerId}`, weight: 7 },
    { value: `/dinners/${pastDinnerId}`, weight: 2 },
    { value: `/dinners/${pastDinnerId}/gallery`, weight: 3 },
    { value: "/gallery", weight: 4 },
    { value: "/about", weight: 3 },
    { value: "/faq", weight: 2 },
  ];

  const today = zurichDay(new Date());
  const rows = [];

  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    const day = addDays(today, -daysAgo);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const busy = weekday === 0 || weekday === 6 || daysAgo < 10;
    const visitors = faker.number.int({ min: busy ? 2 : 1, max: busy ? 7 : 4 });

    for (let visitor = 0; visitor < visitors; visitor++) {
      const visitorId = faker.string.hexadecimal({
        length: 16,
        casing: "lower",
        prefix: "",
      });
      const device = faker.helpers.weightedArrayElement(DEVICES);
      const referrer = faker.datatype.boolean(0.45)
        ? faker.helpers.weightedArrayElement(REFERRERS)
        : null;
      const views = faker.number.int({ min: 1, max: 4 });

      for (let view = 0; view < views; view++) {
        rows.push({
          day,
          path: faker.helpers.weightedArrayElement(pages),
          referrer: view === 0 ? referrer : null,
          visitorId,
          device,
        });
      }
    }
  }

  await prisma.pageView.createMany({ data: rows });
}
