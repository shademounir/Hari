// ─────────────────────────────────────────────────────────────────────────
// Tests du filtrage RAG par rôle et statut documentaire — SCRUM-054
//
// Couvre :
// • Le filtrage par statut : seuls les documents PUBLISHED alimentent le RAG
// • Le filtrage par visibilité (DocVisibility) selon le rôle utilisateur
// • L'invariant : EMPLOYEE ne peut pas accéder aux documents HR_ONLY via le RAG
// • L'invariant : MANAGER ne peut pas accéder aux documents HR_ONLY
// • HR_ADMIN et SUPER_ADMIN accèdent à tous les niveaux
// • La fonction visibleDocTiers est la source unique de vérité du filtrage
//
// Tests 100 % déterministes — aucune dépendance OpenRouter / DB.
// Compatibles CI (vitest --run).
// ─────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { visibleDocTiers, can, type Role } from "@/lib/rbac";

// ── 1. visibleDocTiers — source de vérité du filtrage RAG ──────────────────
describe("SCRUM-054 — visibleDocTiers : niveaux d'accès documentaire par rôle", () => {
  it("EMPLOYEE : accès uniquement aux documents ALL_EMPLOYEES", () => {
    const tiers = visibleDocTiers("EMPLOYEE");
    expect(tiers).toEqual(["ALL_EMPLOYEES"]);
    expect(tiers).toHaveLength(1);
  });

  it("MANAGER : accès aux documents ALL_EMPLOYEES et MANAGERS", () => {
    const tiers = visibleDocTiers("MANAGER");
    expect(tiers).toContain("ALL_EMPLOYEES");
    expect(tiers).toContain("MANAGERS");
    expect(tiers).toHaveLength(2);
  });

  it("HR_ADMIN : accès aux 3 niveaux (ALL_EMPLOYEES, MANAGERS, HR_ONLY)", () => {
    const tiers = visibleDocTiers("HR_ADMIN");
    expect(tiers).toContain("ALL_EMPLOYEES");
    expect(tiers).toContain("MANAGERS");
    expect(tiers).toContain("HR_ONLY");
    expect(tiers).toHaveLength(3);
  });

  it("SUPER_ADMIN : accès aux 3 niveaux identique à HR_ADMIN", () => {
    const tiers = visibleDocTiers("SUPER_ADMIN");
    expect(tiers).toContain("ALL_EMPLOYEES");
    expect(tiers).toContain("MANAGERS");
    expect(tiers).toContain("HR_ONLY");
    expect(tiers).toHaveLength(3);
  });
});

// ── 2. Cas de refus RAG critiques ───────────────────────────────────────────
describe("SCRUM-054 — Refus RAG : documents non accessibles selon le rôle", () => {
  it("EMPLOYEE ne peut pas accéder aux documents MANAGERS via le RAG", () => {
    const tiers = visibleDocTiers("EMPLOYEE");
    expect(tiers.includes("MANAGERS")).toBe(false);
  });

  it("EMPLOYEE ne peut pas accéder aux documents HR_ONLY via le RAG", () => {
    const tiers = visibleDocTiers("EMPLOYEE");
    expect(tiers.includes("HR_ONLY")).toBe(false);
  });

  it("MANAGER ne peut pas accéder aux documents HR_ONLY via le RAG", () => {
    const tiers = visibleDocTiers("MANAGER");
    expect(tiers.includes("HR_ONLY")).toBe(false);
  });
});

