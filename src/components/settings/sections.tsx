import { LayoutGrid, Globe, Bot, ShieldCheck, Wrench, Cpu } from "lucide-react";

// Single source of truth for the settings categories — shared by the side-nav
// (client) and the overview hub (server), so they never drift. Kept in a plain
// (non-"use client") module so the server component imports the real array, not a
// client reference. Adding a category is a one-line change here.
export const SETTINGS_SECTIONS = [
  { href: "/settings", icon: LayoutGrid, key: "overview", descKey: "overviewDescription" },
  { href: "/settings/localization", icon: Globe, key: "navLocalization", descKey: "cardLocalizationDesc" },
  { href: "/settings/assistant", icon: Bot, key: "navAssistant", descKey: "cardAssistantDesc" },
  { href: "/settings/permissions", icon: ShieldCheck, key: "navPermissions", descKey: "cardPermissionsDesc" },
  { href: "/settings/ai-tools", icon: Wrench, key: "navAiTools", descKey: "cardAiToolsDesc" },
  { href: "/settings/models", icon: Cpu, key: "navModels", descKey: "cardModelsDesc" },
] as const;
