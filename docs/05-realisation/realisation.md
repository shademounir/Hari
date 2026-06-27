# Phase 5 — Réalisation

## Stack technique

| Concern | Choix | Justification |
|---|---|---|
| Framework | Next.js 16 (App Router, React 19) | Un seul codebase UI + API ; Server Components gardent les données côté serveur |
| Langage | TypeScript strict | Types propagés de la base (Prisma) jusqu'à l'UI |
| Style | Tailwind v4 + shadcn/ui | Composants accessibles possédés (`components/ui`), pas de dette de design |
| IA | Vercel AI SDK | `streamText` + `useChat` : streaming, tool-calling, raisonnement, multi-step |
| Fournisseurs IA | OpenRouter (par défaut, modèles gratuits) + Vercel AI Gateway | Changement de modèle = une chaîne de configuration |
| Base de données | PostgreSQL + pgvector (`halfvec`) | Une seule base pour le relationnel et la recherche vectorielle |
| ORM | Prisma | Requêtes typées + migrations ; SQL brut uniquement pour les vecteurs |
| Auth | Auth.js (NextAuth v5) | Sessions éprouvées + claim de rôle |
| Infra | Docker Compose | `docker compose up` -> base + admin UI + app |

## Organisation du code (qui fait quoi)

| Couche | S'exécute où | Dans ce repo | Responsabilité |
|---|---|---|---|
| Server Components (SSR) | Serveur, par requête | `app/(dashboard)/**/page.tsx` | Récupère les données via Prisma, applique le RBAC, rend le HTML |
| Client Components | Navigateur | `components/chat/**` | Interactivité : flux du chat, sélecteur de modèle |
| Route Handlers | Serveur | `app/api/chat/route.ts` | Authentifie, construit les outils, diffuse la réponse du modèle |
| Server Actions | Serveur | `app/login/actions.ts` | Soumissions de formulaire sans endpoint REST |
| Logique métier partagée | Serveur | `lib/rbac.ts`, `lib/hr.ts`, `lib/ai/**`, `lib/rag.ts` | Le "vrai" backend : permissions, accès aux données, outils, recherche |

`lib/hr.ts` est la **couche de données unique, scopée par rôle** : les pages du tableau de bord et
les outils IA l'appellent tous les deux, garantissant que le chatbot ne peut jamais lire plus que
ce que l'UI montrerait pour ce rôle.

## Pipeline RAG (recherche dans le règlement intérieur)

1. **Indexation (seed)** : chaque section du règlement (`prisma/handbook.ts`) est découpée en
   chunks, embeddée (`lib/ai/embeddings.ts`, modèle env-sélectionnable, `all-MiniLM-L6-v2` 384d par
   défaut), puis stockée en `halfvec(384)` avec un index HNSW.
2. **Requête** : la question de l'utilisateur est embeddée, puis comparée par cosinus (`<=>`) aux
   chunks indexés ; les *top-k* chunks alimentent la réponse du modèle, qui cite ses sources.

## Sécurité — mesures mises en œuvre

1. Autorisation toujours côté serveur (`auth()` via `lib/session.ts`) ; le rôle envoyé par le client
   n'est jamais source de vérité.
2. Source unique de permissions (`lib/rbac.ts`) consultée par UI, données et outils IA.
3. Accès aux données scopé par rôle dans `lib/hr.ts` (le filtre est dans la requête, pas dans l'UI).
4. Rédaction au niveau champ (salaire) avant que la donnée n'atteigne le navigateur.
5. Échec fermé : `withPermission()` renvoie un refus structuré avant tout appel base de données.
6. Défense en profondeur : le prompt système liste les permissions du rôle, **et** le serveur les
   applique quand même — un prompt détourné ne peut pas dépasser le rôle réel.
7. Mots de passe hashés avec bcrypt.
8. Secrets uniquement côté serveur (`.env`, jamais exposés au client).
9. Requêtes paramétrées (Prisma) ; la requête vectorielle brute lie l'embedding en paramètre
   (`$1::halfvec`).

## Personnalisation

- **Ajouter un modèle** : étendre `CHAT_MODELS` dans `lib/ai/providers.ts`.
- **Ajouter une permission** : l'ajouter à `PERMISSIONS` dans `lib/rbac.ts`, l'assigner à un rôle,
  l'utiliser via `can()` / `withPermission()`.
- **Ajouter un outil** : ajouter un `tool({...})` dans `lib/ai/tools.ts` (protégé par
  `withPermission`), puis un rendu dans `components/chat/tool-call.tsx`.
- **Modifier le règlement** : éditer `prisma/handbook.ts`, puis `npm run db:reset`.

Voir la suite : [Phase 6 — Tests & qualité](../06-tests/tests.md).
