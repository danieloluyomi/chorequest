## ChoreQuest Backlog

The main goal is to make ChoreQuest feel fun and rewarding while still being simple and easy to use. We can take inspiration from Habitica and Todoist, but give it its own more relaxed and colorful style.

High Priority
Make every button and navigation page actually work.
Give the parent and student sides different layouts and features.
Let parents create, edit, assign, and approve chores.
Let students complete chores and see if they are pending or approved.
Make points, XP, levels, progress bars, and streaks update properly.
Create a rewards shop where parents add rewards and students redeem them with points.
Fix the date so it always shows the actual current date.
Save chores, rewards, progress, and settings after refreshing.
Make the website work well on phones and computers.

Design Improvements
Give the app a more polished pastel-green and cream design.
Add Light, Dark Forest, Midnight, and Ocean themes.
Add optional animated backgrounds, like stars or fish and moving kelp.
Improve hover effects, transitions, empty states, and success messages.
Make navigation clearer and keep the dashboard from feeling crowded.
Make the parent dashboard more compact and management-focused.
Keep the student dashboard more playful and encouraging.

Extra Ideas
Add achievements and badges for things like streaks and completing certain types of chores.
Add recurring chores and reminders.
Let students choose a reward to work toward.
Make the diamond icon show points, XP, and recent progress when clicked.
Add “Quest Paths” that divide larger chores into smaller steps.
Add a shared Family Garden that grows as the family completes chores.
Let students suggest chores or rewards for parent approval.
Add a weekly progress recap for parents and students

Build Order
Fix the existing buttons, navigation, and dates.
Finish the chore and approval system.
Make points, levels, and streaks work.
Add the rewards shop.
Improve the parent and student dashboards.
Add themes, animations, achievements, and extra features.


# ChoreQuest

A family chore and rewards app with distinct student and parent experiences, transactional points/XP, approval workflows, reward goals, local-timezone streaks, notifications, activity, and four themes. The original prototype is preserved in `legacy-*` files. See [Product Design](docs/product-design.md) and [System Design](docs/system-design.md).

## Setup

Requires Node.js 22 LTS or newer. SQLite needs no separate service.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173`; its API proxy targets port 3001. For a production-style run, use `npm run build`, then `npm start`, and open `http://localhost:3001`.

## Demo family

- Parent: Jamie Morgan — `jamie@chorequest.demo`
- Student: Alex Morgan — `alex@chorequest.demo`
- Additional student: Sam Morgan — `sam@chorequest.demo`
- Development seed password reserved for the final login form: `demo1234`

The header switch is a demo sign-in convenience, not authorization. Every protected endpoint checks server-side family membership and role.

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

Set `NODE_ENV=production`, `DATABASE_PATH`, and a strong `SESSION_SECRET`; run migrations before startup; use HTTPS and persistent database storage. One Node instance with persistent storage fits this SQLite build. Multiple instances require PostgreSQL and shared object storage.

## Current limitations

- Demo sign-in stands in for the final password screen; server authorization is still enforced.
- Reward editing, approval reversal UI, invitations, recurring-instance generation, and binary proof uploads have data/design foundations but are not fully surfaced.
- Proof currently accepts a URL; production should use the signed object-storage design.
- Dashboard freshness uses mutation refreshes instead of realtime events.
