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

The dashboard is built around the **10-minute webinar campaign** (Flexi Genie
“Launch Your Business Online in 10 Minutes”) for the Tuesday, Wednesday and
Sunday webinars. Every broadcast is matched to its webinar session (including
moved days), its schedule slot, and the doc message it came from, which gives
its template name.

| Tab | What it answers |
|---|---|
| **Overview** | Campaign spend, clicks, cost per click and spend per session/week; how much was spent on clicks costing more than the campaign average; a ranked “What to change” list with the ₹ saved per webinar or per week; spend share vs click share for each part of the campaign (day before, webinar morning, 1–6 h before, final hour, live window, follow-ups, reply messages, big old-list pushes); and each session’s spend, clicks and cost per click. |
| **Slot verdicts** | For every Tuesday, Wednesday and Sunday slot: keep (top slot), keep, keep the slot but use the better message, improve the message, or cut, with sends, usual send time and delay, cost per send, clicks per send, click rate, cost per click, clicks vs similar sends, and what cutting it saves and loses per webinar. Includes the live-window analysis (which 5–10 minute reminders earn their cost), a suggested schedule for the next webinar, and a session-by-session heat grid. |
| **Messages** | One card per doc message (with template names and doc slots) or off-doc message: verdict, sends, clicks, click rate, spend, cost per click, clicks vs similar, best send, every send and the full text. Reply messages are judged on replies. |
| **Timing** | The effect of sending late (before live and in the live window), minutes late vs result, the same slot at different times, the best hour by stage (click rate and cost per click), and 10 AM vs 12 PM. |
| **Schedule check** | Each session against its schedule (sent, on time, full list; moved days and clashing slots handled) and the team's non-negotiables checked on every sent message. |
| **Broadcasts** | Every campaign broadcast with session, slot, doc message and template, audience, delivered, read rate, clicks, click rate, cost, cost per click, spend above average and vs similar. Filter by webinar, session, part of the campaign or text; optionally include other campaigns. |
| **Other campaigns** | Faceless, community workshop, 15 Days challenge, Genie launch offer, renewals and others, for reference. |

### How verdicts are worked out

- **Spent above average** = a broadcast's cost minus its clicks × the campaign's average cost per click.
- **Slot verdicts** need at least two sessions before suggesting a cut (unless the evidence is very strong); one-session verdicts say so.
- A **live-window reminder** is suggested for dropping when its cost per click is 40%+ above the live-window average and it does worse than similar sends, across 2+ sessions.

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
as `PLAYBOOKS` (the same data is in [`playbooks.js`](playbooks.js)). They are a
reference, not templates: the team edits copy and adds links at send time, and
AiSensy is the record of what was sent. The dashboard uses them for each slot's
time, purpose, audience and goal (click or reply), and to help match sends to
slots. When the schedule changes, update that block and redeploy.

## Data it expects

The two tabs the AiSensy sync already fills:

- **Broadcast Analysis:** Campaign ID, Campaign Name, Audience Size, Sent,
  Delivered, Read, Failed, Actual Cost, Last Updated, Sent At (IST), Webinar
  Start (inferred), Data Status, Data Check, Clicked, Replied. Columns are
  matched by header name, so order doesn't matter.
- **Broadcast Contents:** Campaign ID, Campaign Name, Date and Time (IST),
  Message Content.
