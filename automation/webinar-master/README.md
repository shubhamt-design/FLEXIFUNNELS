# Webinar campaign master sheet

This script keeps one master spreadsheet for a campaign. It has three tabs per
month:

| Month | Tabs |
|---|---|
| October | `October Pitch`, `October Non-pitch`, `October Missed` |
| November | `November Pitch`, `November Non-pitch`, `November Missed` |

The script is `apps-script/MonthlyMaster.gs`.

## What it does

1. It reads the three source spreadsheets (Pitch, Non-pitch, Missed). In each
   one it only pulls tabs whose **name contains your keyword**. Other tabs are
   ignored.
2. **First run:** it pulls every row from every matching tab.
3. **After that:** it only appends what's new. On 2 Oct you fill in that
   session's tab and its rows go to `October Pitch`. On 6 Oct you add the next
   session's tab, and its rows go to the bottom of the same `October Pitch`
   tab. Rows added later to an older tab are appended as well. Nothing is
   copied twice.
4. **Month:** it reads the date from the tab name. These formats all work:
   `2 Oct`, `6th October`, `Oct 6`, `06/10` (day first), `2026-10-06`. If a tab
   name has no date, the tab goes into the month the script first saw it.
5. **Columns** are matched by header name, so the column order in the source
   tabs doesn't matter. If a header is new, it's added as a new column.
6. Two columns are added at the front of each row: `Session tab` (which tab the
   row came from) and `Synced at`. Each run is also recorded in a `Sync log`
   tab.

**When it runs:** right after any edit or new tab in a source spreadsheet. A
15-minute timer also runs, to catch rows that forms or Zapier write, since
those don't fire the edit trigger.

## One-time setup

1. Create the master spreadsheet. Open **Extensions → Apps Script** and paste
   in `MonthlyMaster.gs`.
2. At the top of the file, fill in `SOURCES`:
   - `spreadsheetId`: the long id in each source sheet's URL
     (`docs.google.com/spreadsheets/d/<THIS PART>/edit`).
   - `keywords`: a tab is pulled if its name contains any of these. Case
     doesn't matter.
   - `exclude`: skip tabs whose names contain these words. For example,
     `non` stops "Non pitch" tabs from being pulled as Pitch.
3. Optional: run `previewMatches` and check **Execution log**. It lists every
   tab, whether it would be pulled, and which month it would go into. Nothing
   is copied.
4. Run `installTriggers` once and approve the permissions. This sets up the
   triggers and runs the first full pull.

## Notes

- Add rows to the **bottom** of a source tab. The script remembers how many
  rows it has copied from each tab. If you insert a row in the middle, the
  last row gets copied instead, not the inserted one. Edits to rows that were
  already copied are not synced.
- To rebuild from scratch: delete the month tabs, run `resetSyncState`, then
  run `syncAll`.
- If you keep more than one year in the same master, set
  `MONTH_FORMAT = 'MMMM yyyy'` to get tab names like "October 2026 Pitch".
