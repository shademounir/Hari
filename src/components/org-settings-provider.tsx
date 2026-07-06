"use client";

import { createContext, useContext } from "react";
import type { OrgSettingsValues } from "@/lib/settings";

// Makes the org's currency/timezone available to client components (the chat
// generative cards) without threading them through every tool payload. The
// dashboard layout fetches the settings on the server and feeds this provider.
const OrgSettingsContext = createContext<OrgSettingsValues | null>(null);

export function OrgSettingsProvider({
  value,
  children,
}: {
  value: OrgSettingsValues;
  children: React.ReactNode;
}) {
  return (
    <OrgSettingsContext.Provider value={value}>{children}</OrgSettingsContext.Provider>
  );
}

export function useOrgSettings(): OrgSettingsValues {
  const ctx = useContext(OrgSettingsContext);
  if (!ctx) {
    throw new Error("useOrgSettings must be used within an OrgSettingsProvider");
  }
  return ctx;
}
