import type { Role } from "@/lib/rbac";

// Les quatre comptes de démonstration. Partagés par le script de seed et la page de connexion
// pour que les boutons "Se connecter en tant que" correspondent toujours à la base de données.
//
// Important sécurité : le mot de passe n'est pas codé en dur dans ce fichier.
// Il doit être fourni via DEMO_PASSWORD dans l'environnement local/de démonstration.
export function isDemoLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEMO_LOGIN_ENABLED === "true";
}

export function getDemoPassword(): string {
  const password = process.env.DEMO_PASSWORD;

  if (!password) {
    throw new Error("DEMO_PASSWORD is required for demo login and seed data.");
  }

  return password;
}

export type DemoUser = {
  email: string;
  name: string;
  role: Role;
  title: string;
  department: string;
  location: string;
};

export const DEMO_USERS: DemoUser[] = [
  {
    email: "collaborateur@hari.ma",
    name: "Imane Chraibi",
    role: "EMPLOYEE",
    title: "Ingénieure Logiciel Full Stack",
    department: "IT",
    location: "Tétouan",
  },
  {
    email: "manager@hari.ma",
    name: "Karim El Idrissi",
    role: "MANAGER",
    title: "Manager Technique",
    department: "IT",
    location: "Tétouan",
  },
  {
    email: "rh@hari.ma",
    name: "Nadia Benali",
    role: "HR_ADMIN",
    title: "Responsable Ressources Humaines",
    department: "Ressources Humaines",
    location: "Casablanca",
  },
  {
    email: "admin@hari.ma",
    name: "Youssef Tazi",
    role: "SUPER_ADMIN",
    title: "Directeur des Systèmes d'Information",
    department: "DSI",
    location: "Distanciel",
  },
];
