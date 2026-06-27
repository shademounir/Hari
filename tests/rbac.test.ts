// ─────────────────────────────────────────────────────────────────────────────
// Tests RBAC HARI — SCRUM-045
//
// Règles :
// • Tests 100 % déterministes — aucune dépendance OpenRouter / DB.
// • Couvrent les 4 rôles MVP : EMPLOYEE, MANAGER, HR_ADMIN, SUPER_ADMIN.
// • Testent des cas autorisés et refusés selon les permissions réellement
//   présentes dans src/lib/rbac.ts.
// • Compatibles CI (vitest --run).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  can,
  ROLE_PERMISSIONS,
  ROLES,
  PERMISSIONS,
  type Role,
} from "@/lib/rbac";

// ── 1. Annuaire ───────────────────────────────────────────────────────────────
describe("Annuaire — directory", () => {
  it("EMPLOYEE peut consulter son propre profil", () => {
    expect(can("EMPLOYEE", "directory:read:self")).toBe(true);
  });

  it("EMPLOYEE ne peut pas consulter l'annuaire de son équipe", () => {
    expect(can("EMPLOYEE", "directory:read:team")).toBe(false);
  });

  it("EMPLOYEE ne peut pas consulter l'annuaire complet", () => {
    expect(can("EMPLOYEE", "directory:read:all")).toBe(false);
  });

  it("MANAGER peut consulter son équipe", () => {
    expect(can("MANAGER", "directory:read:team")).toBe(true);
  });

  it("MANAGER ne peut pas consulter l'annuaire complet", () => {
    expect(can("MANAGER", "directory:read:all")).toBe(false);
  });

  it("HR_ADMIN peut consulter l'annuaire complet", () => {
    expect(can("HR_ADMIN", "directory:read:all")).toBe(true);
  });

  it("SUPER_ADMIN peut consulter l'annuaire complet", () => {
    expect(can("SUPER_ADMIN", "directory:read:all")).toBe(true);
  });
});

// ── 2. Données sensibles ──────────────────────────────────────────────────────
describe("Données sensibles — salary / payslip", () => {
  it("EMPLOYEE ne peut pas voir tous les salaires", () => {
    expect(can("EMPLOYEE", "salary:read:all")).toBe(false);
  });

  it("MANAGER ne peut pas voir tous les salaires", () => {
    expect(can("MANAGER", "salary:read:all")).toBe(false);
  });

  it("HR_ADMIN peut voir tous les salaires", () => {
    expect(can("HR_ADMIN", "salary:read:all")).toBe(true);
  });

  it("EMPLOYEE peut voir sa propre fiche de paie", () => {
    expect(can("EMPLOYEE", "payslip:read:self")).toBe(true);
  });

  it("EMPLOYEE ne peut pas voir la fiche de paie de quelqu'un d'autre", () => {
    expect(can("EMPLOYEE", "payslip:read:any")).toBe(false);
  });

  it("MANAGER ne peut pas voir la fiche de paie de quelqu'un d'autre", () => {
    expect(can("MANAGER", "payslip:read:any")).toBe(false);
  });

  it("HR_ADMIN peut voir n'importe quelle fiche de paie", () => {
    expect(can("HR_ADMIN", "payslip:read:any")).toBe(true);
  });
});

// ── 3. Congés ─────────────────────────────────────────────────────────────────
describe("Congés — leave", () => {
  it("EMPLOYEE peut soumettre une demande de congé", () => {
    expect(can("EMPLOYEE", "leave:request")).toBe(true);
  });

  it("EMPLOYEE peut consulter ses propres congés", () => {
    expect(can("EMPLOYEE", "leave:read:self")).toBe(true);
  });

  it("EMPLOYEE ne peut pas voir les congés de son équipe", () => {
    expect(can("EMPLOYEE", "leave:read:team")).toBe(false);
  });

  it("EMPLOYEE ne peut pas approuver une demande de congé", () => {
    expect(can("EMPLOYEE", "leave:approve")).toBe(false);
  });

  it("MANAGER peut voir les congés de son équipe", () => {
    expect(can("MANAGER", "leave:read:team")).toBe(true);
  });

  it("MANAGER peut approuver les congés", () => {
    expect(can("MANAGER", "leave:approve")).toBe(true);
  });
});

