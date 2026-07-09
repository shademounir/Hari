-- Predictive/turnover query indexes: the active-headcount count/groupBy, the
-- departure aggregates, and the manager risk scope all filter on these columns
-- every batch scoring pass. Without them they sequential-scan as history grows.
CREATE INDEX "Employee_status_department_idx" ON "Employee"("status", "department");
CREATE INDEX "Employee_leftAt_idx" ON "Employee"("leftAt");
CREATE INDEX "Employee_managerId_status_idx" ON "Employee"("managerId", "status");

-- Drop the accuracy-backtest column that shipped in add_predictive_analytics but was
-- never written or read (getModelAccuracy computes from the latest snapshot band).
-- It implied outcome-tracking existed when it did not.
ALTER TABLE "DepartureRiskSnapshot" DROP COLUMN "departedWithin90d";
