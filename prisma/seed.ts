import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { faker } from "@faker-js/faker";

import { seedFaq } from "./seed-faq";
import { seedVisits } from "./seed-visits";

import { prisma } from "~/db.server";
import { createUserViaAuth } from "~/features/auth/create-user.server";
import { ROLE_NAMES } from "~/features/auth/roles";
import { storeImage } from "~/features/images/image-storage.server";
import { createEvent } from "~/models/event.server";
import { createGalleryImagesForEvent } from "~/models/gallery.server";
import { UNOWNED_IMAGE_WHERE } from "~/models/image.server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seed() {
  const userEmail = "user@mokupona.ch";
  const moderatorEmail = "moderator@mokupona.ch";
  const adminEmail = "admin@mokupona.ch";

  await prisma.user.deleteMany().catch(() => {});

  await prisma.role.deleteMany().catch(() => {});

  await prisma.event.deleteMany().catch(() => {});

  await prisma.formSubmission.deleteMany().catch(() => {});

  await prisma.formVersion.deleteMany().catch(() => {});

  await prisma.form.deleteMany().catch(() => {});

  await prisma.address.deleteMany().catch(() => {});

  await prisma.eventResponse.deleteMany().catch(() => {});

  // the public hall of fame reads these, so they reseed like everything else
  await prisma.boardMember.deleteMany().catch(() => {});

  // Gallery links cascade with their event, but pool images belong to
  // nothing and would survive every reseed.
  await prisma.eventGalleryImage.deleteMany().catch(() => {
    /** */
  });

  await prisma.image
    .deleteMany({
      where: UNOWNED_IMAGE_WHERE,
    })
    .catch(() => {
      /** */
    });

  for (const role of ROLE_NAMES) {
    await prisma.role.create({ data: { name: role } });
  }

  await createUserViaAuth({
    email: userEmail,
    password: "mokupona",
    name: "demo user",
    roleName: "user",
    emailVerified: true,
  });

  const moderator = await createUserViaAuth({
    email: moderatorEmail,
    password: "mokupona",
    name: "demo moderator",
    roleName: "moderator",
    emailVerified: true,
  });

  await createUserViaAuth({
    email: adminEmail,
    password: "mokupona",
    name: "demo admin",
    roleName: "admin",
    emailVerified: true,
  });

  const address = await prisma.address.create({
    data: {
      streetName: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("####"),
      city: faker.location.city(),
    },
  });

  const defaultImage = await readFile(path.join(__dirname, "default.jpg"));

  // createEvent (not prisma.event.create) so every seeded event gets its
  // form + first version and its own cover image row, like production
  // writes; each event's cover is stored through the image provider (the
  // local one under dev/e2e — offline), one stored file per event so a
  // cover replacement can never orphan a sibling's file
  const seedEvent = async (date = faker.date.soon({ days: 3 })) =>
    createEvent({
      title: faker.lorem.sentence({ min: 3, max: 7 }),
      description: faker.lorem.paragraphs({ min: 3, max: 7 }),
      date,
      slots: faker.number.int({ min: 10, max: 20 }),
      price: faker.number.int({ min: 15, max: 30 }),
      image: {
        contentType: "image/jpeg",
        ...(await storeImage(
          new File([defaultImage], "default.jpg", { type: "image/jpeg" }),
          "dinners",
        )),
      },
      addressId: address.id,
      createdById: moderator.id,
    });

  const event = await seedEvent();
  await seedEvent();

  for (let i = 0; i < event.slots - 5; i++) {
    await prisma.eventResponse.create({
      data: {
        email: faker.internet.email(),
        phone: faker.phone.number(),
        name: faker.person.fullName(),
        eventId: event.id,
      },
    });
  }

  // The gallery only shows on dinners that already happened, so it needs one.
  const pastEvent = await seedEvent(faker.date.recent({ days: 45 }));

  // A back catalogue, so the past-dinners grid is developed against a realistic
  // number of rows rather than the single dinner the gallery needs. Spread over
  // past months so the newest-first ordering is visible.
  for (const monthsAgo of [3, 5, 8, 11, 14, 18, 23]) {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    await seedEvent(date);
  }

  const galleryVariants = [
    { width: 1200, height: 800 },
    { width: 800, height: 1200 },
    { width: 1000, height: 1000 },
    { width: 960, height: 1200 },
    { width: 1280, height: 720 },
  ];

  const galleryImageSvg = (
    label: string,
    width: number,
    height: number,
    hue: number,
  ) =>
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="${width}" height="${height}" fill="hsl(${hue} 45% 35%)"/>`,
      `<rect width="${width}" height="${Math.round(height / 2)}" fill="hsl(${hue} 50% 45%)"/>`,
      `<text x="50%" y="50%" fill="hsl(${hue} 30% 92%)" font-family="sans-serif" font-size="${Math.round(width / 8)}" text-anchor="middle" dominant-baseline="central">${label}</text>`,
      `</svg>`,
    ].join("");

  const galleryBlurDataUrl = (width: number, height: number, hue: number) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round((width / height) * 8)}" height="8"><rect width="100%" height="100%" fill="hsl(${hue} 45% 35%)"/></svg>`,
    )}`;

  const storeGalleryImages = async (count: number, caption: string) =>
    Promise.all(
      Array.from({ length: count }, async (_unused, index) => {
        const { width, height } =
          galleryVariants[index % galleryVariants.length];
        const hue = (index * 47) % 360;
        const svg = galleryImageSvg(`photo ${index + 1}`, width, height, hue);

        return {
          contentType: "image/svg+xml",
          // one stored file per row: sharing a storageKey would make any single
          // removal destroy the bytes out from under its siblings
          ...(await storeImage(
            new File([svg], `gallery-${index + 1}.svg`, {
              type: "image/svg+xml",
            }),
            "dinner-gallery",
          )),
          width,
          height,
          blurDataUrl: galleryBlurDataUrl(width, height, hue),
          altText: `${pastEvent.title} — photo ${index + 1}`,
          caption: index % 2 === 0 ? `${caption} ${index + 1}` : null,
        };
      }),
    );

  await createGalleryImagesForEvent(
    pastEvent.id,
    await storeGalleryImages(7, "hands and glasses, frame"),
  );

  await seedVisits({ upcomingDinnerId: event.id, pastDinnerId: pastEvent.id });

  // Volunteers for the public hall of fame. Portraits are flat SVG squares —
  // enough to exercise the grid without shipping photographs of real people.
  const portraitSvg = (initials: string, hue: number) =>
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">`,
      `<rect width="640" height="640" fill="hsl(${hue} 35% 78%)"/>`,
      `<circle cx="320" cy="250" r="110" fill="hsl(${hue} 30% 88%)"/>`,
      `<rect x="140" y="400" width="360" height="300" rx="180" fill="hsl(${hue} 30% 88%)"/>`,
      `<text x="50%" y="52%" fill="hsl(${hue} 40% 30%)" font-family="sans-serif" font-size="120" text-anchor="middle" dominant-baseline="central">${initials}</text>`,
      `</svg>`,
    ].join("");

  const volunteers = [
    { name: "Aina Bergström", position: "head chef" },
    { name: "Tomás Oliveira", position: "sous chef" },
    { name: "Mira Haddad", position: "front of house" },
    { name: "Jonas Frei", position: "wine & drinks" },
    { name: "Lena Vogt", position: "photography" },
    { name: "Ravi Chandran", position: "treasurer" },
  ];

  // sequential, not Promise.all: the hall of fame orders by createdAt, and
  // parallel writes would land in the same millisecond in arbitrary order
  for (const [index, volunteer] of volunteers.entries()) {
    const initials = volunteer.name
      .split(" ")
      .map((part) => part[0])
      .join("");
    const svg = portraitSvg(initials, (index * 61) % 360);

    await prisma.boardMember.create({
      data: {
        name: volunteer.name,
        position: volunteer.position,
        image: {
          create: {
            contentType: "image/svg+xml",
            ...(await storeImage(
              new File([svg], `board-member-${index + 1}.svg`, {
                type: "image/svg+xml",
              }),
              "board-members",
            )),
            width: 640,
            height: 640,
            altText: volunteer.name,
          },
        },
      },
    });
  }

  await seedFaq();

  console.log(`Database has been seeded. 🌱`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
