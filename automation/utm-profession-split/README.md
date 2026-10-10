# UTM leads by profession

`apps-script/ProfessionSplit.gs` reads every tab of the UTM lead spreadsheet.
It copies five columns from each lead into a separate output spreadsheet:

| Name | Email | Phone Number | Profession | UTM Source |
|---|---|---|---|---|

Each lead goes to one tab, based on their profession:

| Tab | Who goes there |
|---|---|
| **Business Profession** | business owner, entrepreneur, founder, self-employed, freelancer, agency, coach, consultant, shop/store, trader... |
| **Job Professional Profession** | job, working professional, employee, salaried, service, corporate, manager, engineer, teacher... |
| **Other Profession** | everything else, including students, homemakers and blank answers (set `OTHER_TAB = ''` to drop them) |

A trigger runs it every 10 minutes, so new registrations show up in the
output on their own.

## Setup (once)

1. Open the UTM lead spreadsheet → **Extensions → Apps Script**. Add a new
   file and paste in `apps-script/ProfessionSplit.gs`.
   - If you put the script anywhere else, set `SOURCE_SPREADSHEET_ID`.
   - To use an output spreadsheet you already have, set
     `OUTPUT_SPREADSHEET_ID`. Leave it blank and the first run creates
     "UTM Leads by Profession" in your Drive. The link appears in the
     Execution log.
2. Select `installTrigger` and click **Run**. Approve the permissions prompt.
   It sets up the 10-minute trigger and fills the output straight away.

## Notes

- Columns are matched by header name (`first_name`/`name`, `email`,
  `phone`/`mobile`, `profession`/`occupation`, `utm_source`). Column order
  doesn't matter. Tabs without an email or phone column are skipped.
- Each lead is added once. A lead counts as a duplicate when the email
  matches, or the phone number matches if there's no email. This applies
  across all source tabs. The script never edits or removes rows already in
  the output.
- To change which words count as business or job, edit `BUSINESS_KEYWORDS` and
  `JOB_KEYWORDS`. Business is checked first. Changed keywords apply only to
  new leads. To re-sort everyone, delete the data rows in the three tabs and
  run `splitLeadsByProfession` once.
- `SKIP_SOURCE_TABS` lists source tabs to ignore, such as a summary tab.
