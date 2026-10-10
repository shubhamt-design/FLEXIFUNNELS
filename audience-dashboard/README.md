# Audience Dashboard

A Google Sheets–backed dashboard for webinar audiences:

- **Upload** a list (CSV / Excel / Google Drive link) under a fixed name. Duplicates and buyers are removed automatically.
- **Build a broadcast list**: pick one audience — or several to **merge** — pick old audiences to subtract, see the final unique count, then download a clean CSV for the WhatsApp tool.
- **Do-not-contact lists stay current**: every hour the buyers sheet, the opted-out sheet and the reminder-team removal sheet are re-read, and anyone on them is removed from *every* saved audience. Add more sheets in `CONFIG.EXCLUDE_SHEETS`.
- **Lead sheets (UTM)**: every Google Sheet with "UTM" in its name is listed with its tabs and row counts. Pick a sheet and its tabs, and pull the next N fresh contacts (e.g. 10,000) for a webinar. Each contact is tagged with its source tab, and pulled contacts are remembered as used so the next pull continues after them. Duplicates, buyers, opt-outs and internal test emails are always removed.
- **Pie chart** of contacts per audience, a table of all audiences and an activity log.
- Only `@flexifunnels.com` accounts can open it.

## Rules

| Rule | Behaviour |
|---|---|
| Same person | Email matches **or** phone matches (case/spacing ignored) |
| Phone format | Stored as digits with country code, no `+`: `9840402282` → `919840402282`. `--`, `NA`, blanks = no phone |
| Invalid rows | Rows with neither a valid email nor a valid phone are dropped |
| Duplicates in a file | First row kept; if a duplicate has the phone/email the kept row was missing, it is filled in |
| Buyers & opt-outs | Everyone on the `EXCLUDE_SHEETS` sheets is removed at upload, when building a list, and hourly from every saved audience. The header row is found automatically even under a banner row; text like `Email : a@b.com` is handled |
| Merge | Picking several "send to" audiences combines them; a person in more than one is kept once |
| Subtract | Nothing is pre-selected — you choose which old audiences to remove |

## Setup (about 5 minutes, once)

Do this signed in as the account that should own the dashboard (`arman@flexifunnels.com`).

1. **Create the data sheet.** Go to [sheets.new](https://sheets.new) and name it `Audience Dashboard – Data`. All audiences will be stored here, one tab each.
2. **Open the script editor.** In that sheet: **Extensions → Apps Script**.
3. **Add the files** (delete the sample `Code.gs` content first):
   - `Code.gs` → paste [`Code.gs`](Code.gs)
   - **+ → Script**, name it `Lists` → paste [`Lists.gs`](Lists.gs)
   - **+ → Script**, name it `Sources` → paste [`Sources.gs`](Sources.gs)
   - **+ → HTML**, name it `LeadsUI` → paste [`LeadsUI.html`](LeadsUI.html)
   - **+ → Script**, name it `Logic` → paste [`Logic.gs`](Logic.gs)
   - **+ → HTML**, name it `Index` → paste [`Index.html`](Index.html)
   - **Project Settings (⚙) → tick "Show appsscript.json"**, then replace its content with [`appsscript.json`](appsscript.json)
   Tip: on GitHub open each file and use the **Copy raw file** button (⧉ at the top right of the file) so nothing gets cut off. After pasting, the last line of each file should match the end of the file on GitHub. Press **Save (💾)** after each file.
4. **Check the settings** at the top of `Code.gs` (`CONFIG`): the do-not-contact sheets (`EXCLUDE_SHEETS`), `ALLOWED_DOMAIN`, `COUNTRY_CODE`. They are pre-filled.
5. **Run setup.** Pick `setup` in the function dropdown → **Run** → approve the permissions (Sheets, Drive, triggers). This creates the `_Audiences` and `_Log` tabs, does the first buyer sync and schedules the hourly sync.
6. **Deploy.** **Deploy → New deployment → ⚙ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone within flexifunnels.com**
   - **Deploy** → copy the web app URL and share it with the team.

The do-not-contact sheets only need to be readable by the owner account; teammates don't need access to it or to the data sheet.

### Updating the code later

Paste the new files, then **Deploy → Manage deployments → ✏ → Version: New version → Deploy**. The URL stays the same.

## Lead sheets (UTM)

- Found automatically every hour (and with **↻ Rescan Drive**): any spreadsheet the owner can open whose name contains `CONFIG.SOURCE_SEARCH` (`UTM`). Others can be added by link.
- Tabs are detected by their header row (`first_name` / `email` / `phone`), even under a banner row; tabs without a header are recognised from their values. Tabs with no email/phone column (summaries, notes) are skipped.
- A pull combines the ticked tabs **in tab order, top to bottom**, removes duplicates, buyers, opt-outs, the reminder-team list, emails at `CONFIG.IGNORE_EMAIL_DOMAINS` and anyone pulled before (from any sheet), then takes the first N.
- Pulled contacts are stored in a separate spreadsheet, **Audience Dashboard – Used leads** (created by `setup`). **Release** a batch to make its contacts available again.

## Limits

- Google Sheets holds 10 million cells. Each contact uses 3, so roughly **3 million contacts** in total across all audiences. Delete old audiences you no longer need.
- Uploads of 50,000 rows take about 30–60 seconds (sent in chunks with a progress bar).

## Files

| File | What it is |
|---|---|
| `Code.gs` | Server part 1: config, setup, access check, uploads, Drive links |
| `Lists.gs` | Server part 2: build list, delete, hourly buyer sync, storage helpers |
| `Sources.gs` | Lead sheets: find UTM sheets, combine tabs, pull batches, remember used contacts |
| `LeadsUI.html` | The "Lead sheets (UTM)" page (included into `Index.html`) |
| `Logic.gs` | Cleaning / matching rules (no Google services, unit-tested) |
| `Index.html` | The dashboard UI |
| `dev/test.js` | `node dev/test.js` — tests for the cleaning rules |
| `dev/test-server.js` | `node dev/test-server.js` — runs the server code end-to-end on fake sheets (`dev/gas-sim.js`) |
| `dev/preview.js` | `node dev/preview.js` — builds `dev/preview.html` with fake data to preview the UI in a browser |
