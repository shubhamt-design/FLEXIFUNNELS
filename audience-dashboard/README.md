# Audience Dashboard

A Google Sheets–backed dashboard for webinar audiences:

- **Upload** a list (CSV / Excel / Google Drive link) under a fixed name. Duplicates and buyers are removed automatically.
- **Build a broadcast list**: pick an audience, pick old audiences to subtract from a dropdown (with counts), download a clean CSV for the WhatsApp tool.
- **Buyers stay current**: every hour the buyers sheet is re-read and new buyers are removed from *every* saved audience.
- **Pie chart** of contacts per audience, a table of all audiences and an activity log.
- Only `@flexifunnels.com` accounts can open it.

## Rules

| Rule | Behaviour |
|---|---|
| Same person | Email matches **or** phone matches (case/spacing ignored) |
| Phone format | Stored as digits with country code, no `+`: `9840402282` → `919840402282`. `--`, `NA`, blanks = no phone |
| Invalid rows | Rows with neither a valid email nor a valid phone are dropped |
| Duplicates in a file | First row kept; if a duplicate has the phone/email the kept row was missing, it is filled in |
| Buyers | Removed at upload, when building a list, and hourly from every saved audience |
| Subtract | Nothing is pre-selected — you choose which old audiences to remove |

## Setup (about 5 minutes, once)

Do this signed in as the account that should own the dashboard (`arman@flexifunnels.com`).

1. **Create the data sheet.** Go to [sheets.new](https://sheets.new) and name it `Audience Dashboard – Data`. All audiences will be stored here, one tab each.
2. **Open the script editor.** In that sheet: **Extensions → Apps Script**.
3. **Add the files** (delete the sample `Code.gs` content first):
   - `Code.gs` → paste [`Code.gs`](Code.gs)
   - **+ → Script**, name it `Logic` → paste [`Logic.gs`](Logic.gs)
   - **+ → HTML**, name it `Index` → paste [`Index.html`](Index.html)
   - **Project Settings (⚙) → tick "Show appsscript.json"**, then replace its content with [`appsscript.json`](appsscript.json)
4. **Check the settings** at the top of `Code.gs` (`CONFIG`): buyers sheet ID, `ALLOWED_DOMAIN`, `COUNTRY_CODE`. They are pre-filled.
5. **Run setup.** Pick `setup` in the function dropdown → **Run** → approve the permissions (Sheets, Drive, triggers). This creates the `_Audiences` and `_Log` tabs, does the first buyer sync and schedules the hourly sync.
6. **Deploy.** **Deploy → New deployment → ⚙ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone within flexifunnels.com**
   - **Deploy** → copy the web app URL and share it with the team.

The buyers sheet only needs to be readable by the owner account; teammates don't need access to it or to the data sheet.

### Updating the code later

Paste the new files, then **Deploy → Manage deployments → ✏ → Version: New version → Deploy**. The URL stays the same.

## Limits

- Google Sheets holds 10 million cells. Each contact uses 3, so roughly **3 million contacts** in total across all audiences. Delete old audiences you no longer need.
- Uploads of 50,000 rows take about 30–60 seconds (sent in chunks with a progress bar).

## Files

| File | What it is |
|---|---|
| `Code.gs` | Server: storage, uploads, build list, hourly buyer sync, access check |
| `Logic.gs` | Cleaning / matching rules (no Google services, unit-tested) |
| `Index.html` | The dashboard UI |
| `dev/test.js` | `node dev/test.js` — tests for the cleaning rules |
| `dev/preview.js` | `node dev/preview.js` — builds `dev/preview.html` with fake data to preview the UI in a browser |
