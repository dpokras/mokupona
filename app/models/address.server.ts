import type { Address } from "#prisma/generated/client";

import { prisma } from "~/db.server";
import { requestLogger } from "~/logger/request-context.server";

export type { Address } from "#prisma/generated/client";

export async function countAddresses(): Promise<number> {
  return prisma.address.count();
}

export async function getAddresses(): Promise<Address[]> {
  return prisma.address.findMany();
}

export async function getAddressesWithEventCount(): Promise<
  (Address & { eventCount: number })[]
> {
  const addresses = await prisma.address.findMany({
    include: { _count: { select: { events: true } } },
  });

  return addresses.map(({ _count, ...address }) => ({
    ...address,
    eventCount: _count.events,
  }));
}

export async function getAddressById(id: string) {
  return prisma.address.findUnique({ where: { id } });
}

export async function createAddress({
  streetName,
  houseNumber,
  zip,
  city,
}: {
  streetName: string;
  houseNumber: string;
  zip: string;
  city: string;
}) {
  return prisma.address.create({
    data: {
      streetName,
      houseNumber,
      zip,
      city,
    },
  });
}

export async function updateAddress(
  id: string,
  {
    streetName,
    houseNumber,
    zip,
    city,
  }: {
    streetName: string;
    houseNumber: string;
    zip: string;
    city: string;
  },
) {
  return prisma.address.update({
    where: { id },
    data: {
      streetName,
      houseNumber,
      zip,
      city,
    },
  });
}

/** Null when the address is gone already or dinners still point at it. */
export async function deleteAddress(id: string): Promise<Address | null> {
  return prisma.$transaction(async (tx) => {
    const address = await tx.address.findUnique({ where: { id } });
    if (!address) return null;

    const inUse = await tx.event.count({ where: { addressId: id } });
    if (inUse > 0) {
      requestLogger.warn(
        { addressId: id, reason: { dinnersUsingAddress: inUse } },
        "Refused to delete an address dinners still point at",
      );
      return null;
    }

    return tx.address.delete({ where: { id } });
  });
}
