# Admin Workflow System — Design Spec
**Date:** 2026-03-29
**Status:** Approved

---

## Overview

A personal admin automation system triggered by Apple Reminders. When a reminder fires, Claude autonomously researches the task using the best model and tools for that task type, then delivers results to Discord with source links. A heartbeat processor proactively works through the queue. A Vercel dashboard (accessible on any device) provides real-time agent visibility.

---

## Architecture

```
Apple Reminders (4 lists)
      ↓ reminder alert fires
Apple Shortcuts (one per list)
      ↓ POST {title, list, timestamp} to webhook
Claude Code Remote Trigger
      ↓ routes to agent profile
Efficiency Layer
  → memory check → Context7 pre-fetch → Haiku classifies task
      ↓
Research Agents (parallel via Playwright)
      ↓
QA Agent (reviews before delivery)
      ↓ pass
Discord delivery + Firestore + Markdown file saved
      ↓
Vercel Dashboard (real-time, phone accessible)

Heartbeat: every 30 min checks queue for pending/queued tasks
Morning Summary: daily cron → Discord digest
```

---

## Reminders Lists

| List Name | Agent | Purpose |
|---|---|---|
| 🛒 Price Hunt | PriceHunter | Find lowest price for a quality product |
| ✈️ Trip Planner | TripScout | Flights, hotels, travel logistics |
| 📅 Experience Scout | ExperienceFinder | Events, tickets, reservations of all types |
| 🗂️ Admin | AdminAssist | Goals, learning, organizational tasks |

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
3. Airline direct site (for top 2 results)
4. Going.com / Scott's Cheap Flights (deal alerts)

**Hard rules:**
- No budget airlines: Spirit, Frontier, Allegiant, Sun Country, Avelo, Breeze (and any ultra-low-cost carrier)
- Departure and arrival times: 6:00am – 9:00pm only
- Exception: if no options exist within window, flagged as ⚠️ Outside preferred hours with explanation

**Priority order:** Time window compliance → price → airline quality

**Output:** Top 3 options ranked by time/price balance, each with: airline, departure/arrival times, stops, price, direct booking link. Flags if booking direct saves money. Notes price trend (rising/falling).

**Memory learns:** preferred departure window, home airport(s), airlines chosen/avoided.

---

### ExperienceFinder
**Model:** claude-sonnet-4-6
**Tools:** Playwright (parallel agents per site, per category)

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

**Agent classifies event type first** from reminder text, then dispatches targeted Playwright agents for that category's sites.

**"Ready to reserve" output:** Every result includes a direct booking link pre-filled where possible. Top 3 options per category, ranked by best match to request.

**Reminder examples:**
- `Lakers game next week` → sports bucket
- `Camping Joshua Tree May 15-17` → camping bucket
- `Golf Sunday morning, 2 players` → golf bucket, Denver Golf League first
- `Dinner Saturday 7pm party of 2 Italian` → OpenTable
- `90min massage Sunday afternoon` → MindBody + local spas

---

### AdminAssist
**Model:** claude-haiku-4-5 (escalates to claude-sonnet-4-6 if research needed)
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
| Quality filters met? | ≥4⭐, ≥50 reviews | No budget airlines, time window | Valid tickets/availability | Content links work |
| Return policy present? | Required | N/A | N/A | N/A |
| Sources linked? | ✅ | ✅ | ✅ | ✅ |
| No duplicates? | ✅ | ✅ | ✅ | ✅ |

**Verdicts:** ✅ Passed / ⚠️ Passed with notes / ❌ Retrying
**On fail:** reruns research agent with QA feedback as context. Max 2 retries. If still failing: posts raw results to Discord with explanation, flags for user review.

---

## Efficiency Layer
Wraps every agent run before the expensive model fires:

1. **Memory check** — load agent's past learnings from Firestore (successful sources, blocked sites, user preferences)
2. **Context7 pre-fetch** — for tasks involving tools/services, fetch current docs upfront
3. **Haiku classification** — cheap model reads reminder, extracts key parameters (budget, dates, location, party size, etc.) before Sonnet/Opus spins up
4. **Targeted Playwright** — agents navigate directly to the right page with parameters pre-filled, not broad open searches
5. **24hr result cache** — if the same task was researched within 24 hours, return cached result

---

## Self-Improving Memory
**Per agent, stored in Firestore. Loads at the start of every run.**

Logs after each completed task:
- ✅ Sources that returned high-quality results
- ❌ Sites that blocked Playwright or returned poor results
- 📊 Search strategies that worked best per task type
- 💬 User feedback (Discord reactions ❌ or reply corrections → logged as preference)

**Global preferences (shared across agents):**
- Home city / home airport
- Budget preferences learned from past tasks
- Preferred airlines, brands, venues
- Preferred departure/arrival windows

---

## Persistence

| Layer | Storage |
|---|---|
| Task queue + status | Firestore (`tasks` collection) |
| Full research results | Firestore (`results` collection) + local Markdown |
| Agent memory | Firestore (`memory/{agentName}` collection) |
| Agent profiles + scripts | GitHub repo (`admin-workflow`) |
| Triggers + cron | Claude Code `settings.json` (permanent) |
| Dashboard | Vercel (reads Firestore, accessible on any device) |

---

## Dashboard (Vercel)
**URL:** Bookmarkable, phone-accessible. Reads Firestore in real time.

**Views:**
- **Agent Status Panel** — each of 4 agents as a card: name, status (🟢 Running / ⚫ Idle / ⏸ Queued / 🔴 Failed), current task, tokens used (session + cumulative), QA result of last run
- **Task Feed** — all tasks filterable by list/status/date, each with agent, QA verdict, link to full results
- **Morning Summary Preview** — same data as daily Discord digest
- **Token Usage Chart** — bar chart of token burn per agent per day

---

## Heartbeat (Proactive Task Processor)
**Cadence:** Every 30 minutes
**Logic:** Checks Firestore for `pending` or `queued` tasks → picks next task by priority (queued first, then oldest pending) → runs if no agent currently active
**Control:** `pause agents` in Discord → stops heartbeat. `resume agents` → restarts.
**Dashboard shows:** heartbeat status + next scheduled run time

---

## Morning Summary
**Schedule:** Daily cron (time TBD by user)
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

## Error Handling

| Scenario | Response |
|---|---|
| Token/rate limit hit | Task → `queued`, retry every 15min, Discord notification with ETA |
| Playwright blocked | Skip source, log to memory, complete with partial results + ⚠️ note |
| QA fails (×2) | Post raw results to Discord, flag for user review |
| No results found | Widen criteria incrementally (2 attempts), then ask user for clarification in Discord |
| Morning cron fails | Retry once, then post fallback with task titles only |

---

## Tech Stack

| Component | Technology |
|---|---|
| Trigger | Apple Reminders + Apple Shortcuts |
| Webhook receiver | Claude Code Remote Trigger |
| Agents | Claude API (Haiku / Sonnet / Opus per profile) |
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
