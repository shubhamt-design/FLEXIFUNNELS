# Flexi Genie weekly workshop swap: run playbook

This is the exact instruction set the scheduled Claude routine runs.
It is safe to run any number of times: every step compares the live state
with the target and only changes what differs.

## Fixed targets

| What | Where |
|---|---|
| Inputs sheet | Google Drive file id `120U4NUfrQgW-THHAZNzy10hkHXD1qLuh0JSVTEh2xYs` ("Flexi Genie Weekly Workshop – Automation Inputs") |
| FlexiFunnels project | "Funnel Builder Agent Launch Promo" |
| Form page A | `https://sb.flexifunnels.com/funnel-agent` ← webhook column G |
| Form page B | `https://sb.flexifunnels.com/flexi-genie-regteam` ← webhook column H |
| Thank-you pages (WhatsApp link) | `https://sb.flexifunnels.com/funnel-agent-ty`, `https://sb.flexifunnels.com/flexi-genie-ty` |
| Zoom redirect page | `https://sb.flexifunnels.com/genie-demo` |
| ActiveCampaign connection | "SB - Active Campaign" (user_email_service_id 950) |

## Steps

1. **Pick this week's row.** Read the inputs sheet with Google Drive
   `read_file_content`. Take the row with the latest *Run date* that is on or
   before today in India time (Asia/Kolkata). If there is no such row, stop and
   report "nothing scheduled".
   Inputs: tab names (B, C), Zoom link (D), ActiveCampaign list name (E),
   WhatsApp link (F), webhooks (G, H), tab status (I).
   Before using D and F, check that D starts with `https://` and contains
   `zoom.us/`, and that F starts with `https://chat.whatsapp.com/`. If a
   value fails its check, skip that step and report it.

2. **Form webhooks.** If G or H is empty, or I starts with `ERROR`, skip this
   step and report that the sheet tabs are not ready yet. Otherwise, for each
   form page (A→G, B→H):
   - `get_form_autoresponders(step_url)` → the page's `forms_on_page`.
   - `get_webhooks(project_code)` → find the rows for this `step_url`.
   - For every form id in `forms_on_page` whose webhook URL is not already the
     target, call `connect_form_to_webhook(step_url, form_id, webhook_url,
     webhook_name = <tab name from B or C>)`. Call it once without
     `confirm_edit` to preview, then again with `confirm_edit=true`.

3. **ActiveCampaign list.** Call `get_autoresponder_lists(step_url = page A,
   form_id, user_email_service_id = 950, search = <E>)`. Continue only if
   exactly one list name equals E. Compare ignoring case and extra spaces.
   If there is no match, or more than one, skip this step and report it.
   Do not create lists and do not guess.
   For each form on pages A and B whose existing connection has a different
   `list_id`, call `connect_form_to_autoresponder(step_url, form_id,
   user_email_service_id = 950, list_id)`. Leave tags unchanged.

4. **WhatsApp link on both thank-you pages.** For each TY page:
   `get_page_html(step_url, find = "chat.whatsapp.com/")` → note every
   distinct `https://chat.whatsapp.com/...` URL in the page. For each one that
   is not F, call `update_agentic_page(step_url, replace_find = <old url>,
   replace_with = F, expect_count = <times it appears>)`. Preview first, then
   send with `confirm_edit=true`.

5. **Zoom link on the redirect page.** `get_page_html(step_url = genie-demo)`.
   The page holds the same Zoom URL 3 times: meta refresh, fallback link and
   `window.location.replace`. If that URL is not D, call
   `update_agentic_page(replace_find = <old url>, replace_with = D,
   expect_count = 3)`. Preview first, then send with `confirm_edit=true`.
   If the count is not 3, stop and report. Do not rewrite the page.

6. **Verify.** Read back the four edited pages with `get_page_html`
   (use `find`) and read the webhooks and list connections again. Confirm
   every target value is live. If a saved page shows as not published, run
   `publish_page(step_url)`, preview first, then send with `confirm_publish=true`.

7. **Report.** End with a short table. For each item (webhook A, webhook B,
   AC list A/B, WhatsApp on each TY page, Zoom) show one of: changed
   (old → new), already correct, or skipped (why).

## Rules

- Never edit any page, form or list other than the ones above.
- Never send a whole-page `html` replacement. Only use `replace_find` snippets.
- Never pick an ActiveCampaign list that doesn't match the name exactly.
- Stop an item on anything unexpected, such as a form count that changed
  or a snippet not found. Report it and move on to the next item. Do not
  improvise.
