# ChoreQuest Product Design

## Product promise

ChoreQuest helps a family turn clearly assigned household work into visible progress and agreed rewards. Students get a playful, encouraging experience; parents get a compact operations workspace. The same account may be a member of only the roles granted by its family membership, and changing UI perspective never grants permissions.

## Experience principles

- Make the next useful action obvious without overloading a dashboard.
- Show state and consequences before an action: due dates, proof rules, approval state, points, and feedback.
- Keep student language celebratory and parent language concise and operational.
- Make every visible control work; unavailable future capabilities are labelled and disabled.
- Use a calm garden identity with strong focus states, readable contrast, responsive layouts, and reduced-motion support.

## Information architecture

### Student

| Route | Purpose |
| --- | --- |
| `/student` | Today, upcoming work, pending items, active reward goal, progress, and recent activity |
| `/student/chores` | Filtered chore list and chore detail; complete, attach proof, submit, read feedback, resubmit |
| `/student/rewards` | Shop, active goal, redemption, and request history |
| `/student/achievements` | Earned and in-progress badges |
| `/student/family` | Family members and an age-appropriate activity view |
| `/student/notifications` | Actionable notices and read state |
| `/student/settings` | Theme, background animation, sound, reduced motion, and accessibility |

### Parent

| Route | Purpose |
| --- | --- |
| `/parent` | Family overview, child summaries, approval queue, and recent activity |
| `/parent/chores` | Create, edit, duplicate, archive, delete, and assign chores |
| `/parent/approvals` | Review proof; approve, reject, request changes, or safely reverse approval |
| `/parent/rewards` | Create, edit, disable, restock, delete, and fulfill reward requests |
| `/parent/family` | Members, invitations, roles, and child selection |
| `/parent/reports` | Weekly completion, points, streaks, and activity ledger |
| `/parent/settings` | Family rules, reminders, point defaults, and permissions |

The URL is the source of truth for active navigation. Back, forward, direct links, and refresh restore the same page. On mobile, the sidebar becomes a bottom navigation plus an overflow menu.

## Primary flows

1. **Chore lifecycle:** parent creates and assigns a chore → it appears for each assignee → student opens it and submits optional/required proof → approval-required work enters the queue with no award → parent approves, rejects, or requests changes with feedback → corrected work can be resubmitted → one approval creates one points transaction and one XP transaction.
2. **Immediate completion:** student completes a chore that does not require approval → server records completion and awards once in one transaction.
3. **Approval reversal:** parent confirms reversal and supplies a reason → compensating ledger entries remove the original award without deleting history → assignment returns to a reviewable state.
4. **Reward lifecycle:** parent publishes stock/cost rules → student selects a goal or redeems → server checks spendable balance and stock → points are reserved/deducted once and a redemption record is created → parent fulfills or declines; decline refunds once.
5. **Progress:** qualifying completion updates daily activity in the student's local date. A streak is consecutive local calendar days with at least one eligible approved/completed assignment; no activity yesterday resets the current streak when evaluated today. Optional family “rest days” are a future rule, not silently assumed.

## Progress rules

- Spendable points are the sum of immutable point transactions.
- XP is lifetime progression and is not spent.
- Level uses one shared formula: level `floor(sqrt(totalXP / 100)) + 1`; XP needed to enter level `L` is `100 × (L - 1)²`. UI progress is derived from these thresholds.
- A qualifying day is created only by the first eligible completion for that student's local calendar date. More chores that day do not increment the streak again.
- Reversal removes that completion's eligibility; streak summaries are recalculated from daily activity rather than manually decremented.

## Page behavior and states

- Lists provide loading skeletons, helpful empty states, recoverable error states, and filters encoded in query parameters where useful.
- Mutations disable while pending, use idempotency tokens, announce results in an ARIA live region, and refresh affected summaries.
- Destructive actions use confirmation dialogs. Rejections, change requests, point adjustments, and reversals require a reason.
- Chore detail includes title, description, due date/time, recurrence, difficulty, category, points, XP, proof requirement, assignees, and assigner.
- The header currency control shows spendable points, XP/level progress, active goal, recent transactions, and a role-appropriate destination.

## Visual system

- Preserve the prototype's friendly rounded cards, green/cream palette, compact progress widgets, and readable two-column desktop rhythm.
- Establish hierarchy with tinted feature surfaces, grouped lists, section bands, and whitespace rather than identical white cards.
- Themes are token sets: Light Garden, Dark Forest, Midnight, and Ocean. Midnight stars and Ocean bubbles/kelp/fish use pointer-free CSS layers, stop when disabled, and simplify for `prefers-reduced-motion`.
- All controls have hover, pressed, selected, focus-visible, pending, disabled, success, and warning states. Icon-only controls have names and tooltips.

## Acceptance slices

Implementation proceeds as vertical slices: foundations/data; routes/layouts; chores/approvals; ledger/progression; rewards; family/activity; themes; responsive/accessibility polish; full verification. Each slice must type-check, lint, test its business rules, and build before the next is considered complete.
