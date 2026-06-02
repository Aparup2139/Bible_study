# BibleWay Backend

NestJS (Fastify) API + shared types + Supabase migrations. See the repo-root `BACKEND_PLAN.md`
for the full roadmap and `Readme.md` for resume context.

## Layout
```
backend/
  api/                  # NestJS + Fastify HTTP API
  packages/
    shared-types/       # domain types — single source of truth
  supabase/             # Supabase CLI config + versioned SQL migrations
```

## Quickstart
```bash
npm install            # installs all workspaces
cp .env.example .env   # then fill in Supabase keys (Windows: copy .env.example .env)
npm run dev            # API on http://localhost:3000  →  GET /health
```

## Scripts (run from backend/)
| Script | What it does |
|---|---|
| `npm run dev` | Build shared-types, then start the API in watch mode |
| `npm run build` | Build shared-types, then build the API |
| `npm run typecheck` | Type-check every workspace |
| `npm run test` | Run tests in every workspace (if present) |

## Supabase migrations
Schema lives in `supabase/migrations/` as versioned SQL — the source of truth (no dashboard edits).
```bash
# one-time
npm i -g supabase
supabase link --project-ref YOUR_PROJECT_REF
# apply local migrations to the linked project
supabase db push
```

## Adding a feature module (per phase)
Each phase adds a module under `api/src/modules/<feature>/` (controller + service + module),
imported by `api/src/app.module.ts`. Keep all schema changes as new migration files.
