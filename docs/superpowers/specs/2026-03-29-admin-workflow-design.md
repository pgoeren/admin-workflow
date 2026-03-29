# Admin Workflow System — Design Spec
**Date:** 2026-03-29
**Status:** In Review

---

## Overview

A personal admin automation system triggered by Apple Reminders. When a reminder fires, Claude autonomously researches the task using the best model and tools for that task type, then delivers results to Discord with source links. A heartbeat processor proactively works through the queue. A Vercel dashboard (accessible on any device) provides real-time agent visibility.

---

## Architecture

```
Apple Reminders (4 lists)
      ↓ reminder alert fires
Apple Shortcuts (one per list)
      ↓ POST {title, list_id, timestamp, webhook_secret} to localhost:3001/trigger
Local Webhook Server (Node.js, always-on background process)
      ↓ validates secret, routes to agent profile
Efficiency Layer
  → memory check → Context7 pre-fetch → Haiku classifies task
      ↓
Research Agents (parallel via Playwright)
      ↓
QA Agent (reviews before delivery)
      ↓ pass / pass-with-notes
Discord delivery + Firestore + Markdown file saved
      ↓
Vercel Dashboard (real-time, phone accessible)

Heartbeat: every 30 min cron checks Firestore for pending/queued tasks
Morning Summary: daily cron (default 7:00am) → Discord digest
```

---

## Reminders Lists

| List Name | Normalized ID | Agent | Purpose |
|---|---|---|---|
| 🛒 Price Hunt | `price-hunt` | PriceHunter | Find lowest price for a quality product |
| ✈️ Trip Planner | `trip-planner` | TripScout | Flights, hotels, travel logistics |
| 📅 Experience Scout | `experience-scout` | ExperienceFinder | Events, tickets, reservations of all types |
| 🗂️ Admin | `admin` | AdminAssist | Goals, learning, organizational tasks |

The Shortcut sends the normalized ID (not the emoji list name) to avoid encoding issues.

---

## Webhook Server

**Runtime:** Node.js HTTP server running as a persistent background process on the Mac (managed by `launchd` plist — survives reboots and sleep/wake cycles).
**Endpoint:** `POST http://localhost:3001/trigger`
**Authentication:** Shared secret in `Authorization: Bearer <WEBHOOK_SECRET>` header. Secret stored in `.env` file, configured once during setup. Requests without a valid secret return 401 and are logged.

**Payload schema:**
```json
{
  "title": "Best noise-canceling headphones under $200",
  "list_id": "price-hunt",
  "timestamp": "2026-03-29T21:00:00Z"
}
```

**On receipt:** Validates secret → writes task to Firestore with status `pending` → returns 200 immediately (does not wait for agent to complete).

---

## Firestore Schema

### `tasks` collection
| Field | Type | Description |
|---|---|---|
| `id` | string | Auto-generated document ID |
| `title` | string | Reminder text as written |
| `list_id` | string | Normalized list ID (`price-hunt`, `trip-planner`, etc.) |
| `status` | string | `pending` / `running` / `queued` / `completed` / `failed` |
| `agent` | string | Agent name that handled it |
| `created_at` | timestamp | When the webhook was received |
| `started_at` | timestamp | When agent began (null if not started) |
| `completed_at` | timestamp | When agent finished (null if not finished) |
| `tokens_used` | number | Total tokens consumed by this task |
| `qa_verdict` | string | `pass` / `pass_with_notes` / `fail` / null |
| `result_path` | string | Path to Markdown result file (null if not complete) |
| `retry_count` | number | Number of QA retries (default 0) |
| `heartbeat_lock` | timestamp | Set when heartbeat claims a task; prevents double-processing |
| `discord_message_id` | string \| null | Discord message ID of the delivered result; used to correlate reactions and replies |

**Status transitions:** `pending` → `running` → `completed` | `failed` | `queued` (on limit hit)

### `results` collection
| Field | Type | Description |
|---|---|---|
| `task_id` | string | Reference to `tasks` document |
| `agent` | string | Agent that produced it |
| `output` | string | Full research output (markdown) |
| `sources` | array | List of `{url, title, retrieved_at}` objects |
| `qa_notes` | string | QA agent notes (if pass_with_notes) |
| `created_at` | timestamp | When result was written |

*Note: Discord message correlation is done via `task_id → tasks.discord_message_id` — no separate `discord_message_id` field is needed on `results`.*

