# ChoreQuest System Design

## Architecture decision

The prototype is four static files with no dependency or backend constraints to preserve. Use a small TypeScript monorepo-style application while retaining the visual language:

- React + React Router + Vite for route-driven, reusable, accessible UI.
- Express for a straightforward JSON API and production static hosting.
- SQLite through `better-sqlite3` for local relational data, migrations, foreign keys, and atomic transactions without external infrastructure.
- Zod schemas shared at the API boundary for server-side validation and typed client parsing.
- Vitest and Testing Library for business-rule, API, routing, persistence, and accessibility tests; ESLint and TypeScript for static checks.

These are major additions because the prototype has no router, component model, validation, test runner, authentication, or transactional store. They are the minimum practical pieces for auditable awards and secure role operations. A hosted PostgreSQL adapter can replace SQLite later without changing domain semantics.

## Project structure

```text
src/
  client/          routes, layouts, features, components, theme, API client
  server/          HTTP app, auth middleware, domain services, repositories
  shared/          schemas, enums, progression/date rules
db/
  migrations/      ordered SQL migrations
  seed.ts          realistic demo family
tests/             domain, API authorization/idempotency, UI/router tests
docs/              product, system, setup, and verification notes
```

UI components never calculate balances, grant awards, or authorize operations. Route modules compose feature components; server services own workflows; repositories own SQL. Shared pure functions own level and calendar-date calculations.

## Authentication and authorization

For the internship-friendly local/demo build, users sign in with email/password. Passwords use `scrypt` with unique salts. A successful login creates an opaque random session token; only its SHA-256 hash is stored, while the browser receives the token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). Sessions expire and can be revoked.

Every mutation resolves the session on the server. Parent operations require an active `PARENT` membership in the target family. Student reads/mutations require the assignment/profile to belong to that membership. Repository queries include `family_id`; IDs alone are never trusted. The UI perspective switch is offered only for roles the current user owns and has no authorization effect.

## Relational model

All IDs are stable text UUIDs. All rows use UTC `created_at`/`updated_at` timestamps; user-facing calendar operations use the profile IANA timezone.

| Table | Important fields and constraints |
| --- | --- |
| `users` | email unique, password hash/salt, display name, timezone |
| `families` | name, settings JSON, owner user ID |
| `family_memberships` | family/user/role, status; unique family + user + role |
| `student_profiles` | membership unique, avatar, birth-year permission band |
| `chores` | family, creator, content/config, recurrence JSON, archived timestamp |
| `chore_assignments` | chore/student, due timestamp, status; indexed by student/status/due |
| `chore_submissions` | assignment, attempt number, note, proof URL, status; unique assignment + attempt |
| `approval_decisions` | submission, parent, decision, note, reversal link |
| `point_transactions` | family/student, amount, kind, reference type/id, idempotency key; unique idempotency key |
| `xp_transactions` | same audit pattern; XP amounts normally nonnegative except compensating reversals |
| `rewards` | family, content, cost, stock, enabled, approval-required |
| `reward_goals` | student/reward, active; partial unique active goal per student |
| `reward_redemptions` | student/reward, status, cost snapshot, idempotency key unique |
| `daily_activity` | student/local date/timezone, qualifying count; unique student + local date |
| `achievements`, `user_achievements` | family/global definitions and earned timestamps |
| `notifications` | recipient, type, payload JSON, read timestamp |
| `activity_logs` | family, actor, action, entity, metadata JSON; indexed family/time |
| `user_preferences` | user unique, theme, animation, reduced motion, sound |
| `sessions` | user, token hash unique, expiry, revocation |

Status values use SQL checks and matching TypeScript enums. Foreign keys use restrictive deletion for ledger/history and controlled cascading only for disposable dependent data. Photos store a generated object key and metadata, not binary content.

## Transactional workflows and idempotency

- **Approval:** transaction checks pending submission and family authorization, updates statuses, inserts decision, inserts points and XP using deterministic keys (`chore-award:<assignment>:<accepted-attempt>`), upserts daily activity, writes notifications/activity, then commits. Unique keys make repeats safe.
- **Reversal:** inserts compensating ledger entries referencing the original transactions and records the reason; it never edits/deletes ledger history. Daily activity is recalculated for affected local dates.
- **Redemption:** transaction checks balance from ledger, reward status/stock, and idempotency key; inserts a negative points transaction and redemption, decrements stock, and notifies the parent. Decline inserts one deterministic refund.
- **No-approval completion:** uses the same award service in the submission transaction.

Balances and XP totals are derived using `SUM`; cached profile totals may be introduced only with reconciliation tests if scale requires it.

## API shape

REST endpoints are grouped under `/api`: `/auth`, `/me`, `/student/*`, `/parent/*`, `/preferences`, and read-only family activity. Mutation bodies are parsed by Zod and accept an `Idempotency-Key` header. Responses use a consistent `{ data }` or `{ error: { code, message, fields? } }` envelope. Expected domain conflicts return 409, invalid input 400, unauthenticated 401, unauthorized/not-owned 403 or non-enumerating 404.

Realtime infrastructure is unnecessary initially. Mutations invalidate/refetch relevant queries; lightweight focus polling keeps approval and notification counts fresh. Server-sent events can be added later if family testing shows value.

## Proof storage

Local development stores validated images under a non-public data directory and serves them through an authorized endpoint. Production uses S3-compatible object storage with short-lived signed upload/read URLs, MIME/size checks, randomized keys, and lifecycle deletion. The schema stores provider, object key, content type, size, and optional scan status.

## Error handling and observability

An Express error boundary assigns a request ID, logs structured server details without secrets, and sends safe domain messages. Client route/error boundaries preserve navigation and offer retry. Important mutations create immutable activity records. Production requires HTTPS, secure cookies, backup policy, `DATABASE_URL`/path, session secret, and object-storage credentials.

## Migrations, seed, and demo identities

Migrations are ordered SQL files tracked in `schema_migrations` and run by `npm run db:migrate`. `npm run db:seed` creates one parent and two students, chores across lifecycle states including recurrence and a pending approval, multiple rewards, a goal, ledger history, streak activity, achievements, and notifications. Seed credentials are development-only and documented in the README.

## Verification strategy

- Pure unit tests: level thresholds/progress; local-date streaks including DST/timezones; balance rules.
- Service/API integration tests against temporary SQLite databases: pending/no award, approval once, repeat idempotency, rejection/resubmission, reversal, redemption/no negative balance/refund, cross-family isolation, and student/parent authorization.
- UI tests: route/active navigation, role-specific pages, preferences persistence, keyboard dialogs/popover, dynamic current date, and disabled/pending states.
- Phase gate: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`; final manual smoke test plus searches for `href="#"`, TODOs, hard-coded display dates, placeholder handlers, and unlabeled icon buttons.

## Deployment

Run migrations before starting the single Node service. For a single-instance internship/demo deployment, mount persistent storage for SQLite and uploaded proofs and take backups. Multi-instance deployment requires PostgreSQL plus shared object storage. Environment variables and exact local/production commands are maintained in `.env.example` and the README.
