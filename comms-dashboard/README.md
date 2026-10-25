# 10 Min Build Comms Desk

A one-click copy dashboard for the 10-minute webinar communications (Sunday
11 AM, Tuesday 7:30 PM, Wednesday 7:30 PM). It reads the
[10 MIN BUILD — EVERGREEN COMMUNICATION DOC](https://docs.google.com/document/d/1e3hpy1vHhPaOzVsAebLvP6UMuDltdBaQIa8MFuxdKfY/edit)
and shows every message as a card you can copy straight into WhatsApp or AiSensy.

## What it fixes

| Problem when copying from the Google Doc | What the dashboard does |
|---|---|
| Bold text is lost when pasted into WhatsApp / AiSensy | Converts doc bold to WhatsApp `*bold*`. Where someone already typed asterisks, it doesn't add a second pair. |
| AiSensy parameters have to be picked out of `[ ... ]` by hand | Lists each parameter as `{{1}}`, `{{2}}`… in order. Each has its own **Copy** button and is flattened to one line, since WhatsApp rejects line breaks in parameters. |
| Template names are typed by hand | Every template name (some messages have 2–3) gets its own **Copy** button. |
| Images copied or downloaded from the doc lose quality | Original files are pulled from Drive byte-for-byte (`media/`). **Copy image** puts the full-resolution image on the clipboard, ready to paste into WhatsApp Web. |
| Links break when there's no space around them | Every link gets a space before and after automatically. |
| Dates/times have to be edited in every message | Enter the webinar date, time, Zoom ID, count and joining link once at the top. Every `{{DATE}}`, `[TIME]`, `{{COUNT}}`… is filled in when you copy. Blanks that are still empty show in red. |

Extras:
- **Paste & format** tab: paste any part of the doc (including new messages
  that aren't in the dashboard yet) and get WhatsApp-ready text back.
- Polls are split into the question and each option, so you can fill the
  WhatsApp poll form quickly.
- A **Sent today** tick on each card (saved in your browser only) so you can
  see what's still pending.
- Search across all schedules by template name, time or any word.
- Videos and call recordings are too large to copy to the clipboard. Their
  **Download original** button fetches the untouched file from Drive.

> WhatsApp compresses pasted images unless you tap **HD** before sending.
> The dashboard gives WhatsApp the original; choose HD to keep it that way.

## Updating the content

The doc stays the source of truth. Keep editing it as you do today.

**Quick (only your browser):** in the doc, *File → Download → Markdown (.md)*,
then click **Load updated doc** at the bottom of the left menu.

**For everyone (updates the shared dashboard):**

```bash
# 1. Download the doc as Markdown, then:
python3 tools/build_content.py ~/Downloads/10\ MIN\ BUILD.md
# 2. If new images were added to the doc, download them from Drive into media/
#    as <drive-file-id>.png / .jpg and add an entry in source/media.json.
# 3. Commit, push, and republish the page (or ask Claude to do it).
```

Media that isn't in `media/` still shows with **Download original** and
**Open in Drive** links. Those always give the original quality.

## How the doc is read

`parser.js` follows the conventions the doc already uses:

- `# Heading` starts a schedule (e.g. *Tuesday 1daygap 7:30 PM-Aisensy*).
- `-----` / `____` lines and time lines (`10 AM`, `Webinar Day - 7:25 PM`,
  `🕗 8:00 PM — Pre-session video`) start a new message.
- `Template - …`, `Audience - …` and Drive links are lifted out of the
  message body into their own rows.
- A message with a template is an **AiSensy broadcast**, and its `[ … ]`
  parts are the parameters. A message without one is a **community** message.
- A line that says `Poll`, or a time line that mentions a poll, turns the
  lines after it into a WhatsApp poll.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page (styles + layout) |
| `app.js` | Cards, copy buttons, search, paste formatter |
| `parser.js` | Doc → messages, WhatsApp formatting rules |
| `content.js` | Generated: the doc text + media index bundled for the page |
| `source/doc.md` | The doc export the current build is based on |
| `source/media.json` | Drive file id → title / type for every media link in the doc |
| `media/` | Original-quality images downloaded from Drive |
| `tools/build_content.py` | Rebuilds `content.js` from a fresh doc export |

To run it locally: `python3 -m http.server` in this folder, then open
<http://localhost:8000>. Image copy needs the page served over http(s),
not opened as a file.
