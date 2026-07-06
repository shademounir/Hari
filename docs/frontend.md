# Frontend & UI guide

How the UI is put together, so several people can build pages that look and behave
the same without coordinating on every detail.

## Stack

- **Next.js 16** (App Router, React 19). Pages are Server Components by default;
  anything interactive is a Client Component marked `"use client"`.
- **Tailwind v4** — configured in CSS (`src/app/globals.css`), no `tailwind.config`.
- **shadcn/ui** (`base-nova` style) — copied into `src/components/ui`. These
  components are built on **Base UI** (`@base-ui/react`), not Radix. Practical
  difference: composition uses a `render` prop, not `asChild`.
- **next-themes** for light / dark / system, applied as a `class` on `<html>`.
- **next-intl** for English / French — every user-facing string goes through a
  translation key, never a hardcoded literal. See [`docs/i18n.md`](./i18n.md).
- **lucide-react** for icons.

## Theming and color

All color is driven by CSS variables (shadcn's neutral palette) defined twice in
`globals.css`: once under `:root` (light) and once under `.dark`. `next-themes`
toggles the `.dark` class; the `ThemeProvider` is mounted in `src/app/layout.tsx`
and the picker lives in `src/components/theme-toggle.tsx`.

**Use the semantic tokens, never raw colors.** Reach for `bg-background`,
`text-foreground`, `bg-card`, `text-muted-foreground`, `border`, `bg-primary`,
`text-primary-foreground`, `bg-destructive`, and so on. A component built only from
tokens works in both themes for free. Avoid `bg-white`, `text-black`,
`text-gray-500`, or hex values; those break in dark mode. If you need a new color
role, add a token to both `:root` and `.dark` rather than hardcoding.

## Components

- **`src/components/ui/`** — shadcn primitives (button, card, table, dropdown,
  sheet, …). Treat these as vendored: prefer composing them over editing them. Add
  a new one with the CLI so it matches the configured style:

  ```bash
  npx shadcn@latest add <name>
  ```

- **`src/components/`** — app components built from those primitives
  (`layout/sidebar.tsx`, `layout/page-header.tsx`, `chat/**`). This is where
  feature UI goes.
- **`src/components/chat/generative/`** — the cards the assistant renders for tool
  results (directory, leave, payslip, citations).

## Layout

The dashboard shell is `src/app/(dashboard)/layout.tsx`:

- **Desktop (`md+`)** — a fixed 16rem `Sidebar` rail on the left.
- **Mobile (`< md`)** — the sidebar is hidden and a top bar (`MobileNav`) shows a
  hamburger that opens the same nav in a left sheet. Both share one `NavBody`, so
  the nav is defined once.
- Every page starts with `<PageHeader title=… description=… />` for a consistent
  title row, then its content.

## Conventions for a new page

- Wrap content padding responsively: `p-4 md:p-8` (the header does the same). Don't
  hardcode `p-8` alone; it's cramped on phones.
- Put wide content (tables, code blocks, diagrams) in an `overflow-x-auto`
  container so the page itself never scrolls sideways.
- Gate anything role-specific with `can(role, …)` from `lib/rbac.ts` on the server.
  The sidebar already hides links a role can't use.
- **No hardcoded user-facing text.** Every label, placeholder, and `aria-label` goes
  through a translation key in `messages/{en,fr}.json` via `t("…")`. See
  [`docs/i18n.md`](./i18n.md).

## Accessibility floor

Every screen should clear this bar; it's cheap if you start with it.

- **Keyboard** — interactive elements are reachable and show a visible focus ring
  (the shadcn primitives do this; don't remove `outline`/`ring`). The shell has a
  "Skip to content" link targeting `#main`.
- **Names** — icon-only buttons need an `aria-label` (see the theme toggle and the
  mobile hamburger). The active nav link sets `aria-current="page"`.
- **Motion** — `globals.css` disables animation and smooth scroll under
  `prefers-reduced-motion: reduce`. Don't reintroduce motion that ignores it.
- **Contrast** — using the tokens keeps text/background contrast adequate in both
  themes. Check any custom color against its background.

## Checklist before opening a UI PR

- [ ] Looks right in **light and dark** (use the toggle).
- [ ] Works at a **narrow width** (~375px) and at desktop; no horizontal page scroll.
- [ ] Colors come from tokens, not raw `white`/`black`/`gray`/hex.
- [ ] Keyboard-only: can reach and operate every control; focus is visible.
- [ ] No hardcoded copy — strings are translation keys present in **both** `en.json` and `fr.json`; checked in **English and French**.
- [ ] Icon-only controls have an `aria-label`.
- [ ] `npm run lint` and `npx tsc --noEmit` are clean.
