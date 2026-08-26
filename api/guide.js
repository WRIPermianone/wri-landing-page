/**
 * WRI — First Time Investors Guide request handler (Vercel Serverless Function)
 * Endpoint: /api/guide  (auto-created from api/guide.js by Vercel)
 *
 * Flow:
 *   1. Receive the guide-request form submission (application/x-www-form-urlencoded).
 *      The body parser preserves repeated keys (e.g. multi-select "goals") as arrays.
 *   2. Create / update a GoHighLevel contact (contacts/upsert) + add the
 *      "WRI Guide Lead" tag (contacts/{id}/tags).
 *   3. Attach a note containing the full submission to the contact so every
 *      field is visible from the contact record.
 *   4. Forward the full submission to FormSubmit so the team gets the lead email
 *      AND the investor receives the guide-delivery autoresponse.
 *   5. Redirect the visitor to the guide download page (allowlisted URLs only).
 *
 * Required Vercel env vars (shared with /api/lead):
 *   GHL_API_KEY      — GoHighLevel Private Access Token (contacts.write)
 *   GHL_LOCATION_ID  — GoHighLevel sub-account / location ID
 *
 * If the env vars are missing, the form still works (FormSubmit + redirect);
 * the GHL steps are simply skipped and the error is logged.
 */

const GHL_API = 'https://services.leadconnectorhq.com';
const FORMSUBMIT_URL = 'https://formsubmit.co/info@warriorraceinvestments.com';
const GUIDE_DOWNLOAD_URL = 'https://wripermianone.github.io/wri-landing-page/guide-download.html';
const LEAD_TAG = 'WRI Guide Lead';

// Allowlist of safe redirect destinations to prevent open redirect.
const ALLOWED_NEXT = [
  /^https:\/\/wripermianone\.github\.io\/wri-landing-page\//,
  /^https:\/\/warriorraceinvestments\.com\//,
];

function safeNext(value) {
  const v = (value || '').toString().trim();
  if (!v) return GUIDE_DOWNLOAD_URL;
  if (ALLOWED_NEXT.some((re) => re.test(v))) return v;
  return GUIDE_DOWNLOAD_URL;
}

function parseBody(req) {
  return new Promise((resolve) => {
    const fromRaw = (raw) => {
      const out = {};
      const params = new URLSearchParams(raw);
      for (const key of params.keys()) {
        const values = params.getAll(key);
        out[key] = values.length > 1 ? values : values[0];
      }
      return out;
    };

    if (typeof req.body === 'string' && req.body.length) {
      try { resolve(fromRaw(req.body)); return; } catch (e) {}
    }
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
      resolve(req.body);
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const ct = (req.headers['content-type'] || '').toLowerCase();
      let data = {};
      try {
        if (ct.includes('application/json')) data = JSON.parse(raw);
        else data = fromRaw(raw);
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

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
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
    source: 'WRI Investor Guide Request',
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

async function addContactNote(contactId, noteBody) {
  const token = process.env.GHL_API_KEY;
  if (!token || !contactId || !noteBody) return { ok: false, skipped: true };

  try {
    const res = await fetch(`${GHL_API}/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
        Accept: 'application/json',
      },
      body: JSON.stringify({ body: noteBody }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, error: res.ok ? null : (json.message || `HTTP ${res.status}`) };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

function buildGuideNote(fields) {
  const first = (fields.first_name || '').toString().trim();
  const last = (fields.last_name || '').toString().trim();
  const goals = asArray(fields.goals);
  const lines = [
    'WRI — First Time Investors Guide Request',
    'Submitted: ' + new Date().toISOString(),
    '',
    'Name: ' + first + ' ' + last,
    'Email: ' + (fields.email || '').toString().trim(),
    'Phone: ' + (fields.phone || '').toString().trim(),
    'Accredited investor: ' + (fields.accredited || ''),
    'Primary investment goals: ' + (goals.length ? goals.join(', ') : '(none)'),
    'Wants a call to review opportunities: ' + (fields.schedule_call || ''),
    'Source: WRI Investor Guide Request',
  ];
  return lines.join('\n');
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

  // Honeypot: silently redirect bots to the download page.
  if (fields._honey) {
    res.statusCode = 302;
    res.setHeader('Location', safeNext(fields._next));
    return res.end();
  }

  // 1. Create / update GHL contact + tag.
  const ghlResult = await withTimeout(createGhlContact(fields), 12000);

  // 2. Attach note with the full submission.
  let noteResult = { skipped: true };
  if (ghlResult.contactId) {
    noteResult = await withTimeout(addContactNote(ghlResult.contactId, buildGuideNote(fields)), 12000);
  }

  // 3. Forward to FormSubmit (team email + investor autoresponse).
  const fsResult = await withTimeout(forwardToFormSubmit(fields), 12000);

  console.log('[wri-guide] GHL contact:', JSON.stringify(ghlResult));
  console.log('[wri-guide] GHL note:', JSON.stringify(noteResult));
  console.log('[wri-guide] FormSubmit:', JSON.stringify(fsResult));

  res.statusCode = 302;
  res.setHeader('Location', safeNext(fields._next));
  res.end();
};
