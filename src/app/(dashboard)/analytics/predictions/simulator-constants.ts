// Plain (non-"use server") module for values shared between the Server Action
// and the client simulator. A "use server" file may only export async functions,
// so runtime constants like these must live here — importing them from actions.ts
// into a Client Component would yield `undefined` on the client (→ ".map is not a
// function"). Types are erased and could live anywhere, but keeping them beside
// their source arrays keeps the two in sync.

export const SENIORITY_LEVELS = ["JUNIOR", "MID", "SENIOR", "LEAD"] as const;
export const URGENCY_LEVELS = ["NORMAL", "HIGH", "CRITICAL"] as const;

export type Seniority = (typeof SENIORITY_LEVELS)[number];
export type Urgency = (typeof URGENCY_LEVELS)[number];
