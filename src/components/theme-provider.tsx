"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// Thin wrapper so the root layout (a Server Component) can mount next-themes,
// which must run on the client. Theme is stored in localStorage and applied as a
// `class` on <html> (light / dark / system) — the tokens live in globals.css.
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
