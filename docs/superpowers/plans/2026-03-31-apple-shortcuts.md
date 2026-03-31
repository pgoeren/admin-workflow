# Admin Workflow — Plan 5: Apple Shortcuts

> This is a configuration guide, not a coding plan. Apple Shortcuts must be built by hand in the iOS Shortcuts app. Follow each step exactly.

**Goal:** Configure 4 Apple Shortcuts (one per list) that send a task title to the webhook server, so you can trigger research from your phone in under 10 seconds.

**Prerequisites:** Plans 1–3 complete. The webhook server is running and reachable from your phone.

---

## Sub-Project Roadmap

- **Plan 1: Foundation** — project scaffold, webhook server, Firestore schema
- **Plan 2: Agent System** — efficiency layer, memory, research agents
- **Plan 3: Orchestration** — heartbeat processor, Discord delivery
- **Plan 4: Dashboard** — real-time Next.js dashboard on Vercel
- **Plan 5: Apple Shortcuts** ← you are here

---

## Correct Request Shape

Before building shortcuts, know the exact webhook spec:

- **Endpoint**: `POST /trigger`
- **Auth header**: `Authorization: Bearer admin-workflow-secret-key-2026-secure-random`
- **Content-Type**: `application/json`
- **Body fields**: `title` (string) and `list_id` (one of: `price-hunt`, `trip-planner`, `experience-scout`, `admin`)

Test from terminal before touching shortcuts:
```bash
curl -X POST http://localhost:3001/trigger \
  -H "Authorization: Bearer admin-workflow-secret-key-2026-secure-random" \
  -H "Content-Type: application/json" \
  -d '{"title":"test task","list_id":"admin"}'
```
Expected: `{"task_id":"...","status":"queued"}`

---

## Step 1: Start the Webhook Server

On your Mac, in a terminal:
```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npm run dev
```

Leave the terminal open. Verify it works:
```bash
curl http://localhost:3001/health
```
Expected: `{"status":"ok"}`

---

## Step 2: Make the Server Reachable from Your Phone

### Option A — Same WiFi (simpler)

1. Mac: **System Settings → Network → Wi-Fi** → click your network name
2. Note the IP address (e.g. `192.168.1.42`)
3. Your base URL: `http://192.168.1.42:3001`
4. Phone must be on the same WiFi

### Option B — ngrok (works anywhere)

1. `brew install ngrok/ngrok/ngrok`
2. In a second terminal: `ngrok http 3001`
3. Copy the `https://...ngrok-free.app` URL
4. Your base URL: that ngrok URL
5. Free URLs change each time ngrok restarts — keep the tab open

---

## Step 3: Build the First Shortcut (Price Hunt)

Open the **Shortcuts** app on your iPhone. Tap **+** (top right).

**Name it:** Tap "New Shortcut" at the top → type `Price Hunt`

### Action 1 — Ask for Input
Tap **Add Action** → search `Ask for Input` → tap it.
- **Input Type**: Text
- **Prompt**: `What do you want priced?`

### Action 2 — Get Contents of URL
Tap **+** → search `Get Contents of URL` → tap it.

Fill in every field:
- **URL**: `http://192.168.1.42:3001/trigger` ← replace with your actual base URL
- **Method**: POST
- Tap **Show More**
- Under **Headers**, tap **Add new field**:
  - Key: `Authorization`
  - Value: `Bearer admin-workflow-secret-key-2026-secure-random`
- Tap **Add new field** again:
  - Key: `Content-Type`
  - Value: `application/json`
- Under **Request Body**, tap to select **JSON**
- Tap **Add new field** under JSON:
  - Key: `title`
  - Value: tap the token field → select **Provided Input** (from Action 1)
- Tap **Add new field** again:
  - Key: `list_id`
  - Value: `price-hunt` (plain text)

### Action 3 — Show Result
Tap **+** → search `Show Result` → tap it.
- Tap the text field → select the variable from Action 2 (the URL response)

**Save:** Tap **Done** (top right).

---

## Step 4: Build the Other 3 Shortcuts

Duplicate Price Hunt (long-press it → Duplicate) and change only these three things each time:

| Shortcut Name    | Prompt                             | list_id            |
|------------------|------------------------------------|--------------------|
| Trip Planner     | What do you want planned?          | `trip-planner`     |
| Experience Scout | What experience do you want found? | `experience-scout` |
| Admin            | What admin task?                   | `admin`            |

Everything else (URL, headers, action structure) stays identical.

---

## Step 5: Add to Share Sheet (Optional)

This lets shortcuts appear when you highlight text and tap Share — the shared text becomes the task title automatically.

For each shortcut:
1. Open the shortcut → tap the **⋯** menu (top right)
2. Enable **Show in Share Sheet**
3. Under **Share Sheet Types**, select **Text**
4. Tap **Done**

---

## Step 6: End-to-End Test

1. Open Shortcuts → tap **Price Hunt**
2. Type: `AirPods Pro 2 best price`
3. Tap **Done**
4. Wait 2–3 seconds → you should see: `{"task_id":"...","status":"queued"}`

**Verify in Firestore:**
Firebase Console → Firestore → `tasks` collection → new doc with `status: "pending"`

**Verify processing:**
The heartbeat runs every 30 minutes. After it fires, the task `status` → `completed` and you'll get a Discord notification.

To trigger immediately for testing:
```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npm run heartbeat
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Could not connect` | Server not running, or wrong IP/URL |
| `401 Unauthorized` | Bearer token doesn't match `WEBHOOK_SECRET` in `.env` |
| `400 Invalid list_id` | `list_id` value must be exact: `price-hunt`, `trip-planner`, `experience-scout`, or `admin` |
| Task stuck in `pending` | Heartbeat not running — run `npm run heartbeat` manually to test |
