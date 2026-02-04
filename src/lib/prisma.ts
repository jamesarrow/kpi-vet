import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// В serverless (Vercel) инстансы функций часто "прогреваются".
// Держим PrismaClient в global, чтобы переиспользовать соединение и ускорить запросы.
export const prisma = global.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

global.prisma = prisma;
