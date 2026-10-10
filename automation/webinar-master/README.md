# Webinar & workshop leads: monthly master sheet

Every session gets 5 tabs in the "Active Campaign List Upload" sheets:

| Tab | Used? |
|---|---|
| `08 OCT 2026 10 Mins Workshop attendee(with buyers)` | skipped |
| `08 OCT 2026 10 Mins Workshop attendee (w/o buyers)` | skipped |
| `08 OCT 2026 10 Mins Workshop pitch` | → **October Pitch** |
| `08 OCT 2026 10 Mins Workshop non-pitch` | → **October Non-pitch** |
| `08 OCT 2026 10 Mins Workshop missed` | → **October Missed** |

This script (`apps-script/MonthlyMaster.gs`) copies the pitch, non-pitch and
missed tabs into one master spreadsheet with three tabs per month (`August
Pitch`, `August Non-pitch`, `August Missed`, `September Pitch` ...).

Each row in the master has these columns:

| Name | Email | Phone | Time | Campaign | Session date | Session tab |
|---|---|---|---|---|---|---|

Name, Email, Phone and Time are found by header name, so column order doesn't
matter. `first_name`, `Phonw` and similar spellings work. If a header is blank
or misnamed (for example the Email column headed "Name"), the usual position
is used instead: A Name, B Email, C Phone, D Time. If a tab has no Time
column, Time is left blank.

## Which tabs

Older tabs weren't named consistently, so the script doesn't need an exact
format. It pulls **every tab whose name says pitch, non-pitch or missed and
has a date**:

| Older / newer spellings | Counted as |
|---|---|
| `pitch`, `Pitch`, `(pitch)`, `PITCH`, `pitch1` | Pitch |
| `non-pitch`, `Non Pitch`, `No Pitch`, `nopitch`, `NO-PITCH`, `(no pitch)` | Non-pitch |
| `missed`, `Missed`, `MISSED`, `missed1` | Missed |

It skips:
- Attendee and buyer tabs.
- Tabs with no date in the name (`Missed`, `non pitch`, `Closing Audience + Pitch`).
- `Copy of ...` tabs.
- The `pitch above 90 Min` / `pitch (90 min)` subsets, which would count the same people twice.

A name with only a day (`25 Encore flexigenie(Pitch)`) takes its month from the
tab next to it, so that one goes to **25 Aug**.

The **Campaign** column comes from the tab name:

| In the tab name | Campaign |
|---|---|
| `10 Mins` | 10 Mins Workshop |
| `Flexi Genie` / `flexigenie` + `Q&A` | Flexi Genie Q&A |
| `Flexi Genie` / `flexigenie` | Flexi Genie |
| `Yearly Promo` | Yearly Promo |
| `Monthly Promo` | Monthly Promo |
| `Q&A` | Q&A |
| `Flexi Agent` | Flexi Agentic |
| `Faceless` | Faceless |
| `TFP`, `PSP`, `MCP`, `2 Day AI` | TFP, PSP, MCP Implement, 2 Day AI |
| none of these (e.g. `13 sep pitch`, `8 Sep Encore Pitch`) | Other |

To leave a campaign out of the master, add its name to `SKIP_CAMPAIGNS` at the
top of the script, for example `['TFP', 'PSP']`.

## Where it reads from

**Active Campaign List Upload 9, 10 and 11**, plus any newer sheet whose name
contains "Active Campaign List Upload". So Upload 12, 13 ... are picked up
automatically.

## How it syncs

- **First run:** it copies every matching tab.
- **After that:** it only adds what's new, to the bottom of the right month's
  tab. That covers new session tabs and rows added later to an existing tab.
  Nothing is copied twice.
- **Month:** taken from the date in the tab name (`08 OCT 2026`,
  `30 Sep2026`, `20 AUG`, `13sep`, `faceless26july`).
- **When it runs:** right after any edit in an upload sheet, and every 15
  minutes as a safety net. Each run is recorded in a **Sync log** tab.

## One-time setup (about 5 minutes)

1. Create a new Google Sheet, for example "Webinar Leads – Monthly Master".
2. In it, open **Extensions → Apps Script**. Delete the sample code, paste in
   all of `MonthlyMaster.gs`, and click **Save**.
3. Optional check: pick **previewMatches** in the function dropdown, click
   **Run**, and open the **Execution log**. It lists every tab, where it would
   go, and which campaign it counts as. Nothing is copied.
4. Pick **installTriggers**, click **Run**, and approve the permissions. If
   Google says the app is unverified, click **Advanced → Go to project**. This
   copies everything so far and turns on the automatic syncing.

The Google account that does this needs edit access to the upload sheets.

## Notes

- Keep naming tabs the way you do now: date, then campaign, then pitch /
  non-pitch / missed. Then the Campaign column is filled in correctly, not
  "Other".
- Add new rows at the **bottom** of a tab. The script remembers how many rows
  it has copied from each tab. If you insert a row in the middle, the last row
  gets copied instead. Edits to rows that were already copied are not synced.
- To rebuild from scratch: delete the month tabs, run `resetSyncState`, then
  run `syncAll`.
- If you keep more than one year in the same master, set
  `MONTH_FORMAT = 'MMMM yyyy'` to get tab names like "October 2026 Pitch".
