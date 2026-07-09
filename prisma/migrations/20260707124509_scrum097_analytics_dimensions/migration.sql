-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CDI', 'CDD', 'ALTERNANCE', 'STAGE');

-- CreateEnum
CREATE TYPE "DepartureReason" AS ENUM ('VOLUNTARY', 'INVOLUNTARY', 'RETIREMENT', 'END_OF_CONTRACT');

-- Note: Prisma's diff also emitted DROP INDEX on the halfvec/tsvector indexes and
-- an ALTER on the generated `contentTsv` column, because it can't model those
-- `Unsupported` columns. Those statements are removed by hand — they would drop
-- the HNSW + GIN indexes and break the generated column. (See CLAUDE.md / 0_init.)

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "contractType" "ContractType" NOT NULL DEFAULT 'CDI',
ADD COLUMN     "departureReason" "DepartureReason",
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "terminationDate" TIMESTAMP(3),
ADD COLUMN     "timeToHireDays" INTEGER;

-- CreateTable
CREATE TABLE "PayrollSnapshot" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "grossAmount" INTEGER NOT NULL,

    CONSTRAINT "PayrollSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "conductedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollSnapshot_month_idx" ON "PayrollSnapshot"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSnapshot_employeeId_month_key" ON "PayrollSnapshot"("employeeId", "month");

-- CreateIndex
CREATE INDEX "PerformanceReview_employeeId_idx" ON "PerformanceReview"("employeeId");

-- CreateIndex
CREATE INDEX "PerformanceReview_conductedAt_idx" ON "PerformanceReview"("conductedAt");

-- AddForeignKey
ALTER TABLE "PayrollSnapshot" ADD CONSTRAINT "PayrollSnapshot_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
