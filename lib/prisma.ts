/**
 * prisma.ts
 *
 * Instantiates and exports a single, global instance of the Prisma Client.
 * Leverages the PrismaPg driver adapter to connect PostgreSQL in Prisma 7.
 *
 * Created on 2026-07-15 by Natalie Phua.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prismaInstance: PrismaClient;

if (globalForPrisma.prisma) {
  prismaInstance = globalForPrisma.prisma;
} else {
  // 1. Establish a connection pool using your environment credentials
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // 2. Bind the pool instance to the Prisma 7 Postgres Adapter
  const adapter = new PrismaPg(pool);

  // 3. Instantiate the client with the adapter configuration
  prismaInstance = new PrismaClient({
    adapter,
    log: ["query"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaInstance;
  }
}

export const prisma = prismaInstance;
