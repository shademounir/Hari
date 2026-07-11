"use client";

import { useEffect, useRef } from "react";
import { logAuditConsoleViewAction } from "./actions";

// SCRUM-100 — logs one AUDIT_CONSOLE_VIEWED per real page mount (useEffect never
// runs during prefetch/SSR), so navigations that actually open the console are
// recorded without spamming the trail. The ref guards React 18 double-invoke in
// development strict mode.
export function AuditViewLogger({ filter }: { filter: string | null }) {
  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    void logAuditConsoleViewAction(filter);
  }, [filter]);
  return null;
}
