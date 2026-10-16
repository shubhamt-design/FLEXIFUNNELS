# Flexi Genie weekly workshop swap

Each week, one row in a Google Sheet updates everything below:

| Item | Page | Source |
|---|---|---|
| Form webhook (UTM sheet tab) | `/funnel-agent` | column G, created by Apps Script |
| Form webhook (UTM sheet tab) | `/flexi-genie-regteam` | column H, created by Apps Script |
| ActiveCampaign list | both form pages | column E (list name) |
| WhatsApp community link | `/funnel-agent-ty`, `/flexi-genie-ty` | column F |
| Zoom link | `/genie-demo` redirect | column D |

## How it works

1. **You** add a row to the inputs sheet
   ([Flexi Genie Weekly Workshop – Automation Inputs](https://docs.google.com/spreadsheets/d/120U4NUfrQgW-THHAZNzy10hkHXD1qLuh0JSVTEh2xYs/edit)).
   Fill in columns A–F: run date, the two tab names, Zoom link, AC list name
   and WhatsApp link. You can add several weeks ahead of time.
2. **Apps Script** (`apps-script/WeeklyTabs.gs`, every 15 min) creates the two
   named tabs in the master lead spreadsheet. It copies the header row from
   last week's tab, then writes each tab's webhook (`.../exec?gid=<tab id>`)
   into columns G and H.
3. **The Claude routine** "Flexi Genie weekly workshop swap" (09:57 and
   16:57 IST daily) picks the latest row whose run date is today or earlier.
   It follows [`PLAYBOOK.md`](PLAYBOOK.md) and updates the pages. Each step
   checks the live value first, so a run with nothing new changes nothing.
   You get a push and email summary.

The Apps Script step exists because Claude's cloud environment can't reach
`script.google.com`, and the Drive connector can't add tabs to a sheet.

Row 2 of the sheet holds the live 30 Sept values. Leave it: the script copies
column headers from it, and runs with it as the latest row make no changes.

## One-time setup

1. **Install the Apps Script.** Open the Apps Script project behind the
   registration webhook (`AKfycbwgpHL…`). Add a new file and paste in
   `apps-script/WeeklyTabs.gs`.
   - If the project is *not* bound to the lead spreadsheet, set
     `MASTER_SPREADSHEET_ID` to that spreadsheet's id.
   - Run `installTrigger` once and approve the permissions.
   - You don't need to redeploy: the webhook's `doPost` is untouched.
2. **Give the routine its connectors.** Open the routine in claude.ai →
   Routines, and enable the **FlexiFunnels** and **Google Drive** connectors.
   Without them, the routine can't read the sheet or edit pages.

## Weekly use

Add the row (A–F) at least 15 minutes before the routine's next run so the
tabs exist. If G/H are still empty when it runs, the routine updates the
other items and reports "sheet tabs not ready yet". The next run finishes the
webhooks.
