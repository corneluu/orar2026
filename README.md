# Orarul meu 📅

A personal schedule/calendar app with full cross-device sync via Google Sheets.

**Live site:** https://corneluu.github.io/orar2026/

## Features
- Month / Week / Day views
- Recurring events (weekly, every N weeks, specific days)
- Category filters with color coding
- Dark mode
- Cross-device sync via Google Apps Script + Google Sheets
- Works offline (local storage fallback)

## Setup Sync (one-time)

1. Open the [Google Sheet](https://docs.google.com/spreadsheets/d/1LmNZnQmIkTcdX0FoueNVdck31ctIwsuPPcCFMd78KQk/edit)
2. Go to **Extensions → Apps Script**
3. Delete existing code and paste the contents of `Code.gs`
4. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the Web App URL
6. In the app, click **⚙ Sync** and paste the URL

> The URL acts as your secret key — don't share it publicly.

## How it Works

All calendar data is saved as a JSON string in cell **A1** of the **"Data"** sheet tab.  
The app reads/writes via the Apps Script Web App endpoint.  
Changes sync across devices every 60 seconds automatically.

## Local Development

Just open `index.html` in any browser — no build step needed.