### `memory/{agentName}` collection
| Field | Type | Description |
|---|---|---|
| `successful_sources` | array | Sources that returned high-quality results |
| `blocked_sources` | array | Sites that blocked Playwright |
| `user_preferences` | object | Learned preferences (budget, time windows, brands, etc.) |
| `last_updated` | timestamp | |

### `cache` collection
| Field | Type | Description |
|---|---|---|
| `cache_key` | string | SHA-256 hash of normalized `{list_id + title}` |
| `task_id` | string | Source task ID |
| `result_path` | string | Path to cached result |
| `created_at` | timestamp | Used to enforce 24hr TTL |

---

## Agents

### PriceHunter
**Model:** claude-sonnet-4-6
**Tools:** Playwright (parallel agents per site)

**Sites (searched in parallel, 5 max):**
1. Amazon (primary)
2. Brand's official site
3. Etsy (artisan/unique items)
4. Woot.com
5. Category-specific wildcard (B&H for electronics, REI for outdoor, Chewy for pets, etc.)

**Quality filters (non-negotiable):**
- Amazon: ≥ 4.0 stars, ≥ 50 reviews
- Other sites: verified seller / trusted brand
- Return policy: required. < 30 days or no returns → ⚠️ flagged
- Free/easy returns → ✅ boosted in ranking

**Output:** Top 3 results ranked by value (quality + price), each with: price, rating, review count, return policy, seller, direct link. Clear recommendation with one-line reasoning. Price difference vs. competitors shown.

---

### TripScout
**Model:** claude-opus-4-6
**Tools:** Playwright (parallel agents per site)

**Sites (searched in parallel):**
1. Kayak
2. Google Flights
3. Airline direct site (for top 2 results found on Kayak/Google Flights)
4. Going.com (requires subscription — user must pre-authenticate session cookie in config)

**Hard rules:**
- No budget airlines: Spirit, Frontier, Allegiant, Sun Country, Avelo, Breeze, and any carrier flagged as ultra-low-cost. List maintained in `config/banned-airlines.json` in the GitHub repo — update as needed.
- Departure and arrival times: 6:00am – 9:00pm only
- Exception: if no options exist within window, flagged as ⚠️ Outside preferred hours with explanation

**Priority order:** Time window compliance → price → airline quality

**Output:** Top 3 options ranked by time/price balance, each with: airline, departure/arrival times, stops, price, direct booking link. Flags if booking direct saves money. Notes price trend (rising/falling).

**Memory learns:** preferred departure window, home airport(s), airlines chosen/avoided.

---

### ExperienceFinder
**Model:** claude-sonnet-4-6
**Tools:** Playwright (parallel agents per site, per category)

**Classification:** Haiku reads the reminder text and assigns one of 7 categories. If ambiguous or multi-category, Haiku selects the primary category and notes the ambiguity in the result. If no category matches, the task routes to AdminAssist as a fallback with a note: "Could not classify as an experience — routing to Admin."

**Reservation categories and sites:**

| Type | Sites | Prep |
|---|---|---|
| 🏌️ Golf | Denver Golf League (priority), GolfNow, TeeOff, course direct | Tee time, players, cart, booking link |
| 🏕️ Camping | Recreation.gov, ReserveAmerica, Hipcamp | Site #, dates, amenities, reserve link |
| 🎵 Concerts/Shows | AXS, Ticketmaster, venue sites | Seats, quantity, best price, checkout link |
| 🏟️ Sports | Ticketmaster, StubHub, team official site | Seats, section, price, checkout link |
| 🎪 Local Events | Eventbrite, Meetup, Google Events | Date, price, location, link |
| 💆 Massage | MindBody, Yelp (≥4⭐), local spa sites | Time, service type, price, booking link |
| 🍽️ Dinner | OpenTable | Top 3 options by rating + availability, party size, reserve link |

**"Ready to reserve" output:** Every result includes a direct booking link pre-filled where possible. Top 3 options per category, ranked by best match to request.

**Reminder examples:**
- `Lakers game next week` → sports bucket
- `Camping Joshua Tree May 15-17` → camping bucket
- `Golf Sunday morning, 2 players` → golf bucket, Denver Golf League first
- `Dinner Saturday 7pm party of 2 Italian` → OpenTable
- `90min massage Sunday afternoon` → MindBody + local spas

---

