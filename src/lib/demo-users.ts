import type { Role } from "@/lib/rbac";

// Les quatre comptes de démonstration. Partagés par le script de seed et la page de connexion
// pour que les boutons "Se connecter en tant que" correspondent toujours à la base de données.
export const DEMO_PASSWORD = "password123";

export type DemoUser = {
  email: string;
  name: string;
  role: Role;
  title: string;
  department: string;
  location: string;
  blurb: string; // affiché sur la carte de connexion
};

export const DEMO_USERS: DemoUser[] = [
  {
    email: "collaborateur@hari.ma",
    name: "Imane Chraibi",
    role: "EMPLOYEE",
    title: "Ingénieure Logiciel Full Stack",
    department: "IT",
    location: "Tétouan",
    blurb: "Ne voit que ses propres données. L'assistant IA n'a accès qu'à des outils en libre-service (pas de vue sur les autres employés ni de droits de validation).",
  },
  {
    email: "manager@hari.ma",
    name: "Karim El Idrissi",
    role: "MANAGER",
    title: "Manager Technique",
    department: "IT",
    location: "Tétouan",
    blurb: "A une visibilité sur son équipe directe et peut approuver leurs demandes de congés.",
  },
  {
    email: "rh@hari.ma",
    name: "Nadia Benali",
    role: "HR_ADMIN",
    title: "Responsable Ressources Humaines",
    department: "Ressources Humaines",
    location: "Casablanca",
    blurb: "Accès global à l'annuaire de toute l'entreprise, aux rémunérations et aux fiches de paie.",
  },
  {
    email: "admin@hari.ma",
    name: "Youssef Tazi",
    role: "SUPER_ADMIN",
    title: "Directeur des Systèmes d'Information",
    department: "DSI",
    location: "Distanciel",
    blurb: "Possède tous les droits RH, plus l'accès aux paramètres techniques de la plateforme.",
  },
];
