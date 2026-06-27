// Leave type/status come from the DB as fixed enums. These narrow the string to
// the translation-key union so the type-safe `t()` accepts them — one shared
// place rather than an inline cast at each call site.
export type LeaveType = "VACATION" | "SICK" | "PERSONAL";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

export const asLeaveType = (s: string) => s as LeaveType;
export const asLeaveStatus = (s: string) => s as LeaveStatus;