### AdminAssist
**Model:** claude-haiku-4-5 by default. Escalates to claude-sonnet-4-6 if Haiku's classification step detects that the task requires web research (keywords: "how to", "best way", "learn", "find", "research", "compare") or if Haiku's output confidence is low.
**Tools:** Playwright (for content sourcing), Context7 (for tool/service docs)

**Core purpose:** Turn vague intentions into clear, actionable learning paths. No fluff.

**Approach frameworks:**
- Tim Ferriss (DiSSS): Deconstruct → Select (20% that gives 80% results) → Sequence → Stakes
- Tony Robbins (RPM): Result → Purpose → Massive Action Plan

**Output format:**
- **Goal** (1 sentence)
- **Learning path** — 3-5 ordered steps, each with:
  - The specific action
  - Best content for that step (book, video, course — direct link)
  - Estimated time to complete
- **Start here** — single best first resource to open right now

No "why it matters" section. No motivation speech. Map + materials only.

---

## QA Agent
**Model:** claude-haiku-4-5
**Runs after every research agent, before Discord delivery.**

**Checks per agent:**

| Check | PriceHunter | TripScout | ExperienceFinder | AdminAssist |
|---|---|---|---|---|
| Results match task? | ✅ | ✅ | ✅ | ✅ |
| Quality filters met? | ≥4⭐, ≥50 reviews | No budget airlines, time window | Valid tickets/availability | Content links resolve (HTTP 200) |
| Return policy present? | Required | N/A | N/A | N/A |
| Sources linked? | ✅ | ✅ | ✅ | ✅ |
| No duplicates? | ✅ | ✅ | ✅ | ✅ |

**Verdicts and downstream behavior:**
- ✅ **Pass** — deliver to Discord immediately
- ⚠️ **Pass with notes** — deliver to Discord with QA note appended (e.g., "One result had no return policy — flagged below"). No retry.
- ❌ **Fail** — do not deliver. Rerun research agent with QA feedback as context. Max 2 retries. After 2 failures: post raw results to Discord with explanation, flag for user review, task status → `failed`.

---

## Efficiency Layer
Wraps every agent run before the expensive model fires:

1. **Memory check** — load agent's past learnings from Firestore (`memory/{agentName}`)
2. **Cache check** — compute cache key (SHA-256 of `list_id + normalized title`). If cache hit < 24hrs old in Firestore `cache` collection, return cached result. User can bypass cache by prefixing reminder title with `!fresh`.
3. **Context7 pre-fetch** — for tasks involving tools/services, fetch current docs upfront
4. **Haiku classification** — cheap model reads reminder, extracts key parameters (budget, dates, location, party size, etc.) before Sonnet/Opus spins up
5. **Targeted Playwright** — agents navigate directly to the right page with parameters pre-filled, not broad open searches

---

## Self-Improving Memory
**Per agent, stored in Firestore `memory/{agentName}`. Loads at the start of every run.**

Logs after each completed task:
- ✅ Sources that returned high-quality results
- ❌ Sites that blocked Playwright or returned poor results
- 📊 Search strategies that worked best per task type
- 💬 User feedback from Discord (see Discord Feedback Loop)

**Global preferences (shared across agents, stored in `memory/global`):**
- Home city / home airport
- Budget preferences learned from past tasks
- Preferred airlines, brands, venues
- Preferred departure/arrival windows

---

## Discord Feedback Loop

After results are posted, the user can react or reply to give feedback. Feedback is processed on the next heartbeat cycle (within 30 min).

**Reactions monitored:**
- ✅ — result was good; boost this source and approach in memory
- ❌ — result was poor; log this source/approach as low-quality in memory
- 🔄 — re-run this task fresh (bypasses cache, triggers new agent run)

**Reply corrections:**
The user can reply to a result message with a plain-English correction. The bot identifies which task the reply is in response to by Discord message ID (stored in the `tasks` Firestore document as `discord_message_id`). Free-text replies are processed by Haiku, which extracts the preference and writes it to `memory/global` or `memory/{agentName}`.

Examples:
- "Too expensive, keep it under $100" → writes budget preference to memory
- "I don't fly Delta" → appends Delta to TripScout's avoided airlines in memory

---

## Heartbeat (Proactive Task Processor)
**Cadence:** Every 30 minutes (configured via Claude Code CronCreate in `settings.json`)

**Concurrency control:** Before claiming a task, the heartbeat writes `heartbeat_lock: <current_timestamp>` to the task document using a Firestore transaction. A task is only claimable if `heartbeat_lock` is null or older than 60 minutes (stale lock cleanup). This prevents two heartbeat cycles from processing the same task simultaneously.

