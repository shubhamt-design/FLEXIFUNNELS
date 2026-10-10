# 10 Mins Business Launch Workshop: monthly master sheet

This script collects each workshop session's Pitch, Non-pitch and Missed lists
into one master spreadsheet. The master has three tabs per month:

| Month | Tabs |
|---|---|
| September | `September Pitch`, `September Non-pitch`, `September Missed` |
| October | `October Pitch`, `October Non-pitch`, `October Missed` |

The script is `apps-script/MonthlyMaster.gs`.

## Where it reads from

It reads these files:

- [Active Campaign List Upload 9 - 2026](https://docs.google.com/spreadsheets/d/18C_t6zeLlL34uXq1HFEw9SsVM8STcwjyVCkrsg0PCJc/edit)
- [Active Campaign List Upload 10 - 2026](https://docs.google.com/spreadsheets/d/1T-seqAy2j6WrU-c2zv6GZHKSwaf9YVtHsNcNpckjXR4/edit)
- [Active Campaign List Upload 11 - 2026](https://docs.google.com/spreadsheets/d/1xQEivSCmMv4WBpN8fqlLrisj8EXJBy0YLXzWAX58NhI/edit)
- any newer file named "Active Campaign List Upload ..." (12, 13 ...), picked
  up automatically

Inside those files, it only pulls tabs whose name contains **"10 Mins
Workshop"**. It sorts each tab by the keyword in its name:

| Tab name (example) | Goes to |
|---|---|
| `08 OCT 2026 10 Mins Workshop pitch` | October Pitch |
| `08 OCT 2026 10 Mins Workshop non-pitch` | October Non-pitch |
| `08 OCT 2026 10 Mins Workshop missed` | October Missed |
| `04 OCT 2026 7:30 10 Mins Workshop pitch` | October Pitch |
| `04 OCT 2026 10 Mins Workshop pitch1` | October Pitch |
| `30 Sep2026 10 Mins Workshop pitch` | September Pitch |
| `08 OCT 2026 10 Mins Workshop attendee (w/o buyers)` | skipped |
| `28 SEP 2026 Faceless enc Workshop pitch` | skipped (different workshop) |
| `9 SEP TFP pitch`, `16 AUG Flexi Agentic pitch` | skipped (different workshop) |
| `Sheet62`, `replay aud` | skipped |

The month comes from the date in the tab name. Keep naming tabs the way you
do now: date first, then "10 Mins Workshop", then pitch / non-pitch / missed.

## How it syncs

- **First run:** it pulls every row from every matching tab.
- **After that:** it only adds what's new, to the bottom of that month's tab.
  That covers new session tabs (for example the 12 Oct pitch tab) and rows
  added later to an existing tab. Nothing is copied twice.
- Each row gets two extra columns at the front: **Session tab**, the tab it
  came from, so you can tell sessions apart, and **Synced at**. Columns are
  matched by header name (Name, Email, Phone, Time ...). Every run is
  recorded in a **Sync log** tab.
- **When it runs:** right after any edit or new tab in an upload file that
  has workshop tabs, and every 15 minutes as a safety net. The 15-minute run
  is also how a brand-new upload file gets found.

## One-time setup (about 5 minutes)

1. Create a new Google Sheet, for example "10 Mins Workshop – Monthly Master".
2. In it, open **Extensions → Apps Script**. Delete the sample code, paste in
   all of `MonthlyMaster.gs`, and click **Save**.
3. Optional check: pick **previewMatches** in the function dropdown, click
   **Run**, and open the **Execution log**. It lists every tab and where it
   would go. Nothing is copied.
4. Pick **installTriggers**, click **Run**, and approve the permissions. Google
   will say the app is unverified; click **Advanced → Go to project**. This
   step sets up the triggers and copies everything so far.

The Google account that does this needs edit access to the upload files.

## Notes

- Add new rows at the **bottom** of a tab. The script remembers how many rows
  it has copied from each tab. If you insert a row in the middle, the last row
  gets copied instead. Edits to rows that were already copied are not synced.
- To rebuild from scratch: delete the month tabs, run `resetSyncState`, then
  run `syncAll`.
- If you keep more than one year in the same master, set
  `MONTH_FORMAT = 'MMMM yyyy'` to get tab names like "October 2026 Pitch".
- To change which files or tabs are read, edit `EXTRA_SOURCE_IDS`,
  `SOURCE_FILE_NAME`, `SOURCE_FILES_SINCE` or `CAMPAIGN_TAB_PATTERN` at the
  top of the script.
