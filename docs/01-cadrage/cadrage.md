# Phase 1 — Cadrage du projet

## Contexte

Les entreprises ont besoin d'un outil RH centralisant la gestion du personnel (annuaire, congés,
fiches de paie) tout en réduisant la charge des équipes RH sur les questions répétitives
(« combien de jours de congés me reste-t-il ? », « quelle est la politique de télétravail ? »).
HARI répond à ce besoin en couplant un **back-office RH classique** à un **assistant conversationnel
IA** capable d'agir pour le compte de l'utilisateur, dans la limite de ses droits.

## Objectifs du projet

- Fournir une plateforme RH minimale mais complète : annuaire, gestion des congés, fiches de paie.
- Démontrer un assistant IA **de confiance** : actions tracées, droits vérifiés côté serveur,
  réponses sourcées (RAG) sur le règlement intérieur.
- Garantir qu'aucun rôle ne peut, via le chat, accéder à des données qu'il ne pourrait pas voir
  dans l'interface classique (le chat n'est jamais un point de contournement du contrôle d'accès).
- Livrer un starter reproductible (Docker Compose) et testé (tests unitaires, d'intégration, et
  test "live" contre un vrai modèle de langage).

## Périmètre (in / out)

**Dans le périmètre :**
- Authentification et gestion de session (Auth.js).
- 4 rôles : Employé, Manager, Admin RH, Super Admin.
- Annuaire des employés (filtré selon le rôle).
- Gestion des congés (demande, solde, approbation).
- Consultation des fiches de paie.
- Assistant IA avec appel d'outils RBAC, RAG sur le règlement intérieur, UI générative.
- Paramètres plateforme (matrice des permissions visible par le Super Admin).

**Hors périmètre (volontairement, c'est un starter) :**
- Paie réelle (calcul de salaire, charges, export comptable).
- Multi-entreprise / multi-tenant.
- Notifications email / mobile.
- Intégration SIRH tiers (Workday, BambooHR, etc.).

## Parties prenantes

| Rôle | Besoin principal |
|---|---|
| Employé | Consulter son profil, ses congés, ses fiches de paie ; poser des questions au règlement intérieur |
| Manager | + voir son équipe, approuver/refuser les congés de ses subordonnés |
| Admin RH | + voir toute l'entreprise, gérer les fiches employés, voir les salaires |
| Super Admin | + administrer la plateforme (paramètres, matrice de droits) |

## Livrables attendus

1. Application Next.js fonctionnelle (`npm run dev` / `docker compose up`).
2. Modèle de données versionné (migrations Prisma).
3. Suite de tests automatisés (`npm test`).
4. Documentation projet (ce dossier `src/docs/`).

Voir la suite : [Phase 2 — Besoins](../02-besoins/besoins.md).
