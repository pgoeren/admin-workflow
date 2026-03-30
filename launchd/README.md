# launchd Setup

This keeps the webhook server running at all times, surviving reboots and sleep/wake.

## Install

1. Build the project first:
   ```bash
   npm run build
   ```

2. Make sure your `.env` file exists in the project root — the server reads it at startup using `dotenv`. The launchd daemon will start silently and fail if `.env` is missing.

3. Copy the plist to the LaunchAgents directory:
   ```bash
   cp launchd/com.adminworkflow.server.plist ~/Library/LaunchAgents/
   ```

4. Load it:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.adminworkflow.server.plist
   ```

5. Verify it's running:
   ```bash
   curl http://localhost:3001/health
   # Expected: {"status":"ok"}
   ```

## Control

```bash
# Stop the server
launchctl unload ~/Library/LaunchAgents/com.adminworkflow.server.plist

# Restart
launchctl unload ~/Library/LaunchAgents/com.adminworkflow.server.plist
launchctl load ~/Library/LaunchAgents/com.adminworkflow.server.plist

# View logs
tail -f "/Users/petergoeren/Claude Coding Projects/admin-workflow/server.log"
```