**Logic:**
1. Query Firestore for tasks where `status` is `queued` or `pending`, ordered by: `queued` first, then oldest `created_at`
2. Attempt to claim the first unclaimed task via Firestore transaction
3. If claimed: set `status → running`, `started_at → now`, launch agent
4. If no claimable tasks: heartbeat exits silently

**Control via Discord commands:**
- `pause agents` → writes `heartbeat_paused: true` to `config/system` Firestore document. Heartbeat checks this flag at start of each cycle and exits early if set.
- `resume agents` → sets `heartbeat_paused: false`

**Dashboard shows:** heartbeat status (active/paused) + next scheduled run time + last run timestamp

---

## Morning Summary
**Default schedule:** 7:00am daily (configurable — send `set morning summary to 8am` in Discord to update; AdminAssist processes this command and updates the cron in `settings.json`)
**Delivered to:** Discord

**Format:**
```
📋 Morning Summary — [Day Month Date]

"[Rotating motivational quote — Tim Ferriss / Tony Robbins]"

✅ Completed
| Task | Result | Link |
...

⚠️ Needs Attention
| Task | Issue | Action |
...

⏳ In Progress
| Task | Agent | ETA |
...

📌 Pending
| Task | List |
...
```

---

## Token Usage Tracking
Every agent run logs tokens consumed to the `tasks` document (`tokens_used` field) at task completion. A separate Firestore `token_log` collection stores daily aggregates per agent. These aggregates are written **incrementally at task completion** (not only at cron time) by upserting the `token_log` document for the current date using Firestore's `increment()` — this ensures token data is never lost if the morning cron fails. The morning cron reads the existing `token_log` entries for the dashboard and Discord digest; it never writes them from scratch. Documents are idempotent by `{date, agent}` composite key.

| Field | Type |
|---|---|
| `date` | string (YYYY-MM-DD) |
| `agent` | string |
| `total_tokens` | number |
| `run_count` | number |

The dashboard reads `token_log` for the Token Usage Chart.

---

## Result File Storage
Full research results are saved as Markdown files to `~/admin-workflow/results/YYYY-MM-DD/{task_id}.md`. These files are **not committed to the GitHub repo** (added to `.gitignore`) — they are personal research outputs. The GitHub repo contains only scripts, configs, and agent profiles. The `result_path` field in Firestore points to the local file path.

---

## Error Handling

| Scenario | Response |
|---|---|
| Webhook receives invalid secret | Return 401, log attempt, no task created |
| Token/rate limit hit | Task → `queued`, `heartbeat_lock` cleared, retried on next heartbeat cycle (every 30 min), Discord notification with ETA |
| Playwright blocked on a site | Skip source, log to `memory/{agentName}.blocked_sources`, complete with partial results + ⚠️ note |
| QA fails (×2) | Post raw results to Discord, task → `failed`, flag for user review |
| No results found | Widen criteria incrementally (2 attempts), then post to Discord asking for clarification |
| Morning cron fails | Retry once automatically, then post fallback message with task titles only |
| ExperienceFinder unclassifiable | Route to AdminAssist with note; log reminder text for future category expansion |

---

## Tech Stack

| Component | Technology |
|---|---|
| Trigger | Apple Reminders + Apple Shortcuts |
| Webhook server | Node.js HTTP server, managed by macOS `launchd` |
| Agents | Claude API (Haiku 4.5 / Sonnet 4.6 / Opus 4.6 per profile) |
| Browser automation | Playwright plugin |
| Documentation lookup | Context7 plugin |
| Delivery | Discord plugin |
| Database | Firebase Firestore |
| Dashboard | Next.js + Vercel (Frontend Design plugin) |
| Version control | GitHub (GitHub plugin) |
| Scheduling | Claude Code CronCreate |
| Retry loop | Superpowers `loop` skill |
| Parallel research | Superpowers `dispatching-parallel-agents` skill |

---

## Installed Plugins Used

| Plugin | Role |
|---|---|
| Playwright | Live browser research for all agents |
| Discord | Two-way delivery hub + user feedback loop |
| Superpowers | Parallel agents, scheduling, retry logic, self-improvement |
| Context7 | Pre-fetch docs for AdminAssist tasks |
| GitHub | Version control for scripts and agent profiles |
| Frontend Design | Build the Vercel dashboard |
| Code Review | Review workflow scripts before production |
