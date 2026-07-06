// Seed corpus. Authored in markdown for readability; the seed converts it to HTML
// for storage and chunks the HTML by heading (see prisma/seed.ts). Edit here, then
// `npm run db:reset` to re-seed (seeding skips when documents already exist).
import type { DocStatus, DocVisibility } from "@prisma/client";

export type SeedDocument = {
  slug: string;
  title: string;
  visibility: DocVisibility;
  status?: DocStatus; // defaults to PUBLISHED
  tags?: string[];
  content: string; // markdown; use ## / ### headings for citable sections
};

export type SeedCollection = {
  slug: string;
  name: string;
  description: string;
  image?: string; // decorative cover (stored on KbCollection.image)
  assistantEnabled?: boolean; // may the AI assistant use this collection? (default true)
  order: number;
  documents: SeedDocument[];
};

// A tiny gradient SVG used as a pleasant default cover so the collection UI looks
// complete out of the box (admins can replace it with an uploaded image). The seed
// rasterizes this to WebP and stores it in object storage (see prisma/seed.ts), so
// it is served + optimized exactly like a real upload.
const cover = (a: string, b: string, c: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="1200" height="300" fill="url(#g)"/></svg>`;

export const KB_COLLECTIONS: SeedCollection[] = [
  {
    slug: "employee-handbook",
    name: "Employee Handbook",
    description: "Company-wide policies every employee can read.",
    image: cover("#6366f1", "#3b82f6", "#06b6d4"),
    order: 0,
    documents: [
      {
        slug: "leave-and-time-off",
        title: "Leave & Time Off",
        visibility: "ALL_EMPLOYEES",
        tags: ["leave", "vacation", "benefits"],
        content: `## Paid Time Off (Vacation)

Full-time employees accrue 1.5 working days of paid leave per month of service — 18 working days per year for a full year — rising with seniority up to a maximum of 30 days. Vacation must be requested in advance through the platform and approved by your manager. Unused days may be carried over until March 31 of the following year, after which they are forfeited except by exceptional HR approval.

## Sick Leave

Any sick absence must be justified by a medical certificate sent to HR within 48 hours; partial salary is maintained in line with CNSS rules, subject to eligibility. Sick leave can be used for personal illness or to care for an immediate family member.

## Parental Leave

Maternity leave is 14 weeks, including 7 weeks that must be taken after the birth. Paternity leave is 3 working days, taken within the month following the birth. Contact HR at least 30 days before your intended start date.`,
      },
      {
        slug: "work-and-compensation",
        title: "Work & Compensation",
        visibility: "ALL_EMPLOYEES",
        tags: ["remote", "expenses", "benefits"],
        content: `## Remote Work Policy

Eligible roles may work remotely up to two days per week after six months of tenure; employees are expected in the office at least three days per week. Remote employees must be reachable during standard hours (9:00–18:00). A monthly remote-work allowance of 150 MAD covers connectivity and electricity, and a one-time home-office stipend of 5,000 MAD is available; request it through Expenses.

## Working Hours and Overtime

Standard hours are 9:00–18:00 with a one-hour lunch break, for 40 hours per week. Non-exempt employees are eligible for overtime pay at 1.5x for hours worked beyond 40 in a week, which must be pre-approved by a manager. Flexible start and end times are permitted as long as the standard hours are covered.

## Expense Reimbursement

Business expenses are reimbursed when submitted with a receipt within 30 days. Eligible expenses include travel, client meals (up to 750 MAD per person), software subscriptions, and professional development. Expenses over 10,000 MAD require manager pre-approval. Reimbursements are paid with the next payroll cycle.

## Health Benefits

The company covers 100% of the employee premium and 70% of dependent premiums for medical, dental, and vision insurance. Coverage begins on the first day of the month after your start date. Open enrollment occurs each November. A 12,000 MAD annual wellness reimbursement covers gym memberships and mental-health services.`,
      },
      {
        slug: "workplace-and-equipment",
        title: "Workplace & Equipment",
        visibility: "ALL_EMPLOYEES",
        tags: ["conduct", "security", "equipment"],
        content: `## Code of Conduct

All employees are expected to treat colleagues with respect and maintain a harassment-free workplace. Discrimination based on race, gender, age, religion, disability, or sexual orientation is prohibited. Violations should be reported to HR or through the anonymous ethics hotline. Confidential company information must not be shared externally.

## Performance Reviews

Formal performance reviews are conducted twice a year, in June and December. Reviews include self-assessment, manager feedback, and goal setting for the next cycle. Compensation adjustments and promotions are typically decided during the December cycle. Continuous feedback is encouraged outside of formal reviews.

## Equipment and Security

Each employee is issued a company laptop. Devices must use full-disk encryption and the company password manager. Report lost or stolen equipment to IT immediately. Personal use of company devices should be minimal. Returning equipment is required within 7 days of leaving the company.`,
      },
      {
        // Seeded as a DRAFT to demonstrate that drafts never reach the reader or
        // the chatbot until published (HARI-62).
        slug: "relocation-policy",
        title: "Relocation Policy (draft)",
        visibility: "ALL_EMPLOYEES",
        status: "DRAFT",
        content: `## Relocation Support

DRAFT — under review by HR. The company may offer relocation assistance for eligible roles. Details to be finalized.`,
      },
    ],
  },
  {
    slug: "management",
    name: "Management",
    description: "Guidance for managers and above.",
    image: cover("#f59e0b", "#f97316", "#ef4444"),
    order: 1,
    documents: [
      {
        slug: "manager-playbook",
        title: "Manager Playbook",
        visibility: "MANAGERS",
        tags: ["managers", "reviews"],
        content: `## Approving Leave

Review your team's pending time-off requests promptly. Check coverage and the requester's balance before approving. Approvals deduct from the employee's balance automatically; rejections should include a brief reason shared directly with the employee.

## Conducting Reviews

Run review conversations twice a year. Prepare with concrete examples, align on goals for the next cycle, and document outcomes. Calibrate ratings with peer managers before the December compensation cycle.`,
      },
    ],
  },
  {
    slug: "hr-internal",
    name: "HR Internal",
    description: "Restricted documents for HR administrators only.",
    image: cover("#10b981", "#14b8a6", "#0ea5e9"),
    // Sensitive internal data: readable by HR in /kb, but kept out of the AI
    // assistant by default. A super admin can re-enable it in Settings → Assistant
    // access. Demonstrates the assistant-access policy out of the box.
    assistantEnabled: false,
    order: 2,
    documents: [
      {
        slug: "compensation-bands",
        title: "Compensation Bands",
        visibility: "HR_ONLY",
        tags: ["compensation", "hr"],
        content: `## Salary Bands

Each role maps to a salary band with a defined minimum, midpoint, and maximum. New hires should target the band midpoint unless experience justifies otherwise. Bands are reviewed annually against market data.

## Off-cycle Adjustments

Off-cycle increases require HR director approval and a written justification (retention risk, scope change, or correction of an internal-equity gap). Record every adjustment with its rationale for audit.`,
      },
    ],
  },
  {
    // SCRUM-050 — Politiques RH fictives (HARI SARL). Publiées et
    // visibles du reader et du chatbot. Les chiffres légaux (congés, maternité,
    // CNSS) suivent le Code du travail marocain (loi n° 65-99) ; les versions
    // anglaises du handbook ont été alignées sur ces mêmes chiffres.
    slug: "politiques-rh",
    name: "Politiques RH",
    description: "Politiques et procédures RH internes d'HARI.",
    image: cover("#8b5cf6", "#a855f7", "#ec4899"),
    order: 3,
    documents: [
      {
        slug: "politique-conges-absences",
        title: "Politique de congés et absences",
        visibility: "ALL_EMPLOYEES",
        tags: ["congés", "absences", "RTT"],
        content: `_Conformément au Code du travail marocain — loi n° 65-99._

## Article 1 — Objet et champ d'application

La présente politique définit les règles applicables aux congés payés et aux différentes absences au sein d'HARI SARL, conformément aux dispositions du Code du travail marocain (loi n° 65-99). Elle s'applique à l'ensemble des salariés en CDI et CDD, dès la confirmation de leur période d'essai.

## Article 2 — Congé payé annuel

Chaque salarié bénéficie d'un congé annuel payé d'1,5 jour ouvrable par mois de travail effectif, soit 18 jours ouvrables par an pour une année complète. Ce droit est porté à 1,5 jour + 1/12 supplémentaire par tranche de 5 ans d'ancienneté, dans la limite de 30 jours ouvrables.

## Article 3 — Congé de maladie

Toute absence pour maladie doit être justifiée par un certificat médical transmis au service RH dans un délai de 48 heures. Le maintien partiel du salaire est assuré conformément aux dispositions de la CNSS, sous réserve d'ouverture des droits.

## Article 4 — Congé de maternité et de paternité

Le congé de maternité est fixé à 14 semaines, dont 7 semaines obligatoires après l'accouchement. Le congé de paternité est de 3 jours ouvrables, à prendre dans le mois suivant la naissance.

## Article 5 — Congés exceptionnels

Des congés exceptionnels rémunérés sont accordés pour :

- Mariage du salarié : 4 jours
- Mariage d'un enfant : 2 jours
- Décès d'un conjoint, enfant ou parent : 3 jours
- Naissance : 3 jours

## Article 6 — Modalités de demande

Toute demande de congé payé doit être saisie via l'outil RH interne au moins 15 jours calendaires avant la date souhaitée pour les congés de plus de 5 jours, et 3 jours pour les congés courts. La validation relève du responsable hiérarchique direct.

## Article 7 — Report et solde des congés

Le solde de congés non pris peut être reporté jusqu'au 31 mars de l'année suivante ; au-delà de cette date il est perdu sauf accord exceptionnel de la Direction des Ressources Humaines.

## Article 8 — Absences non justifiées

Toute absence non justifiée dans un délai de 48 heures est considérée comme injustifiée et peut donner lieu à une retenue sur salaire ainsi qu'à une procédure disciplinaire conformément au règlement intérieur.`,
      },
      {
        slug: "reglement-teletravail",
        title: "Règlement télétravail",
        visibility: "ALL_EMPLOYEES",
        tags: ["télétravail", "organisation"],
        content: `_Conformément au Code du travail marocain — loi n° 65-99._

## Article 1 — Objet et champ d'application

Ce règlement encadre les modalités de mise en œuvre du télétravail au sein d'HARI SARL pour les postes éligibles, dans une démarche volontaire et réversible.

## Article 2 — Conditions d'éligibilité

Le télétravail est ouvert aux salariés en CDI ayant au moins 6 mois d'ancienneté, occupant un poste dont les missions sont réalisables à distance, et disposant d'un espace de travail adapté à domicile.

## Article 3 — Nombre de jours autorisés

Le télétravail est limité à 2 jours par semaine maximum, non cumulables d'une semaine sur l'autre. Les jours télétravaillés sont fixés en accord avec le manager et doivent garantir la présence d'au moins 3 jours au bureau.

## Article 4 — Plages horaires et disponibilité

Le salarié en télétravail reste soumis aux horaires collectifs en vigueur et doit être joignable de 9h à 18h, avec une pause déjeuner d'une heure.

## Article 5 — Équipement et prise en charge des frais

L'entreprise fournit un ordinateur portable et un accès VPN sécurisé. Une indemnité forfaitaire de télétravail de 150 MAD par mois est versée pour couvrir les frais d'électricité et de connexion internet.

## Article 6 — Sécurité de l'information en télétravail

Le salarié s'engage à respecter la Charte Informatique en vigueur, à ne pas utiliser de réseaux Wi-Fi publics non sécurisés pour accéder aux outils professionnels, et à verrouiller son poste en cas d'absence.

## Article 7 — Réversibilité et fin du télétravail

Le télétravail peut être suspendu à tout moment, à la demande du salarié ou de l'employeur, avec un délai de prévenance de 15 jours, sauf nécessité de service.`,
      },
      {
        slug: "procedure-attestation-travail",
        title: "Procédure de demande d'attestation de travail",
        visibility: "ALL_EMPLOYEES",
        tags: ["attestation", "administratif"],
        content: `_Article L.1234-19 du Code du travail et dispositions équivalentes — loi n° 65-99._

## Article 1 — Objet

Cette procédure décrit les étapes permettant à un salarié d'obtenir une attestation de travail auprès du service Ressources Humaines.

## Article 2 — Qui peut faire une demande

Tout salarié actif d'HARI SARL, en CDI ou CDD, peut formuler une demande d'attestation de travail, quelle que soit son ancienneté.

## Article 3 — Canal et modalités de demande

La demande s'effectue via le portail RH interne, rubrique « Demandes administratives », ou par e-mail à rh@hari.ma en précisant le motif de la demande (logement, visa, banque, etc.).

## Article 4 — Délai de traitement

Le service RH traite les demandes dans un délai de 3 jours ouvrés. En cas d'urgence justifiée, un délai accéléré de 24 heures peut être appliqué sur validation du responsable RH.

## Article 5 — Contenu de l'attestation

L'attestation mentionne : l'identité du salarié, la date d'entrée, la nature du contrat, le poste occupé et, sur demande explicite uniquement, la rémunération brute mensuelle.

## Article 6 — Cas particuliers

Pour un salarié ayant quitté l'entreprise, c'est un certificat de travail (et non une attestation) qui doit être délivré, conformément à l'article L.1234-19 et aux dispositions équivalentes du Code du travail marocain. La demande post-départ se fait par e-mail uniquement.`,
      },
      {
        slug: "guide-onboarding",
        title: "Guide d'intégration (onboarding)",
        visibility: "ALL_EMPLOYEES",
        tags: ["onboarding", "nouvel-arrivant"],
        content: `_Procédure interne RH._

## Article 1 — Avant l'arrivée

Le service RH envoie au nouveau collaborateur, une semaine avant sa prise de poste : le contrat signé, le livret d'accueil, la liste des documents administratifs à apporter (CIN, RIB, photos) et un planning de la première semaine.

## Article 2 — Jour de l'arrivée

Le premier jour comprend : l'accueil par le manager, la remise du matériel informatique, la création des accès (badge, messagerie, outils internes), et un point avec le service RH pour finaliser le dossier administratif.

## Article 3 — Première semaine

Le nouveau collaborateur suit un parcours de découverte : présentation de l'équipe, des outils principaux, des process internes, et un point de suivi à J+5 avec son manager.

## Article 4 — Premier mois

Un point d'intégration formel est organisé à 30 jours pour faire le bilan, lever les questions et ajuster les objectifs si nécessaire. La période d'essai fait l'objet d'un suivi régulier.

## Article 5 — Interlocuteurs clés

Le nouveau collaborateur dispose d'un référent RH dédié et d'un parrain/mentor au sein de son équipe pour faciliter son intégration durant les 3 premiers mois.

## Article 6 — Ressources utiles

Le livret d'accueil, la charte informatique, le règlement intérieur et l'annuaire interne sont disponibles dès le premier jour sur l'espace RH digital.`,
      },
      {
        slug: "politique-confidentialite-securite-rh",
        title: "Politique de confidentialité et sécurité des données RH",
        visibility: "ALL_EMPLOYEES",
        tags: ["RGPD", "CNDP", "sécurité"],
        content: `_Loi n° 09-08 relative à la protection des données à caractère personnel — CNDP._

## Article 1 — Objet

Cette politique décrit les engagements d'HARI SARL en matière de protection des données personnelles des collaborateurs, conformément à la loi n° 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel, et aux exigences de la CNDP.

## Article 2 — Données personnelles collectées

Les données collectées dans le cadre de la gestion RH comprennent : identité, coordonnées, situation familiale, données contractuelles, données de paie, et données liées à la formation et à l'évaluation.

## Article 3 — Finalités du traitement

Ces données sont utilisées exclusivement pour la gestion administrative du personnel, le calcul de la paie, le suivi des carrières et le respect des obligations légales et sociales (CNSS, impôts).

## Article 4 — Durée de conservation

Les données contractuelles sont conservées pendant la durée de la relation de travail, puis archivées 5 ans après la fin du contrat, conformément aux obligations légales de conservation des documents sociaux.

## Article 5 — Accès et confidentialité

L'accès aux données RH est strictement limité aux personnes habilitées (service RH, manager direct pour les informations nécessaires à la gestion d'équipe). Toute consultation est journalisée.

## Article 6 — Sécurité des systèmes d'information

Les systèmes hébergeant les données RH sont protégés par chiffrement, authentification à deux facteurs pour les accès administrateurs, et sauvegardes régulières conformément à la Charte Informatique.

## Article 7 — Droits des collaborateurs

Chaque collaborateur dispose d'un droit d'accès, de rectification et, dans les conditions prévues par la loi, d'opposition au traitement de ses données personnelles, en s'adressant au référent données personnelles.

## Article 8 — Contact — référent données personnelles

Toute question relative à la présente politique peut être adressée à dpo@hari.ma.`,
      },
    ],
  },
];
