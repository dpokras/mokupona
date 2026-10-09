import { prisma } from "~/db.server";
import { STARTER_FAQ_QUESTIONS } from "~/features/faq/starter-questions";
import { createFaqEntriesIfEmpty } from "~/models/faq.server";

/** The starter questions, published, plus one hidden to show the draft state. */
export async function seedFaq() {
  await prisma.faqEntry.deleteMany();

  await createFaqEntriesIfEmpty([
    ...STARTER_FAQ_QUESTIONS.map((entry) => ({ ...entry, published: true })),
    {
      question: "do you do private dinners or events?",
      answer:
        "not yet. if you have something in mind, write to us at mokuponadinnerclub@gmail.com and we'll see what we can do.",
      published: false,
    },
  ]);
}
