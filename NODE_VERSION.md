# Node version standard — SCRUM-022

**Target version: Node.js 22 LTS ("Jod") + npm ≥ 10**

The whole team uses the same Node major to avoid install / build / compatibility
differences between machines. Node 22 was chosen because it matches the project's
Docker base image (`node:22-alpine`) and is the active LTS line.

## How it's enforced in the repo

| File | Role |
| --- | --- |
| [`.nvmrc`](.nvmrc) | `nvm use` / `fnm` / `nvm-windows` read this → install & switch to Node 22. |
| [`package.json`](package.json) `engines` | Declares `node >=22 <23`, `npm >=10`. |
| [`.npmrc`](.npmrc) | `engine-strict=true` → `npm install` **fails** (not just warns) on a wrong Node. |
| [`Dockerfile`](Dockerfile) | `FROM node:22-alpine` — the container already runs Node 22. |

## How to switch to / verify the right version

```bash
# With nvm / nvm-windows / fnm (reads .nvmrc):
nvm install        # installs Node 22 if missing
nvm use            # switches the current shell to Node 22

# Verify:
node --version     # expected: v22.x.x
npm --version      # expected: 10.x or 11.x
```

No nvm? Install the **LTS** build from <https://nodejs.org/>.
On Windows: [nvm-windows](https://github.com/coreybutler/nvm-windows) or
[fnm](https://github.com/Schniz/fnm) (both read `.nvmrc`).

## Quick check that the project works on your Node

```bash
npm install        # fails fast if Node ≠ 22 (engine-strict)
npm run build      # must finish with "Compiled successfully"
npm test           # RBAC unit tests must pass (DB/LLM suites need Postgres + keys)
```

## Validation log (≥ 2 member machines)

| Member | OS | Node | npm | `npm install` | `npm run build` | Date |
| --- | --- | --- | --- | --- | --- | --- |
| Mouad OMLIL | Windows 11 | v22.21.1 | 11.6.0 | ✅ | ✅ Compiled successfully | 2026-06-21 |
| Driss LHBIL | _(to fill)_ | _(to fill)_ | _(to fill)_ | ☐ | ☐ | _(to fill)_ |

> Build verified on Turbopack / Next.js 16.2.9. The `tests/tools.integration.test.ts`
> suite needs a running Postgres (`DATABASE_URL`) and the live-LLM suites need
> `OPENROUTER_API_KEY`; their absence is an environment dependency, **not** a Node issue.
