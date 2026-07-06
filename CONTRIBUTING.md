# Guide de contribution — HARI

## Branches

| Branche | Rôle | Règle |
|---|---|---|
| `main` | Production | Aucun push direct — merge depuis `develop` uniquement |
| `develop` | Développement principal | Merge depuis `feature/*` ou `fix/*` uniquement |
| `feature/[HARI-xxx]` | Nouvelle fonctionnalité | Créée depuis `develop` |
| `fix/[HARI-xxx]` | Correction de bug | Créée depuis `develop` |

**Toujours partir de `develop` pour créer une branche :**

```bash
git checkout develop
git pull origin develop
git checkout -b feature/HARI-123
```

Chaque fonctionnalité ou correctif doit être testé sur sa propre branche avant d'être mergé dans `develop`.

## Convention de commits

```
type(scope): titre du ticket
```

| Type | Quand |
|---|---|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `docs` | Documentation uniquement |
| `refactor` | Refactoring sans changement fonctionnel |
| `test` | Ajout ou modification de tests |

**Exemples :**

```
feat(back): ajout de l'authentification JWT
feat(front): création du formulaire d'inscription
fix(back): correction du bug de pagination
fix(front): correction de l'affichage mobile
```

## CI / Checks automatiques

Chaque PR vers `develop` déclenche automatiquement :
- `next build` — la PR est refusée si le build casse
- `npm test` — suite vitest déterministe (RBAC + intégration) avec Postgres

**Une PR ne peut être mergée dans `develop` que si tous les checks sont verts.**

Chaque merge vers `main` déclenche automatiquement la création d'un **tag sémantique** et d'une **GitHub Release** :

| Commits depuis le dernier tag | Bump |
|---|---|
| Contient `BREAKING CHANGE` | majeur (`v1.0.0 → v2.0.0`) |
| Contient `feat(...)` | mineur (`v1.0.0 → v1.1.0`) |
| `fix(...)` ou autre | patch (`v1.0.0 → v1.0.1`) |

Cela permet de revenir à n'importe quelle version en production via `git checkout vX.Y.Z`.

## Avant d'ouvrir une PR — rebase obligatoire

Avant de créer ta PR, **rebase ta branche sur `develop`** pour résoudre les conflits chez toi plutôt que sur la branche principale :

```bash
git fetch origin
git rebase origin/develop
# en cas de conflit : résoudre -> git add -> git rebase --continue
git push --force-with-lease   # --force-with-lease et non --force (plus sûr)
```

Pourquoi `--force-with-lease` et pas `--force` : si quelqu'un a pushé sur ta branche entre temps, `--force` l'écraserait silencieusement ; `--force-with-lease` échoue et t'avertit.

## Démarrer le projet

```bash
docker compose up --build
```

Lance Postgres + pgvector, Adminer (`:8080`) et l'appli Next.js (`:3000`). Les migrations et le seed s'appliquent automatiquement.

Voir [`AGENTS.md`](./AGENTS.md) pour les commandes complètes et les conventions de code.

## Travailler sur l'UI

Avant de créer une page ou un composant, lire le [guide Frontend & UI](./docs/frontend.md) :
thème (clair / sombre via tokens), composants shadcn (`base-nova` sur Base UI), structure
du layout responsive, et la checklist accessibilité / responsive à valider avant chaque PR UI.
