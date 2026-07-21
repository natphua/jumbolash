/**
 * prisma/seed.ts
 *
 * Populates the Prompt table with default game questions.
 *
 * Created on 2026-07-20 by Natalie Phua.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const prompts = [
  { text: "The worst class to take your last semester of senior year." },
  { text: "Best name for a startup founded by Tufts students." },
  { text: "Three words to describe CS are..." },
  { text: "I didn't use AI! I just ____" },
  { text: "Last three words of a prompt to Claude" },
  { text: "Yeah, I go to Tufts. I do ___" },
  { text: "The real reason the code worked on the first try." },
  { text: "A comment line in code that screams 'I was up until 4 AM'." },
  { text: "What actually happens during a Zoom breakout room." },
  { text: "Worst thing to hear your professor say right before an exam." },
  { text: "An alternate name for git push --force." },
  { text: "The most absurd reason a pull request was rejected." },
  { text: "What CS majors actually do when they say they are 'networking'." },
  { text: "The worst item to bring to a 24-hour hackathon." },
  { text: "A terrible excuse for failing a unit test." },
];

async function main() {
  console.log("Starting prompt database seed...");

  for (const prompt of prompts) {
    await prisma.prompt.create({
      data: prompt,
    });
  }

  console.log(`Successfully seeded ${prompts.length} prompts!`);
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
