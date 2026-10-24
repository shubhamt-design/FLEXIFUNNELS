# Webinar Broadcast Scorecard

A team dashboard for every WhatsApp broadcast in the
[AiSensy Broadcast Analytics](https://docs.google.com/spreadsheets/d/1jXnQPQngi-FbEBBHC0tvaOTXxmtE5_miv6Mq0rTbmLQ/edit)
sheet. It shows which messages to send again, use more, fix or stop, and when
to send them.

```
Code.gs      Apps Script server: serves the page and reads the two sheet tabs
Index.html   the whole dashboard (analysis runs in the browser)
```

The same `Index.html` also runs as a private claude.ai page, where it reads the
sheet through the Google Sheets connector.

## What's in it

| Tab | What it answers |
|---|---|
| **Decisions** | One card per message (all the times it was sent), with a verdict: **Use more**, **Keep sending**, **Improve** (with the reason: opened less, or read but not clicked) or **Remove**. Each card shows the send dates and times, delivered, read rate, click rate, click-to-read, cost per click, clicks vs similar sends, confidence and the full message text. |
| **Plan check** | Each session against its playbook: which planned messages went out, on time, to the full list, with the planned copy (flags: not sent, different message, late, small audience). Also lists mistakes found in the playbook docs and checks every sent message against the team's non-negotiables (space around links, missing links, unfilled placeholders, wrong date or AM/PM). |
| **Suggestions** | A prioritised to-do list (messages to stop, messages to reuse, better send hours, cold-list cost, weak live reminders, failing lists). Also: click rate by hour before the webinar, the live window by minute, day of week, which message elements go with more clicks, cost per click by campaign and list, and a slot-by-slot plan for the next Tuesday, Wednesday and Sunday webinar. |
| **All broadcasts** | Filters by date (Since 1 Aug, last 30/7 days, custom), campaign and text. Totals, clicks and spend per week, a by-campaign table and a sortable list of every broadcast. |
| **Tuesday / Wednesday / Sunday** | Your schedule slots by session, as a heat grid (click rate, vs similar, clicks or read rate). |

### How verdicts are worked out

- Messages that ask people to **reply** (the 2 PM “Reply INCOME” message, the next-day “share the reason” message) are judged on reply rate against other reply messages, not on clicks.

- Sends of nearly the same text (dates and names ignored) are grouped as one message.
- Each send is compared with **similar sends**: same campaign, same timing
  (1+ days before, webinar morning, 1–6 h before, final hour, during live,
  next day) and same list size (registered vs 5,000+). "+40% vs similar" means
  40% more clicks than those sends would predict.
- **Use more:** 25%+ above similar with solid evidence. **Keep sending:**
  within 10% of similar, or better. **Improve:** below similar. **Remove:** 40%+
  below with solid evidence, or no clicks where several were expected.
  **Not enough data:** under 300 delivered.
- Confidence comes from how many clicks were expected. Few expected clicks
  means low confidence.

The more history the sheet has, the sharper the verdicts get. Data from 1 Aug
onwards shows up automatically once it is in the two tabs.

## Set it up for the team (about 5 minutes, once)

Do this signed in as **arman@flexifunnels.com**, or any FlexiFunnels account
that can open the AiSensy Broadcast Analytics sheet.

1. Go to <https://script.google.com> and click **New project**. Rename it
   *Webinar Broadcast Scorecard*.
2. In `Code.gs`, delete everything and paste the contents of [`Code.gs`](Code.gs).
3. Click **+** next to *Files* → **HTML**, name it `Index` (no `.html`), delete
   what's there and paste the contents of [`Index.html`](Index.html).
4. Click **Save**, then **Deploy → New deployment**. Click the gear icon,
   choose **Web app**, and set:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone within FlexiFunnels**
5. Click **Deploy**, approve the permissions (it asks to read your
   spreadsheets), and copy the **Web app URL**. That's the team link.

Viewers only need a FlexiFunnels Google login. They don't need access to the
sheet, because the script reads it as you.

The page reloads its data every 15 minutes while open, and has a **Refresh**
button. The server caches the sheet for 5 minutes.

### Updating the dashboard later

Paste the new `Index.html` (and `Code.gs` if it changed), then
**Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**.
The URL stays the same.

## Playbooks

The Tuesday, Wednesday and Sunday communication docs are built into `Index.html`
as `PLAYBOOKS` (the same data is in [`playbooks.js`](playbooks.js) for reference).
Each slot has its time, template, audience, goal (click or reply) and planned
copy. When a playbook changes, update that block and redeploy.

## Data it expects

The two tabs the AiSensy sync already fills:

- **Broadcast Analysis:** Campaign ID, Campaign Name, Audience Size, Sent,
  Delivered, Read, Failed, Actual Cost, Last Updated, Sent At (IST), Webinar
  Start (inferred), Data Status, Data Check, Clicked, Replied. Columns are
  matched by header name, so order doesn't matter.
- **Broadcast Contents:** Campaign ID, Campaign Name, Date and Time (IST),
  Message Content.
