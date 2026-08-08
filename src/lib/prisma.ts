import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Enable WAL journaling and set busy timeout so the MCP server and web app
  // can safely share the same SQLite database without SQLITE_BUSY errors.
  client.$connect().then(() => {
    client.$queryRawUnsafe("PRAGMA journal_mode=WAL");
    client.$queryRawUnsafe("PRAGMA busy_timeout=5000");
    client.$queryRawUnsafe("PRAGMA foreign_keys=ON");
  }).catch((err) => {
    console.error("Failed to configure SQLite PRAGMAs:", err);
  });

  return client;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
