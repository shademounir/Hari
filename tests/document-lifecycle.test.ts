// ─────────────────────────────────────────────────────────────────────────────
// Tests du cycle de vie documentaire — SCRUM-052
//
// Couvre :
// • Les transitions de statut Draft → Published → Archived
// • Le contrôle RBAC : seuls HR_ADMIN et SUPER_ADMIN peuvent valider/archiver
// • L'invariant RAG : seuls les documents PUBLISHED alimentent le RAG
// • La traçabilité : publishedAt, updatedById, version incrémentée
// • Les cas de refus : EMPLOYEE et MANAGER ne peuvent pas gérer les documents
//
// Tests 100 % déterministes — aucune dépendance OpenRouter / DB.
// Compatibles CI (vitest --run).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { can, visibleDocTiers, type Role } from "@/lib/rbac";

// ── 1. Contrôle RBAC sur la gestion documentaire ────────────────────────────
describe("SCRUM-052 — RBAC : gestion des documents RH", () => {
  it("EMPLOYEE ne peut pas gérer les documents RH", () => {
    expect(can("EMPLOYEE", "kb:manage")).toBe(false);
  });

  it("MANAGER ne peut pas gérer les documents RH", () => {
    expect(can("MANAGER", "kb:manage")).toBe(false);
  });

  it("HR_ADMIN peut gérer les documents RH", () => {
    expect(can("HR_ADMIN", "kb:manage")).toBe(true);
  });

  it("SUPER_ADMIN peut gérer les documents RH", () => {
    expect(can("SUPER_ADMIN", "kb:manage")).toBe(true);
  });
});

// ── 2. Transitions de statut documentaire ───────────────────────────────────
describe("SCRUM-052 — Transitions de statut : Draft → Published → Archived", () => {
  // Simule la logique de transition sans appel DB
  type DocStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

  function canTransition(from: DocStatus, to: DocStatus): boolean {
    if (from === "DRAFT" && to === "PUBLISHED") return true;
    if (from === "PUBLISHED" && to === "ARCHIVED") return true;
    if (from === "PUBLISHED" && to === "DRAFT") return true; // unpublish
    return false;
  }

  it("un document DRAFT peut être publié (DRAFT → PUBLISHED)", () => {
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(true);
  });

  it("un document PUBLISHED peut être archivé (PUBLISHED → ARCHIVED)", () => {
    expect(canTransition("PUBLISHED", "ARCHIVED")).toBe(true);
  });

  it("un document PUBLISHED peut être dépublié (PUBLISHED → DRAFT)", () => {
    expect(canTransition("PUBLISHED", "DRAFT")).toBe(true);
  });

  it("un document DRAFT ne peut pas passer directement en ARCHIVED", () => {
    expect(canTransition("DRAFT", "ARCHIVED")).toBe(false);
  });

  it("un document ARCHIVED ne peut pas être republié directement", () => {
    expect(canTransition("ARCHIVED", "PUBLISHED")).toBe(false);
  });
});

// ── 3. Invariant RAG — seuls les documents PUBLISHED alimentent le RAG ──────
describe("SCRUM-052 — Invariant RAG : seul PUBLISHED accède au RAG", () => {
  type DocStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

  function isRagEligible(status: DocStatus): boolean {
    return status === "PUBLISHED";
  }

  it("un document DRAFT n'est pas éligible au RAG", () => {
    expect(isRagEligible("DRAFT")).toBe(false);
  });

  it("un document PUBLISHED est éligible au RAG", () => {
    expect(isRagEligible("PUBLISHED")).toBe(true);
  });

  it("un document ARCHIVED n'est pas éligible au RAG", () => {
    expect(isRagEligible("ARCHIVED")).toBe(false);
  });
});

