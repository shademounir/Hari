import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Bot,
  Users,
  CalendarDays,
  ClipboardCheck,
  UserMinus,
  BookOpen,
  BellRing,
  ScrollText,
  Gauge,
  Activity,
  BarChart3,
  FileText,
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
  | "team"
  | "hrActivity"
  | "predictions"
  | "analytics"
  | "teamAnalytics"
  | "engagement"
  | "timeOff"
  | "onboarding"
  | "offboarding"
  | "documents"
  | "knowledgeBase"
  | "alerts"
  | "audit"
  | "settings";

type SettingsKey = (typeof SETTINGS_SECTIONS)[number]["key"];

/**
 * A sub-item under a nav parent. `ns` says which i18n namespace resolves its
 * label — `nav` for feature children (Team Analytics, Predictions), `settings`
 * for the Settings sub-pages — so both can share one accordion structure.
 * `permission` gates the child independently of its parent.
 */
export type NavChild =
  | { href: string; ns: "nav"; key: NavKey; permission?: Permission }
  | { href: string; ns: "settings"; key: SettingsKey; permission?: Permission };

export type NavItem = {
  href: string;
  key: NavKey;
  icon: ComponentType<{ className?: string }>;
  permission?: Permission;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/chat", key: "assistant", icon: Bot },
  { href: "/directory", key: "directory", icon: Users },
  {
    href: "/team",
    key: "team",
    icon: Gauge,
    permission: "dashboard:read:team",
    children: [
      { href: "/team/analytics", ns: "nav", key: "teamAnalytics", permission: "analytics:team" },
      { href: "/team/engagement", ns: "nav", key: "engagement", permission: "engagement:read:team" },
    ],
  },
  { href: "/hr-activity", key: "hrActivity", icon: Activity, permission: "dashboard:read:company" },
  {
    href: "/analytics",
    key: "analytics",
    icon: BarChart3,
    permission: "analytics:full",
    children: [
      { href: "/analytics/predictions", ns: "nav", key: "predictions", permission: "dashboard:read:company" },
    ],
  },
  { href: "/time-off", key: "timeOff", icon: CalendarDays },
  { href: "/onboarding", key: "onboarding", icon: ClipboardCheck },
  { href: "/offboarding", key: "offboarding", icon: UserMinus, permission: "employee:manage" },
  { href: "/documents", key: "documents", icon: FileText, permission: "documents:request" },
  { href: "/kb", key: "knowledgeBase", icon: BookOpen },
  { href: "/alerts", key: "alerts", icon: BellRing, permission: "alerts:read" },
  { href: "/audit", key: "audit", icon: ScrollText, permission: "alerts:read" },
  {
    href: "/settings",
    key: "settings",
    icon: Settings,
    permission: "admin:settings",
    children: SETTINGS_SECTIONS.filter((s) => s.href !== "/settings").map((s) => ({
      href: s.href,
      ns: "settings" as const,
      key: s.key,
    })),
  },
];

// URL prefixes that exist only as structure — no page is served at them, because
// they only ever appear inside a longer path (/kb/admin/documents is reachable
// only as /kb/admin/documents/new or /kb/admin/documents/<id>). The breadcrumb
// renders these as plain text: linking them would walk the user into a 404.
// `tests/nav-items.test.ts` checks this against the real route tree, so adding a
// page here can't silently leave a crumb dead.
export const NON_ROUTE_PATHS: ReadonlySet<string> = new Set([
  "/kb/admin/collections",
  "/kb/admin/documents",
]);

// First path segment ("" for "/", "chat", "kb", "analytics" for a nested route …)
// → nav label key, for the breadcrumb. Uses the FIRST segment so nested routes
// (e.g. /analytics/predictions) resolve to their nav entry. Derived from
// NAV_ITEMS so it can never fall out of sync.
export const SEGMENT_TO_KEY: Record<string, NavKey> = Object.fromEntries(
  NAV_ITEMS.map((i) => [i.href === "/" ? "" : i.href.split("/")[1], i.key]),
) as Record<string, NavKey>;
