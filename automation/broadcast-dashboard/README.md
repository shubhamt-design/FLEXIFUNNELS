# FlexiFunnels Broadcast Performance Dashboard

A web dashboard for logging every WhatsApp (or other channel) broadcast and
seeing how it performed. Google Sheets is the database; Google Apps Script is
the backend and serves the web page.

```
apps-script/
  Code.gs         web app entry, spreadsheet menu, one-time setup, sheet schema
  Config.gs       Dashboard_Config read/write (channels, types, currencies…)
  Broadcasts.gs   server API: load data, save/edit broadcasts, history, campaigns
  Index.html      page layout (tabs, forms, modals)
  Styles.html     styling, light and dark mode
  App.html        client logic: KPIs, charts (Chart.js), tables, forms
  appsscript.json manifest (time zone Asia/Kolkata, V8)
```

## What the team gets

| Tab | What it does |
|---|---|
| **Overview** | 8 total KPI cards (broadcasts sent, audience, delivered, clicks, shares, conversions, spend, revenue), 8 rate cards (delivery rate, CTR, share rate, conversion rate, cost per delivered message, cost per click, cost per conversion, ROI/ROAS), each with the change vs the previous period. Charts: metric over time, engagement funnel, spend vs revenue by campaign, CTR by type/channel/segment. A "Top broadcasts" leaderboard ranked by CTR, clicks, conversions, ROI, lowest cost per click or delivery rate. |
| **Broadcasts** | Every record, searchable and sortable, with derived metrics per row. Click a row for details; **Edit**, **Duplicate as new**, **Add to compare**. Export the filtered list to CSV. |
| **Campaigns** | Totals per campaign with a total row. Click a campaign to set its category, dates, objective and notes, or to rename it. Renaming also updates its broadcasts. |
| **Compare** | Pick 2–4 broadcasts and see them side by side, with the best value in each row highlighted and a chart of their rates. |
| **Settings** | Edit the dropdown options: channels, broadcast types, audience segments, campaign categories, currencies, default currency and channel. |

Filters for period, campaign, channel, type and segment apply to the Overview,
Broadcasts and Campaigns tabs.

### Metric definitions

Performance numbers count only broadcasts with status **Sent**. Drafts and
cancelled broadcasts are listed but don't count.

| Metric | Formula |
|---|---|
| Delivery rate | Delivered ÷ Sent × 100 |
| Click-through rate (CTR) | Clicks ÷ Delivered × 100 |
| Share rate | Shares ÷ Delivered × 100 |
| Conversion rate | Conversions ÷ Clicks × 100 |
| Cost per delivered message | Spend ÷ Delivered |
| Cost per click (CPC) | Spend ÷ Clicks |
| Cost per conversion (CPA) | Spend ÷ Conversions |
| ROI | (Revenue − Spend) ÷ Spend × 100, for broadcasts that have revenue filled in |
| ROAS | Revenue ÷ Spend |

Money totals use the default currency (INR). Broadcasts in another currency are
shown separately ("Plus USD …") and left out of the cost ratios, so currencies
are never added together.

## Data safety

- **Unique IDs.** Each new broadcast gets `BC-00001`, `BC-00002`, …, assigned
  under a script lock. A counter in Script Properties means IDs are never
  reused, even after a row is deleted.
- **No double saves.** Each form submission carries a one-time request ID, so
  a double-click or a retry after a slow network returns the first result.
  A new record with the same name, campaign, channel, segment, date and time as
  an existing one asks for confirmation first.
- **Edits don't duplicate.** Editing updates the same row in place and bumps
  its version. If someone else saved the record after you opened it, your save
  is refused and you're asked to reload, so nobody silently overwrites a
  colleague's edit.
- **History is kept.** Every create and update writes a row to
  `Broadcast_History`: who, when, each field's old → new value, and a JSON
  snapshot of the previous record. The edit form has **View change history**.
- **Validated on the server.** Required fields, valid dates and times, options
  from the configured lists, whole non-negative numbers, delivered ≤ sent,
  sent ≤ audience size, sent broadcasts not in the future and with sent > 0.
  The form runs the same checks first and highlights the fields to fix. The
  success message appears only after the sheet confirms the save.
- **Formula-safe.** Text starting with `=`, `+`, `-` or `@` is stored as plain
  text, never as a formula.
- **Fast.** Each sheet is read once per request with `getValues()`, and each
  save writes one row with one `setValues()` call.

## Sheets created by setup

| Sheet | Contents |
|---|---|
| `Broadcast_Data` | One row per broadcast: ID, name, campaign, date, time, type, segment, channel, message, status, audience, sent, delivered, clicks, shares, conversions, revenue, cost, currency, notes, created at/by, updated at/by, version |
| `Campaigns` | Campaign name, category, start/end date, objective, notes, timestamps. New campaign names typed into the broadcast form are added automatically. |
| `Dashboard_Config` | `Setting / Value / Notes` rows. List settings (Channel, Broadcast Type, Audience Segment, Campaign Category, Currency) have one row per option; Default Currency and Default Channel have one row each. |
| `Broadcast_History` | Audit log of every create and edit. |

Columns are matched by header name, so you can reorder columns or add your own
extra columns without breaking anything. Don't rename the headers.

## Setup (about 10 minutes)

1. **Create the sheet.** Make a new Google Sheet, e.g. *FlexiFunnels Broadcast
   Tracker*.
2. **Add the code.** In the sheet, open **Extensions → Apps Script**. Delete the
   default `Code.gs` contents, then create these files and paste in the
   matching file from `apps-script/`:
   - Script files: `Code`, `Config`, `Broadcasts`
   - HTML files (**+ → HTML**): `Index`, `Styles`, `App`. Use exactly these
     names, without `.html`.
   - Optional: **Project Settings → Show "appsscript.json"** and paste the
     manifest, or just set the time zone to Asia/Kolkata there.
3. **Initialise.** Select `setupSpreadsheet` in the function dropdown, click
   **Run**, and approve the permissions. Re-running it later is safe: it only
   adds what's missing.
4. **Deploy the web app.** **Deploy → New deployment → Web app**:
   - *Execute as:* **Me**. The team doesn't need edit access to the sheet.
   - *Who has access:* **Anyone within flexifunnels.com**. This also lets the
     dashboard record who made each change.
   - Copy the web app URL and share it with the team. It also appears under
     the sheet's **Broadcast Dashboard → Open dashboard** menu.
5. **After code changes**, use **Deploy → Manage deployments → Edit → New
   version** so the same URL serves the new code.

**Standalone project instead of a sheet-bound one?** Add a Script Property
`SPREADSHEET_ID` with the sheet's ID (Project Settings → Script Properties).

## Day-to-day use

- **Log a broadcast:** click **+ New broadcast**. Date, time, channel, currency
  and status (Sent) are pre-filled. As you type the numbers, live chips show
  the delivery rate, CTR, conversion rate, cost per click and ROI.
- **Planning ahead:** save it as **Draft** (metrics optional). Change it to
  **Sent** and add the numbers once it goes out.
- **Fixing a mistake:** open the broadcast and click **Edit**, or edit the
  sheet directly. The dashboard reads the sheet each time it loads; click
  **↻ Refresh** to reload.
- **Recurring broadcasts:** open a past one and click **Duplicate as new**. It
  copies the setup but starts with empty metrics.
- **New dropdown options:** use the **Settings** tab, or add a row to
  `Dashboard_Config`. Removing an option doesn't affect old records, which
  keep their value.
