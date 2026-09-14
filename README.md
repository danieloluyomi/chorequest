# ChoreQuest

A family chore and rewards app with separate parent and student spaces, points, streaks, rewards, recurring chores, approvals, and four themes. See [Product Design](docs/product-design.md) and [System Design](docs/system-design.md).

## Setup

Requires Node.js 22 LTS or newer. SQLite needs no separate service.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173`; its API proxy targets port 3001. For a production-style run, use `npm run build`, then `npm start`, and open `http://localhost:3001`.

On Windows, run `start-chorequest.cmd` to use the bundled compatible Node.js runtime and start both servers.

## Demo family

- Parent: `jamie@chorequest.demo` / `demo1234`
- Student: parent email `jamie@chorequest.demo`, name `Alex Morgan`, PIN `1234`
- Student: parent email `jamie@chorequest.demo`, name `Sam Morgan`, PIN `2468`

Completed chores move into Archive after two days. Opening any recurring chore shows its active and previous occurrences.

## Database

SQLite defaults to `data/chorequest.db`; override with `DATABASE_PATH`. The migration is `db/migrations/001_initial.sql`.

```bash
npm run db:migrate
npm run db:seed
```

Points and XP are immutable ledger entries. Chore awards and reward deductions use unique idempotency keys inside database transactions.

## Quality

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run verify
```

## Deployment

Production uses Vercel and Supabase Postgres. Connect the Supabase integration to the Vercel project so `POSTGRES_URL` is available, then deploy `main`. Vercel runs the idempotent Postgres migration during its build and routes `/api/*` to the Express function in `api/index.ts`. It never seeds or deletes production data.

For a manual production migration:

```bash
npm run db:migrate:postgres
```

Local development and its automated tests continue to use SQLite, so contributors do not need cloud credentials. GitHub Pages is intentionally disabled because it cannot run the API.

## Current limitation

Proof currently accepts a URL. A production deployment should use object storage with signed uploads.
