# UTM leads by profession

`apps-script/ProfessionSplit.gs` reads every tab of the UTM lead spreadsheet.
It copies five columns from each lead into a separate output spreadsheet:

| Name | Email | Phone Number | Profession | UTM Source |
|---|---|---|---|---|

Each lead goes to one tab, based on their profession:

| Tab | Form answers |
|---|---|
| **Business Profession** | Business Owner, Local Business Owner, Agency Owner, E-Commerce, Coach or Trainer, Freelancer/Service Provider, Consultant |
| **Job Professional Profession** | Job Professional, Doctor |
| **Other Profession** | Student, No Job or Business (Fresher), Other, blank (set `OTHER_TAB = ''` to drop them) |

It also makes one tab per profession answer ("Business Owner", "Agency
Owner", "Job Professional", "Student", ... and "Not Specified" for blanks).
Set `TAB_PER_PROFESSION = false` to keep only the three group tabs.

Answers not in that list go by keyword (`OTHER_KEYWORDS`, then
`BUSINESS_KEYWORDS`, then `JOB_KEYWORDS`).

Source: [August 2026 UTM](https://docs.google.com/spreadsheets/d/1M-1GJ_W6xyTehUH_o_uikYy49rp-SP_WUsxmBNNR_Wo/edit)
(`SOURCE_SPREADSHEET_ID`). The Reg team tabs have no `utm_source` column, so
for those tabs the UTM source is read from the `?utm_source=` part of
`source_url`. If the link has no UTM, the cell is left blank.

A trigger runs it every 10 minutes, so new registrations show up in the
output on their own.

## Setup (once)

1. Open the UTM lead spreadsheet → **Extensions → Apps Script**. Add a new
   file and paste in `apps-script/ProfessionSplit.gs`.
   - `SOURCE_SPREADSHEET_ID` already points at August 2026 UTM. Change it
     when you move to a new month's spreadsheet.
   - To use an output spreadsheet you already have, set
     `OUTPUT_SPREADSHEET_ID`. Leave it blank and the first run creates
     "UTM Leads by Profession" in your Drive. The link appears in the
     Execution log.
2. Select `installProfessionSplitTrigger` and click **Run**. Approve the permissions prompt.
   It sets up the 10-minute trigger and fills the output straight away.

## Notes

- Columns are matched by header name (`first_name`/`name`, `email`,
  `phone`/`mobile`, `profession`/`occupation`, `utm_source`). Column order
  doesn't matter. Tabs without an email or phone column are skipped.
- Every run rebuilds all output tabs from scratch, so don't edit them by
  hand. The Execution log shows the output link and the lead count per tab.
- Each lead appears once. A lead counts as a duplicate when the email
  matches, or the phone number matches if there's no email. This applies
  across all source tabs.
- Test leads with a `@flexifunnels.com` email are skipped
  (`SKIP_EMAIL_DOMAINS`).
- If someone registers twice with different answers, their first answer
  decides the tab.
- To change which tab an answer goes to, edit `PROFESSION_MAP`. The next run re-sorts everyone.
- `SKIP_SOURCE_TABS` lists source tabs to ignore, such as a summary tab.
