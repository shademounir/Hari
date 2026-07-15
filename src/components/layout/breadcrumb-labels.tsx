"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Real display names for the dynamic segments of a URL, keyed by the crumb's
 * own href — e.g. `{ "/kb/hr-internal": "HR Internal" }`.
 *
 * The top-bar breadcrumb lives in the dashboard layout, above every page, so all
 * it has to go on is the URL. A slug is a *lossy* encoding of a title: it can't
 * recover "&", accents, apostrophes or dropped words — "politiques-rh" is really
 * "Politiques RH", and "procedure-attestation-travail" is really "Procédure de
 * demande d'attestation de travail". Only the record knows. So a page that has
 * already loaded that record hands the real names up to the breadcrumb here,
 * and the breadcrumb prefers them over its humanized-slug fallback.
 */
type LabelMap = Record<string, string>;

const LabelContext = createContext<LabelMap>({});
const RegisterContext = createContext<(labels: LabelMap) => void>(() => {});

export function BreadcrumbLabelProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<LabelMap>({});

  // Merge-only, and bail out when nothing changed — pages re-register on every
  // navigation, and returning `prev` unchanged keeps that from looping.
  const register = useCallback((next: LabelMap) => {
    setLabels((prev) => {
      const changed = Object.keys(next).some((href) => prev[href] !== next[href]);
      return changed ? { ...prev, ...next } : prev;
    });
  }, []);

  return (
    <RegisterContext.Provider value={register}>
      <LabelContext.Provider value={labels}>{children}</LabelContext.Provider>
    </RegisterContext.Provider>
  );
}

export function useBreadcrumbLabels() {
  return useContext(LabelContext);
}

/**
 * Renders nothing — server pages mount it to teach the breadcrumb the real names
 * behind their dynamic segments.
 *
 * React renders a layout before its children, so a cold load still paints the
 * humanized-slug fallback first and this corrects it on hydration. That one-frame
 * correction is the price of keeping a single breadcrumb in the layout rather
 * than rebuilding one on every page; the fallback is always a readable
 * approximation of the same name, never a spinner or a blank.
 */
export function SetBreadcrumbLabels({ labels }: { labels: LabelMap }) {
  const register = useContext(RegisterContext);
  // Pages pass an object literal, so compare by value — not by identity — to keep
  // the effect from re-firing on every render.
  const json = JSON.stringify(labels);
  const stable = useMemo(() => JSON.parse(json) as LabelMap, [json]);
  useEffect(() => register(stable), [stable, register]);
  return null;
}
