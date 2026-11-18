# Orarul meu 📅

A personal schedule/calendar app with cross-device sync and Telegram + email reminders.

**Live site:** https://corneluu.github.io/orar2026/

## Features
- Month / Week / Day views, recurring events, category colors, dark mode
- Cross-device sync through a **private** GitHub repo (`corneluu/orar2026-data`)
- Per-event reminders on Telegram and email, plus a morning summary (08:00)
- Works offline (local storage fallback)

## Architecture & security

| Piece | Where | Visibility |
|---|---|---|
| App code (`index.html`, `Code.gs`) | `corneluu/orar2026` | Public — holds no data and no secrets |
| Calendar data (`data.json`) | `corneluu/orar2026-data` | **Private** |
| Reminder runner | Google Apps Script, time trigger every 5 min | Private, no web endpoint |
| Secrets | Apps Script Script Properties / this device's localStorage | Never in git |

Rules:
- Never commit tokens, phone numbers or calendar data to this repo.
- Use **fine-grained** GitHub tokens, scoped to `orar2026-data` only, with an expiry.
- The bot token, Resend key and phone are stripped from synced data by the app (`publicNotifs`).

## Setup (one-time)

### 1. App sync token (each device)
GitHub → Settings → Developer settings → Fine-grained tokens → Generate:
repository access **only `orar2026-data`**, permission **Contents: Read and write**, expiry 90 days.
Paste it into the app's GitHub login.

### 2. Reminders (Apps Script)
1. Paste `Code.gs` into the Apps Script project and save.
2. **Project Settings → Script Properties**:
   - `GITHUB_TOKEN` — a second fine-grained token, only `orar2026-data`, **Contents: Read-only**
   - `TELEGRAM_BOT_TOKEN` — from @BotFather
   - `TELEGRAM_CHAT_ID` — your chat id
   - `NOTIFICATION_EMAIL` — one or more addresses, comma-separated
3. Run `installReminderTrigger` once (allow permissions), then `testNotify`.

Email is sent from the Google account that owns the script.

## Local development

Open `index.html` in a browser — no build step.
