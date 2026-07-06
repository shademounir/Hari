-- Track who resolved an alert, distinctly from who acknowledged it (`ackById`),
-- so the /alerts audit can show "resolved by X" without conflating the two.
-- SetNull keeps the alert if that user is later deleted.

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "resolvedById" TEXT;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
