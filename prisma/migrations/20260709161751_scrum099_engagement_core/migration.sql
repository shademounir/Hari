-- SCRUM-099: engagement & burnout/boreout core. Purely additive — three enums,
-- one new AlertKind value, and four tables with their indexes/FKs. No existing
-- column is altered or dropped.

-- AlterEnum: add the engagement-risk alert kind.
ALTER TYPE "AlertKind" ADD VALUE 'ENGAGEMENT_RISK';

-- CreateEnum
CREATE TYPE "EngagementBand" AS ENUM ('GREEN', 'YELLOW', 'ORANGE', 'RED');

-- CreateEnum
CREATE TYPE "EngagementQuadrant" AS ENUM ('ENGAGED', 'BURNOUT', 'BOREOUT', 'STRAINED');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "EngagementSnapshot" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" "EngagementBand" NOT NULL,
    "exhaustion" INTEGER NOT NULL,
    "disengagement" INTEGER NOT NULL,
    "quadrant" "EngagementQuadrant" NOT NULL,
    "factors" JSONB NOT NULL,
    "momentum" DOUBLE PRECISION,
    "confidence" "Confidence" NOT NULL DEFAULT 'LOW',
    "dataCoverage" INTEGER NOT NULL,
    "weightVersion" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualitativeSignal" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "workQuality" INTEGER NOT NULL,
    "participation" INTEGER NOT NULL,
    "peerInteraction" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualitativeSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneOnOne" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneOnOne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementSignalConfig" (
    "id" TEXT NOT NULL,
    "version" SERIAL NOT NULL,
    "baseline" INTEGER NOT NULL DEFAULT 82,
    "weights" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementSignalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngagementSnapshot_employeeId_computedAt_idx" ON "EngagementSnapshot"("employeeId", "computedAt");

-- CreateIndex
CREATE INDEX "EngagementSnapshot_band_idx" ON "EngagementSnapshot"("band");

-- CreateIndex
CREATE INDEX "QualitativeSignal_employeeId_period_idx" ON "QualitativeSignal"("employeeId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "QualitativeSignal_employeeId_raterId_period_key" ON "QualitativeSignal"("employeeId", "raterId", "period");

-- CreateIndex
CREATE INDEX "OneOnOne_employeeId_heldAt_idx" ON "OneOnOne"("employeeId", "heldAt");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementSignalConfig_version_key" ON "EngagementSignalConfig"("version");

-- CreateIndex
CREATE INDEX "EngagementSignalConfig_active_idx" ON "EngagementSignalConfig"("active");

-- AddForeignKey
ALTER TABLE "EngagementSnapshot" ADD CONSTRAINT "EngagementSnapshot_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualitativeSignal" ADD CONSTRAINT "QualitativeSignal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
