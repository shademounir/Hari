# Phase 2 — Expression des besoins

## Besoins fonctionnels

### Authentification & rôles
- BF-01 : Un utilisateur se connecte par email/mot de passe (Auth.js, mots de passe hashés bcrypt).
- BF-02 : La session porte un rôle (`EMPLOYEE`, `MANAGER`, `HR_ADMIN`, `SUPER_ADMIN`).
- BF-03 : Un écran de connexion propose 4 comptes de démonstration (un par rôle).

### Annuaire
- BF-04 : Un employé voit sa propre fiche (`directory:read:self`).
- BF-05 : Un manager voit en plus ses subordonnés directs (`directory:read:team`).
- BF-06 : Un Admin RH / Super Admin voit l'annuaire complet de l'entreprise (`directory:read:all`).
- BF-07 : Le salaire n'apparaît que pour les rôles disposant de `salary:read:all` (filtré côté serveur).

### Congés
- BF-08 : Tout utilisateur peut soumettre une demande de congé (`leave:request`).
- BF-09 : Tout utilisateur consulte son propre solde et historique (`leave:read:self`).
- BF-10 : Un manager consulte les congés de son équipe (`leave:read:team`).
- BF-11 : Un manager approuve ou rejette les demandes de son équipe (`leave:approve`).

### Fiches de paie
- BF-12 : Un employé consulte ses propres fiches de paie (`payslip:read:self`).
- BF-13 : Un Admin RH / Super Admin consulte les fiches de paie de n'importe quel employé (`payslip:read:any`).

### Assistant IA (chat)
- BF-14 : L'utilisateur dialogue avec un assistant qui peut appeler des outils RH (solde de congés,
  soumission de demande, fiches de paie, annuaire) — chaque outil est protégé par la même matrice
  de permissions que l'UI (`withPermission`).
- BF-15 : Si l'outil appelé dépasse les droits du rôle, l'assistant reçoit `{ denied: true }` et
  l'interface affiche une carte « accès refusé » au lieu d'exécuter l'action.
- BF-16 : L'assistant répond aux questions sur le règlement intérieur en citant ses sources
  (RAG vectoriel sur `HandbookChunk`).
- BF-17 : Le raisonnement du modèle est diffusé en direct (panneau « Thinking… » repliable).
- BF-18 : Les résultats d'outils s'affichent sous forme de composants (carte employé, widget congé,
  fiche de paie) plutôt qu'en texte brut (UI générative).
- BF-19 : L'assistant peut enchaîner plusieurs outils dans une même réponse (ex : vérifier le solde
  puis soumettre la demande).

### Administration
- BF-20 : Le Super Admin visualise la matrice complète des permissions par rôle (page Paramètres).

## Besoins non fonctionnels

| # | Besoin | Mise en œuvre |
|---|---|---|
| BNF-01 | Sécurité : aucune autorisation ne doit reposer sur le client | Vérification systématique côté serveur (`auth()`, `can()`, `withPermission()`) |
| BNF-02 | Source unique de vérité pour les droits | `lib/rbac.ts` consulté par l'UI, la couche données et les outils IA |
| BNF-03 | Confidentialité des données sensibles | Le salaire est retiré côté serveur si le rôle n'a pas `salary:read:all` |
| BNF-04 | Disponibilité / reproductibilité | `docker compose up --build` démarre base + admin + app en une commande |
| BNF-05 | Portabilité du modèle IA | Fournisseur swappable via `lib/ai/providers.ts` (OpenRouter, Vercel AI Gateway) |
| BNF-06 | Performance de la recherche vectorielle | Colonne `halfvec(384)` + index HNSW (pgvector) |
| BNF-07 | Testabilité | RBAC pur (sans I/O), outils testés en intégration contre une vraie base seedée |
| BNF-08 | Typage de bout en bout | TypeScript strict, types Prisma propagés jusqu'à l'UI |

## Contraintes

- Stack imposée : Next.js 16 (App Router) / React 19 / TypeScript / Prisma / PostgreSQL+pgvector.
- Le schéma de données passe obligatoirement par des migrations Prisma versionnées (pas de `db push`).
- Le starter doit fonctionner « gratuitement » par défaut (modèles OpenRouter `:free`).

Voir la suite : [Phase 3 — Conception (UML)](../03-conception/conception.md).
