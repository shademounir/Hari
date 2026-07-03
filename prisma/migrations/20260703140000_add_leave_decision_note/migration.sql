-- Approver note for a leave decision (mandatory on rejection). Nullable +
-- additive: no existing rows are affected. SCRUM-071 Increment B1.
ALTER TABLE "LeaveRequest" ADD COLUMN "decisionNote" TEXT;