// ── 4. Assistant IA / RAG ────────────────────────────────────────────────────
describe("Assistant IA / RAG — handbook", () => {
  it.each(ROLES)("%s peut interroger le handbook", (role) => {
    expect(can(role, "handbook:read")).toBe(true);
  });
});

// ── 5. Gestion des employés ───────────────────────────────────────────────────
describe("Gestion des employés — employee:manage", () => {
  it("EMPLOYEE ne peut pas gérer les employés", () => {
    expect(can("EMPLOYEE", "employee:manage")).toBe(false);
  });

  it("MANAGER ne peut pas gérer les employés", () => {
    expect(can("MANAGER", "employee:manage")).toBe(false);
  });

  it("HR_ADMIN peut gérer les employés", () => {
    expect(can("HR_ADMIN", "employee:manage")).toBe(true);
  });

  it("SUPER_ADMIN peut gérer les employés", () => {
    expect(can("SUPER_ADMIN", "employee:manage")).toBe(true);
  });
});

// ── 6. Administration ─────────────────────────────────────────────────────────
describe("Administration — admin:settings", () => {
  it("EMPLOYEE ne peut pas accéder aux paramètres", () => {
    expect(can("EMPLOYEE", "admin:settings")).toBe(false);
  });

  it("MANAGER ne peut pas accéder aux paramètres", () => {
    expect(can("MANAGER", "admin:settings")).toBe(false);
  });

  it("HR_ADMIN ne peut pas accéder aux paramètres", () => {
    expect(can("HR_ADMIN", "admin:settings")).toBe(false);
  });

  it("SUPER_ADMIN peut accéder aux paramètres", () => {
    expect(can("SUPER_ADMIN", "admin:settings")).toBe(true);
  });
});

// ── 7. Cohérence de la matrice RBAC ──────────────────────────────────────────
describe("Cohérence de la matrice RBAC", () => {
  it("chaque rôle possède uniquement des permissions déclarées", () => {
    const allowedPermissions = new Set(PERMISSIONS);

    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(
          allowedPermissions.has(permission),
          `${role} contient une permission inconnue : ${permission}`,
        ).toBe(true);
      }
    }
  });

  it("toutes les permissions déclarées sont attribuées à au moins un rôle", () => {
    const assignedPermissions = new Set(
      ROLES.flatMap((role) => ROLE_PERMISSIONS[role]),
    );

    for (const permission of PERMISSIONS) {
      expect(
        assignedPermissions.has(permission),
        `La permission ${permission} n'est attribuée à aucun rôle`,
      ).toBe(true);
    }
  });

  it("les rôles supérieurs héritent bien des permissions des rôles inférieurs dans la matrice actuelle", () => {
    const chain: Role[] = ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"];

    for (let i = 1; i < chain.length; i += 1) {
      const lowerRole = chain[i - 1];
      const higherRole = chain[i];
      const higherPermissions = new Set(ROLE_PERMISSIONS[higherRole]);

      for (const permission of ROLE_PERMISSIONS[lowerRole]) {
        expect(
          higherPermissions.has(permission),
          `${higherRole} doit contenir ${permission} héritée de ${lowerRole}`,
        ).toBe(true);
      }
    }
  });
});

// ── 8. Cas de refus critiques — démo Sprint 1 ───────────────────────────────
describe("Cas de refus critiques — démonstration Sprint 1", () => {
  it("EMPLOYEE ne peut pas voir les salaires globaux", () => {
    expect(can("EMPLOYEE", "salary:read:all")).toBe(false);
  });

  it("EMPLOYEE ne peut pas accéder à l'annuaire complet", () => {
    expect(can("EMPLOYEE", "directory:read:all")).toBe(false);
  });

  it("MANAGER ne peut pas accéder aux paramètres admin", () => {
    expect(can("MANAGER", "admin:settings")).toBe(false);
  });

  it("MANAGER ne peut pas gérer les employés", () => {
    expect(can("MANAGER", "employee:manage")).toBe(false);
  });

  it("HR_ADMIN ne peut pas accéder aux paramètres plateforme", () => {
    expect(can("HR_ADMIN", "admin:settings")).toBe(false);
  });
});
