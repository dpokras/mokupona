import type {
  Event,
  FormSubmission,
  FormVersion,
  Prisma,
} from "#prisma/generated/client";

import { prisma } from "~/db.server";

export class FormVersionChangedError extends Error {
  constructor() {
    super("The form version changed while the submission was being written");
    this.name = "FormVersionChangedError";
  }
}

export async function createFormSubmission({
  formVersionId,
  answers: rawAnswers,
  expectedVersionUpdatedAt,
}: {
  formVersionId: string;
  answers: Record<string, unknown>;
  expectedVersionUpdatedAt?: Date;
}) {
  const answers = rawAnswers as Prisma.InputJsonValue;

  if (expectedVersionUpdatedAt === undefined) {
    return prisma.formSubmission.create({
      data: { formVersionId, answers },
    });
  }

  return prisma.$transaction(async (tx) => {
    const version = await tx.formVersion.findUniqueOrThrow({
      where: { id: formVersionId },
      select: { updatedAt: true },
    });

    if (version.updatedAt.getTime() !== expectedVersionUpdatedAt.getTime()) {
      throw new FormVersionChangedError();
    }

    return tx.formSubmission.create({
      data: { formVersionId, answers },
    });
  });
}

export async function getFormSubmissionAnswersByEvent(eventIds: string[]) {
  return prisma.formSubmission.findMany({
    where: { formVersion: { form: { event: { id: { in: eventIds } } } } },
    select: {
      answers: true,
      formVersion: {
        select: { form: { select: { event: { select: { id: true } } } } },
      },
    },
  });
}

export async function getFormSubmissionsForEvent(eventId: string) {
  return prisma.formSubmission.findMany({
    where: { formVersion: { form: { event: { id: eventId } } } },
    include: { formVersion: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAllFormSubmissionsWithEvent(): Promise<
  (FormSubmission & {
    formVersion: FormVersion;
    event: Pick<Event, "id" | "title" | "date">;
  })[]
> {
  const submissions = await prisma.formSubmission.findMany({
    where: { formVersion: { form: { event: { isNot: null } } } },
    include: {
      formVersion: {
        include: {
          form: {
            select: {
              event: { select: { id: true, title: true, date: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return submissions.flatMap(
    ({ formVersion: { form, ...formVersion }, ...submission }) =>
      form.event ? [{ ...submission, formVersion, event: form.event }] : [],
  );
}
