# AiSensy campaign dashboard: daily sync playbook

The scheduled Claude routine runs these steps each morning. They fill the
hosted dashboard at <https://claude.ai/artifact/1Qz4rdddn5vtzYVDBPDmPo>.

## Status

Not live yet. Two things have to be set up first:

1. **Network access.** Add `backend.aisensy.com` to the cloud environment's
   allowed domains (environment settings → Network access).
2. **API key.** Store the AiSensy Project API key as the environment secret
   `AISENSY_API_KEY`. Never paste it into a chat or commit it.

After that, a one-off test call checks which AiSensy Project API calls
return campaign stats. Step 2 below gets filled in from that test. Then the
routine is created.

## Data shape

The dashboard reads one JSON file: an array with one row per broadcast per
day.

| Field | Type | Meaning |
|---|---|---|
| `day` | `YYYY-MM-DD` (IST) | The day the broadcast went out |
| `campaign` | text | Campaign or broadcast name as AiSensy shows it |
| `sent` | number | Messages submitted |
| `delivered` | number | Delivered to the handset |
| `read` | number | Read (blue ticks) |
| `replied` | number | Recipients who replied |
| `clicked` | number | CTA/link clicks (needs click tracking on the template) |
| `failed` | number | Failed to deliver |
| `cost` | number | Charge in rupees |

`day` + `campaign` must be unique. If AiSensy repeats a name on the same
day, add a suffix, e.g. `name (2)`.

The dashboard works out all rates (delivery %, read %, click %) and the
daily totals itself, so the file holds only raw counts.

## Steps

1. **Load the existing rows.** Download the dashboard's current
   `aisensy-broadcasts.json` (dataset `broadcasts`).
2. **Fetch from AiSensy.** Using `AISENSY_API_KEY`, fetch every campaign
   that sent between yesterday and 3 days ago (IST), with its counts and
   cost. The window overlaps earlier runs because late delivery and read
   receipts keep updating for a few days. *(Endpoints to be filled in after
   the API test.)*
3. **Merge.** Replace the rows for each `day` + `campaign` in the window
   with the fresh numbers. Keep every other row unchanged.
4. **Publish.** Upload the merged file as a new asset on the dashboard.
   Then update dataset `broadcasts` with the new `url`, `name`, and
   `updated: {at, by: "Claude"}`, plus `lastAttempt: {at, ok: true, by}`.
5. **On failure,** write only `lastAttempt: {at, ok: false, error, by}`.
   The error should say what failed and how to fix it, e.g. "AiSensy
   refused the API key, regenerate it in AiSensy and update
   AISENSY_API_KEY". Then stop. Never write partial or guessed numbers.
6. **Report.** Send a short summary covering yesterday's sent, delivered %,
   read %, clicks and cost. Also list any broadcast under 80% delivery.

## Rules

- Never invent or estimate a number. If a field is missing from AiSensy's
  answer, leave the row out and report it.
- Don't store recipient phone numbers or names. Keep only the per-campaign
  counts.
