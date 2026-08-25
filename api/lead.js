/**
 * WRI Permian 1 — Deck Request lead handler (Vercel Serverless Function)
 * Endpoint: /api/lead  (auto-created from api/lead.js by Vercel)
 *
 * Flow:
 *   1. Receive the deck-request form submission (application/x-www-form-urlencoded).
 *   2. Create / update a GoHighLevel contact (contacts/upsert) + add the
 *      "WRI Permian 1 Lead" tag (contacts/{id}/tags).
 *   3. Forward the full submission to FormSubmit so the team still gets the
 *      lead email AND the investor still receives the deck-delivery autoresponse.
 *   4. Redirect the visitor to the thank-you page (or declined page).
 *
 * Required Vercel env vars:
 *   GHL_API_KEY      — GoHighLevel Private Access Token (contacts.write)
 *   GHL_LOCATION_ID  — GoHighLevel sub-account / location ID
 *
 * If the env vars are missing, the form still works (FormSubmit + redirect);
 * the GHL contact step is simply skipped and the error is logged.
 */

const GHL_API = 'https://services.leadconnectorhq.com';
const FORMSUBMIT_URL = 'https://formsubmit.co/info@warriorraceinvestments.com';
const DEFAULT_NEXT = 'https://wripermianone.github.io/wri-landing-page/thank-you.html';
const LEAD_TAG = 'WRI Permian 1 Lead';

function parseBody(req) {
  return new Promise((resolve) => {
    // Vercel usually parses the body into req.body already.
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
      resolve(req.body);
      return;
    }
    if (typeof req.body === 'string' && req.body.length) {
      try { resolve(Object.fromEntries(new URLSearchParams(req.body))); return; } catch (e) {}
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const ct = (req.headers['content-type'] || '').toLowerCase();
      let data = {};
      try {
        if (ct.includes('application/json')) data = JSON.parse(raw);
        else data = Object.fromEntries(new URLSearchParams(raw));
      } catch (e) {
        data = {};
      }
      resolve(data);
    });
    req.on('error', () => resolve({}));
  });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, timedout: true }), ms)),
  ]);
}

async function createGhlContact(fields) {
  const token = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    return { ok: false, skipped: true, error: 'missing GHL_API_KEY / GHL_LOCATION_ID' };
  }

  const first = (fields.first_name || '').toString().trim();
  const last = (fields.last_name || '').toString().trim();
  const email = (fields.email || '').toString().trim();
  const phone = (fields.phone || '').toString().trim();

  const body = {
    locationId,
    firstName: first,
    lastName: last,
    name: (first + ' ' + last).trim(),
    email,
    phone,
    source: 'WRI Permian 1 Landing Page',
  };

  try {
    const res = await fetch(`${GHL_API}/contacts/upsert`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    const contactId =
      (json && json.contact && json.contact.id) || (json && json.id) || null;

    // Add tag without overwriting existing tags (non-blocking).
    if (contactId) {
      try {
        await fetch(`${GHL_API}/contacts/${contactId}/tags`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Version: '2021-07-28',
            Accept: 'application/json',
          },
          body: JSON.stringify({ tags: [LEAD_TAG] }),
        });
      } catch (e) {
        // tag failed — contact was still created
      }
    }
    return {
      ok: res.ok,
      status: res.status,
      contactId,
      error: res.ok ? null : json.message || `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function forwardToFormSubmit(fields) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.append(k, v == null ? '' : v);
  }
  try {
    const res = await fetch(FORMSUBMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end('Method Not Allowed');
  }

  const fields = await parseBody(req);

  // Honeypot: silently redirect bots to the thank-you page.
  if (fields._honey) {
    res.statusCode = 302;
    res.setHeader('Location', fields._next || DEFAULT_NEXT);
    return res.end();
  }

  const ghlResult = await withTimeout(createGhlContact(fields), 12000);
  const fsResult = await withTimeout(forwardToFormSubmit(fields), 12000);

  console.log('[wri-lead] GHL:', JSON.stringify(ghlResult));
  console.log('[wri-lead] FormSubmit:', JSON.stringify(fsResult));

  const nextUrl = (fields._next || DEFAULT_NEXT).toString();
  res.statusCode = 302;
  res.setHeader('Location', nextUrl);
  res.end();
};