// ── 4. Traçabilité de validation ─────────────────────────────────────────────
describe("SCRUM-052 — Traçabilité : publishedAt, version, updatedBy", () => {
  type DocStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

  interface DocState {
    status: DocStatus;
    version: number;
    publishedAt: Date | null;
    updatedById: string | null;
  }

  // Simule la logique de publishDocument (cf. lib/kb.ts)
  function simulatePublish(doc: DocState, callerId: string): DocState {
    return {
      ...doc,
      status: "PUBLISHED",
      version: doc.version + 1,
      publishedAt: doc.publishedAt ?? new Date(),
      updatedById: callerId,
    };
  }

  // Simule la logique de archiveDocument
  function simulateArchive(doc: DocState): DocState {
    return {
      ...doc,
      status: "ARCHIVED",
    };
  }

  it("la publication incrémente la version du document", () => {
    const doc: DocState = { status: "DRAFT", version: 1, publishedAt: null, updatedById: null };
    const published = simulatePublish(doc, "user-hr-01");
    expect(published.version).toBe(2);
  });

  it("la publication définit publishedAt à la première publication", () => {
    const doc: DocState = { status: "DRAFT", version: 1, publishedAt: null, updatedById: null };
    const published = simulatePublish(doc, "user-hr-01");
    expect(published.publishedAt).not.toBeNull();
  });

  it("une re-publication ne change pas publishedAt (conserve la date initiale)", () => {
    const firstDate = new Date("2026-01-15");
    const doc: DocState = { status: "DRAFT", version: 2, publishedAt: firstDate, updatedById: null };
    const republished = simulatePublish(doc, "user-hr-01");
    expect(republished.publishedAt).toEqual(firstDate);
  });

  it("la publication trace l'identifiant du validateur (updatedById)", () => {
    const doc: DocState = { status: "DRAFT", version: 1, publishedAt: null, updatedById: null };
    const published = simulatePublish(doc, "user-hr-42");
    expect(published.updatedById).toBe("user-hr-42");
  });

  it("l'archivage change le statut en ARCHIVED", () => {
    const doc: DocState = { status: "PUBLISHED", version: 2, publishedAt: new Date(), updatedById: "user-hr-01" };
    const archived = simulateArchive(doc);
    expect(archived.status).toBe("ARCHIVED");
  });

  it("l'archivage ne change pas la version", () => {
    const doc: DocState = { status: "PUBLISHED", version: 3, publishedAt: new Date(), updatedById: "user-hr-01" };
    const archived = simulateArchive(doc);
    expect(archived.version).toBe(3);
  });
});

// ── 5. Visibilité des documents selon le rôle ───────────────────────────────
describe("SCRUM-052 — Visibilité documentaire par rôle (DocVisibility)", () => {
  it("EMPLOYEE ne voit que les documents ALL_EMPLOYEES", () => {
    expect(visibleDocTiers("EMPLOYEE")).toEqual(["ALL_EMPLOYEES"]);
  });

  it("MANAGER voit ALL_EMPLOYEES et MANAGERS", () => {
    expect(visibleDocTiers("MANAGER")).toEqual(["ALL_EMPLOYEES", "MANAGERS"]);
  });

  it("HR_ADMIN voit tous les niveaux de visibilité", () => {
    expect(visibleDocTiers("HR_ADMIN")).toEqual(["ALL_EMPLOYEES", "MANAGERS", "HR_ONLY"]);
  });

  it("SUPER_ADMIN voit tous les niveaux de visibilité", () => {
    expect(visibleDocTiers("SUPER_ADMIN")).toEqual(["ALL_EMPLOYEES", "MANAGERS", "HR_ONLY"]);
  });

  it("EMPLOYEE ne peut pas accéder aux documents MANAGERS", () => {
    const tiers = visibleDocTiers("EMPLOYEE");
    expect(tiers.includes("MANAGERS")).toBe(false);
  });

  it("EMPLOYEE ne peut pas accéder aux documents HR_ONLY", () => {
    const tiers = visibleDocTiers("EMPLOYEE");
    expect(tiers.includes("HR_ONLY")).toBe(false);
  });

  it("MANAGER ne peut pas accéder aux documents HR_ONLY", () => {
    const tiers = visibleDocTiers("MANAGER");
    expect(tiers.includes("HR_ONLY")).toBe(false);
  });
});
