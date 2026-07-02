import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Bot,
  Users,
  CalendarDays,
  BookOpen,
  Settings,
} from "lucide-react";
import type { Permission } from "@/lib/rbac";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";

// Single source of truth for the primary navigation — consumed by the sidebar
// rail + mobile sheet (`NavBody`), the ⌘K command palette (`CommandSearch`), and
// the top-bar breadcrumb (`Topbar`), so the three never drift. Kept in a plain
// (non-"use client") module so server and client callers share one array.

export type NavKey =
  | "dashboard"
  | "assistant"
  | "directory"
  | "timeOff"
  | "knowledgeBase"
  | "settings";

export type NavItem = {
  href: string;
  key: NavKey;
  icon: ComponentType<{ className?: string }>;
  permission?: Permission;
  children?: { href: string; labelKey: (typeof SETTINGS_SECTIONS)[number]["key"] }[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/chat", key: "assistant", icon: Bot },
  { href: "/directory", key: "directory", icon: Users },
  { href: "/time-off", key: "timeOff", icon: CalendarDays },
  { href: "/kb", key: "knowledgeBase", icon: BookOpen },
  {
    href: "/settings",
    key: "settings",
    icon: Settings,
    permission: "admin:settings",
    children: SETTINGS_SECTIONS.filter((s) => s.href !== "/settings").map((s) => ({
      href: s.href,
      labelKey: s.key,
    })),
  },
];

// First path segment ("" for "/", "chat", "kb", …) → nav label key, for the
// breadcrumb. Derived from NAV_ITEMS so it can never fall out of sync.
export const SEGMENT_TO_KEY: Record<string, NavKey> = Object.fromEntries(
  NAV_ITEMS.map((i) => [i.href === "/" ? "" : i.href.slice(1), i.key]),
) as Record<string, NavKey>;
