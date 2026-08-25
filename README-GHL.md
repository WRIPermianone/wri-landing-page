# WRI Permian 1 — GoHighLevel Lead Integration

Turns "Request the Deck" form submissions into GoHighLevel contacts while
preserving the existing FormSubmit email + investor deck-delivery flow.

## How it works

```
Visitor submits #deckForm
  → POST /api/lead  (this Vercel function)
     1. Create / update GoHighLevel contact  (contacts/upsert)
     2. Add tag "WRI Permian 1 Lead"        (contacts/{id}/tags)
     3. Forward full submission to FormSubmit (team email + investor autoresponse)
  → Redirect to materials.html (or request-received.html)
```

If GoHighLevel is unreachable or the env vars aren't set yet, the form still
works — FormSubmit + redirect run regardless, so no leads are lost.

## Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project**.
2. Import the `WRIPermianone/wri-landing-page` GitHub repo.
3. Vercel auto-detects the static site + the `api/lead.js` serverless function.
4. Under **Environment Variables**, add:
   - `GHL_API_KEY` = your GoHighLevel Private Access Token
   - `GHL_LOCATION_ID` = your GoHighLevel location/sub-account ID
5. Deploy. Your site URL will be `https://<your-project>.vercel.app`.

## Getting the GoHighLevel values

**Private Access Token (`GHL_API_KEY`):**
- Log into GoHighLevel → click your profile avatar (bottom-left) → **Profile**.
- Scroll to **API** / **Private Access Token** → **Generate**.
- Name it `WRI Permian 1`. Enable the **Contacts** scope (write).
- Copy the token (starts with `pit-`).

**Location ID (`GHL_LOCATION_ID`):**
- In your sub-account, the location ID is in the URL when you open Contacts or
  Settings, or under **Settings → Business Info**. It looks like a short
  alphanumeric string (e.g. `ve9EPM428h8vShlRW1KT`).

## After deploy

Tell Computer the Vercel project URL (or project name) so it can point the
form's `action` at `https://<your-project>.vercel.app/api/lead` and run a live
test submission.
