# Phase 4 — Planification (Jira)

Cette section formalise le découpage du projet en **epics**, **user stories** et **sprints**, tel
qu'il aurait été suivi dans Jira. Les statuts reflètent l'état actuel du code (référentiel = `main`).

## Epics

| Clé | Epic | Statut |
|---|---|---|
| HARI-1 | Authentification & RBAC | ✅ Terminé |
| HARI-2 | Annuaire des employés | ✅ Terminé |
| HARI-3 | Gestion des congés | ✅ Terminé |
| HARI-4 | Fiches de paie | ✅ Terminé |
| HARI-5 | Assistant IA — chat, outils, RAG | ✅ Terminé |
| HARI-6 | Paramètres plateforme | ✅ Terminé |
| HARI-7 | Infrastructure & déploiement | ✅ Terminé |
| HARI-8 | Qualité & tests | ✅ Terminé |

## Backlog détaillé (user stories)

### HARI-1 — Authentification & RBAC
- **HARI-1.1** *En tant qu'utilisateur, je veux me connecter avec email/mot de passe* — `auth.ts`, Auth.js v5.
- **HARI-1.2** *En tant qu'utilisateur, je veux choisir un rôle de démo en un clic* — page `/login`.
- **HARI-1.3** *En tant que développeur, je veux une matrice de permissions unique* — `lib/rbac.ts`.
- **HARI-1.4** *En tant que dev, je veux garantir que les rôles sont strictement imbriqués* — test `tests/rbac.test.ts`.

### HARI-2 — Annuaire
- **HARI-2.1** *En tant qu'employé, je veux voir mon profil.*
- **HARI-2.2** *En tant que manager, je veux voir mes subordonnés directs.*
- **HARI-2.3** *En tant qu'Admin RH, je veux voir tout l'annuaire.*
- **HARI-2.4** *En tant que dev, je veux masquer le salaire si le rôle n'a pas `salary:read:all`* — redaction côté serveur.

### HARI-3 — Congés
- **HARI-3.1** *En tant qu'employé, je veux soumettre une demande de congé.*
- **HARI-3.2** *En tant qu'employé, je veux consulter mon solde.*
- **HARI-3.3** *En tant que manager, je veux voir les demandes en attente de mon équipe.*
- **HARI-3.4** *En tant que manager, je veux approuver ou rejeter une demande.*

### HARI-4 — Fiches de paie
- **HARI-4.1** *En tant qu'employé, je veux consulter mes propres fiches de paie.*
- **HARI-4.2** *En tant qu'Admin RH, je veux consulter la fiche de paie de n'importe quel employé.*

### HARI-5 — Assistant IA
- **HARI-5.1** *En tant qu'utilisateur, je veux discuter avec un assistant qui connaît mes droits.*
- **HARI-5.2** *En tant que dev, je veux que chaque outil IA soit protégé par `withPermission()`.*
- **HARI-5.3** *En tant qu'utilisateur, je veux voir le raisonnement du modèle en direct (panneau "Thinking…").*
- **HARI-5.4** *En tant qu'utilisateur, je veux que les résultats d'outils s'affichent en widgets (UI générative).*
- **HARI-5.5** *En tant qu'utilisateur, je veux poser des questions sur le règlement intérieur et obtenir des réponses sourcées* — RAG (`lib/rag.ts`, `lib/ai/embeddings.ts`).
- **HARI-5.6** *En tant que dev, je veux indexer le règlement avec pgvector (`halfvec` + HNSW).*
- **HARI-5.7** *En tant qu'utilisateur, je veux que l'assistant enchaîne plusieurs outils (multi-step).*

### HARI-6 — Paramètres plateforme
- **HARI-6.1** *En tant que Super Admin, je veux visualiser la matrice de permissions complète.*

### HARI-7 — Infrastructure & déploiement
- **HARI-7.1** *En tant que dev, je veux démarrer toute la stack avec `docker compose up`.*
- **HARI-7.2** *En tant que dev, je veux que les migrations Prisma s'appliquent automatiquement au boot.*
- **HARI-7.3** *En tant que dev, je veux des données de démo seedées automatiquement (idempotent).*

### HARI-8 — Qualité & tests
- **HARI-8.1** *En tant que dev, je veux des tests unitaires sur la matrice RBAC.*
- **HARI-8.2** *En tant que dev, je veux des tests d'intégration des outils IA contre une base réelle seedée.*
- **HARI-8.3** *En tant que dev, je veux un test "live" validant l'appel réel au LLM (skip si pas de clé API).*

## Découpage en sprints (rétrospectif)

| Sprint | Objectif | Epics couverts |
|---|---|---|
| Sprint 1 | Socle technique : Next.js, Prisma, Docker, Auth.js | HARI-1, HARI-7 |
| Sprint 2 | Domaine RH : annuaire, congés, fiches de paie + RBAC data layer | HARI-2, HARI-3, HARI-4 |
| Sprint 3 | Assistant IA : outils RBAC-gated, streaming, UI générative | HARI-5 (outils + chat) |
| Sprint 4 | RAG : embeddings, pgvector, recherche, citations | HARI-5 (RAG) |
| Sprint 5 | Paramètres, durcissement sécurité, tests, documentation | HARI-6, HARI-8 |

## Définition of Done (DoD)

- Le code compile (`npm run build` — typecheck inclus).
- Les tests passent (`npm test`).
- Toute nouvelle permission est ajoutée dans `lib/rbac.ts` et couverte par un test.
- Tout nouvel outil IA est protégé par `withPermission()` et a un rendu dans `tool-call.tsx`.
- Tout changement de schéma passe par une migration Prisma committée.

Voir la suite : [Phase 5 — Réalisation](../05-realisation/realisation.md).