// ── 3. Simulation du filtrage RAG côté serveur ──────────────────────────────
describe("SCRUM-054 — Simulation du filtrage RAG par rôle et statut", () => {
  type DocStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
  type DocVisibility = "ALL_EMPLOYEES" | "MANAGERS" | "HR_ONLY";

  interface FakeChunk {
    id: string;
    content: string;
    docStatus: DocStatus;
    visibility: DocVisibility;
  }

  // Corpus de test — simule des chunks avec différents statuts et visibilités
  const CORPUS: FakeChunk[] = [
    { id: "c1", content: "Politique de congés (tous)", docStatus: "PUBLISHED", visibility: "ALL_EMPLOYEES" },
    { id: "c2", content: "Guide management (managers)", docStatus: "PUBLISHED", visibility: "MANAGERS" },
    { id: "c3", content: "Grille salariale (RH uniquement)", docStatus: "PUBLISHED", visibility: "HR_ONLY" },
    { id: "c4", content: "Document en brouillon", docStatus: "DRAFT", visibility: "ALL_EMPLOYEES" },
    { id: "c5", content: "Document archivé", docStatus: "ARCHIVED", visibility: "ALL_EMPLOYEES" },
    { id: "c6", content: "Attestation RH (tous)", docStatus: "PUBLISHED", visibility: "ALL_EMPLOYEES" },
  ];

  // Simule la clause WHERE de rag.ts : status = PUBLISHED AND visibility IN tiers
  function simulateRagFilter(role: Role): FakeChunk[] {
    const tiers = visibleDocTiers(role);
    return CORPUS.filter(
      (c) => c.docStatus === "PUBLISHED" && tiers.includes(c.visibility),
    );
  }

  it("EMPLOYEE ne voit que les chunks PUBLISHED + ALL_EMPLOYEES", () => {
    const hits = simulateRagFilter("EMPLOYEE");
    expect(hits.every((c) => c.docStatus === "PUBLISHED")).toBe(true);
    expect(hits.every((c) => c.visibility === "ALL_EMPLOYEES")).toBe(true);
    expect(hits.map((c) => c.id)).toContain("c1");
    expect(hits.map((c) => c.id)).toContain("c6");
    expect(hits.map((c) => c.id)).not.toContain("c2"); // MANAGERS
    expect(hits.map((c) => c.id)).not.toContain("c3"); // HR_ONLY
    expect(hits.map((c) => c.id)).not.toContain("c4"); // DRAFT
    expect(hits.map((c) => c.id)).not.toContain("c5"); // ARCHIVED
  });

  it("MANAGER voit les chunks PUBLISHED + ALL_EMPLOYEES et MANAGERS", () => {
    const hits = simulateRagFilter("MANAGER");
    expect(hits.map((c) => c.id)).toContain("c1"); // ALL_EMPLOYEES
    expect(hits.map((c) => c.id)).toContain("c2"); // MANAGERS
    expect(hits.map((c) => c.id)).not.toContain("c3"); // HR_ONLY
    expect(hits.map((c) => c.id)).not.toContain("c4"); // DRAFT
    expect(hits.map((c) => c.id)).not.toContain("c5"); // ARCHIVED
  });

  it("HR_ADMIN voit tous les chunks PUBLISHED (3 niveaux de visibilité)", () => {
    const hits = simulateRagFilter("HR_ADMIN");
    expect(hits.map((c) => c.id)).toContain("c1"); // ALL_EMPLOYEES
    expect(hits.map((c) => c.id)).toContain("c2"); // MANAGERS
    expect(hits.map((c) => c.id)).toContain("c3"); // HR_ONLY
    expect(hits.map((c) => c.id)).not.toContain("c4"); // DRAFT
    expect(hits.map((c) => c.id)).not.toContain("c5"); // ARCHIVED
  });

  it("SUPER_ADMIN voit tous les chunks PUBLISHED identique à HR_ADMIN", () => {
    const hitsHR = simulateRagFilter("HR_ADMIN");
    const hitsAdmin = simulateRagFilter("SUPER_ADMIN");
    expect(hitsAdmin.map((c) => c.id)).toEqual(hitsHR.map((c) => c.id));
  });

  it("aucun rôle ne voit les documents DRAFT dans le RAG", () => {
    for (const role of ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as Role[]) {
      const hits = simulateRagFilter(role);
      expect(hits.some((c) => c.docStatus === "DRAFT")).toBe(false);
    }
  });

  it("aucun rôle ne voit les documents ARCHIVED dans le RAG", () => {
    for (const role of ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as Role[]) {
      const hits = simulateRagFilter(role);
      expect(hits.some((c) => c.docStatus === "ARCHIVED")).toBe(false);
    }
  });
});

// ── 4. Cohérence RBAC ↔ RAG ─────────────────────────────────────────────────
describe("SCRUM-054 — Cohérence : accès KB lié aux permissions RBAC", () => {
  it("seuls HR_ADMIN et SUPER_ADMIN peuvent gérer la KB (kb:manage)", () => {
    expect(can("EMPLOYEE", "kb:manage")).toBe(false);
    expect(can("MANAGER", "kb:manage")).toBe(false);
    expect(can("HR_ADMIN", "kb:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "kb:manage")).toBe(true);
  });

  it("tous les rôles peuvent lire le handbook (handbook:read)", () => {
    expect(can("EMPLOYEE", "handbook:read")).toBe(true);
    expect(can("MANAGER", "handbook:read")).toBe(true);
    expect(can("HR_ADMIN", "handbook:read")).toBe(true);
    expect(can("SUPER_ADMIN", "handbook:read")).toBe(true);
  });

  it("les tiers de visibilité sont cohérents avec les permissions directory", () => {
    // Un EMPLOYEE qui ne voit pas l'équipe ne voit pas non plus les docs MANAGERS
    expect(can("EMPLOYEE", "directory:read:team")).toBe(false);
    expect(visibleDocTiers("EMPLOYEE").includes("MANAGERS")).toBe(false);

    // Un MANAGER qui voit son équipe voit aussi les docs MANAGERS
    expect(can("MANAGER", "directory:read:team")).toBe(true);
    expect(visibleDocTiers("MANAGER").includes("MANAGERS")).toBe(true);

    // HR_ADMIN qui voit tout voit aussi les docs HR_ONLY
    expect(can("HR_ADMIN", "directory:read:all")).toBe(true);
    expect(visibleDocTiers("HR_ADMIN").includes("HR_ONLY")).toBe(true);
  });
});

// ── 5. Hiérarchie des tiers de visibilité ───────────────────────────────────
describe("SCRUM-054 — Hiérarchie des tiers : chaque rôle supérieur voit plus", () => {
  it("MANAGER voit plus de tiers que EMPLOYEE", () => {
    expect(visibleDocTiers("MANAGER").length).toBeGreaterThan(
      visibleDocTiers("EMPLOYEE").length,
    );
  });

  it("HR_ADMIN voit plus de tiers que MANAGER", () => {
    expect(visibleDocTiers("HR_ADMIN").length).toBeGreaterThan(
      visibleDocTiers("MANAGER").length,
    );
  });

  it("EMPLOYEE voit un sous-ensemble des tiers de MANAGER", () => {
    const employeeTiers = new Set(visibleDocTiers("EMPLOYEE"));
    for (const tier of employeeTiers) {
      expect(visibleDocTiers("MANAGER").includes(tier)).toBe(true);
    }
  });

  it("MANAGER voit un sous-ensemble des tiers de HR_ADMIN", () => {
    const managerTiers = new Set(visibleDocTiers("MANAGER"));
    for (const tier of managerTiers) {
      expect(visibleDocTiers("HR_ADMIN").includes(tier)).toBe(true);
    }
  });
});
