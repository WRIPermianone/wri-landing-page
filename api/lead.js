/**
 * WRI Permian 1 — Deck Request lead handler (Vercel Serverless Function)
 * Endpoint: /api/lead  (auto-created from api/lead.js by Vercel)
 *
 * Flow:
 *   1. Receive the deck-request form submission (application/x-www-form-urlencoded).
 *      NOTE: the body parser preserves repeated keys (e.g. multi-select "goals")
 *      as arrays so checkbox selections are not collapsed.
 *   2. Create / update a GoHighLevel contact (contacts/upsert) + add the
 *      "WRI Permian 1 Lead" tag (contacts/{id}/tags).
 *   3. A GoHighLevel workflow automatically creates an Opportunity in the
 *      "WRI Permian 1" pipeline (New Lead stage) the moment a contact is
 *      tagged. This function FINDS that opportunity and UPDATES it with the
 *      prospect's investment size (monetaryValue) and a clean title, and
 *      attaches a note containing the full submission to the contact so every
 *      field is visible from the opportunity. (GHL blocks duplicate
 *      opportunities per contact, so we never create one ourselves.)
 *   4. Forward the full submission to FormSubmit so the team still gets the
 *      lead email AND the investor still receives the deck-delivery autoresponse.
 *   5. Redirect the visitor to the thank-you page (or declined page).
 *
 * Required Vercel env vars:
 *   GHL_API_KEY      — GoHighLevel Private Access Token (contacts.write, opportunities.write)
 *   GHL_LOCATION_ID  — GoHighLevel sub-account / location ID
 *
 * If the env vars are missing, the form still works (FormSubmit + redirect);
 * the GHL steps are simply skipped and the error is logged.
 */

const GHL_API = 'https://services.leadconnectorhq.com';
const FORMSUBMIT_URL = 'https://formsubmit.co/info@warriorraceinvestments.com';
const DEFAULT_NEXT = 'https://wripermianone.github.io/wri-landing-page/thank-you.html';
const LEAD_TAG = 'WRI Permian 1 Lead';
const WRI_PIPELINE_STAGE_ID = 'dc5aeae8-d093-4b82-8a62-4a61d3fffc2a'; // WRI Permian 1 -> New Lead

function parseBody(req) {
  return new Promise((resolve) => {
    // Vercel usually parses the body into req.body already, but it may collapse
    // repeated keys. Re-parse the raw string ourselves to preserve arrays.
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
      // If Vercel already gave us an object, normalize any field that was
      // sent multiple times but stringified back to a comma list.
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  // FormSubmit / URLSearchParams sometimes joins multi-values with ", "
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

function parseInvestmentSize(v) {
  // e.g. "$100K–$250K" -> 100000 ; "$250K+" -> 250000
  const s = String(v || '');
  const m = s.match(/\$\s*(\d[\d,.]*)\s*K/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/[,]/g, '')) * 1000;
  return isNaN(num) ? null : num;
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

/**
 * Find the open opportunity GHL's workflow auto-created for this contact.
 * GET /opportunities/search uses snake_case query params (location_id, contact_id).
 */
async function findOpportunity(contactId) {
  const token = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId || !contactId) return { ok: false, skipped: true };

  try {
    const qs = new URLSearchParams({ location_id: locationId, contact_id: contactId, limit: 5 });
    const res = await fetch(`${GHL_API}/opportunities/search?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    const opps = (json && json.opportunities) || [];
    const open = opps.find((o) => o.status === 'open') || opps[0] || null;
    return { ok: res.ok, status: res.status, opportunityId: open && open.id, opportunity: open };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

/**
 * Update the existing opportunity. PUT /opportunities/{id} accepts
 * { name, monetaryValue, pipelineStageId, status } — NOT title, NOT locationId.
 */
async function updateOpportunity(opportunityId, name, monetaryValue) {
  const token = process.env.GHL_API_KEY;
  if (!token || !opportunityId) return { ok: false, skipped: true };

  const body = {
    name,
    pipelineStageId: WRI_PIPELINE_STAGE_ID,
    status: 'open',
  };
  if (monetaryValue && !isNaN(monetaryValue)) body.monetaryValue = monetaryValue;

  try {
    const res = await fetch(`${GHL_API}/opportunities/${opportunityId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, error: res.ok ? null : (json.message || `HTTP ${res.status}`) };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

/** Attach a note with the full submission to the contact. */
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

function buildSubmissionNote(fields) {
  const first = (fields.first_name || '').toString().trim();
  const last = (fields.last_name || '').toString().trim();
  const goals = asArray(fields.goals);
  const lines = [
    'WRI Permian 1 — Deck Request Submission',
    'Submitted: ' + new Date().toISOString(),
    '',
    'Name: ' + first + ' ' + last,
    'Email: ' + (fields.email || '').toString().trim(),
    'Phone: ' + (fields.phone || '').toString().trim(),
    'Accredited investor: ' + (fields.accredited || ''),
    'Typical investment size: ' + (fields.investment_size || ''),
    'Prior oil & gas experience: ' + (fields.prior_experience || ''),
    'Investment timeline: ' + (fields.timeline || ''),
    'Investment goals: ' + (goals.length ? goals.join(', ') : '(none)'),
    'Wants a call: ' + (fields.wants_call || ''),
    'Source: WRI Permian 1 Landing Page',
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

  // Honeypot: silently redirect bots to the thank-you page.
  if (fields._honey) {
    res.statusCode = 302;
    res.setHeader('Location', fields._next || DEFAULT_NEXT);
    return res.end();
  }

  // 1. Create / update GHL contact + tag.
  const ghlResult = await withTimeout(createGhlContact(fields), 12000);

  // 2. Find the workflow-created opportunity and update it + add a note.
  //    All non-blocking: a failure here must not stop the redirect.
  //    The GHL workflow creates the opportunity asynchronously after the
  //    contact is tagged, so we retry the search a few times with a delay.
  let oppResult = { skipped: true };
  let noteResult = { skipped: true };
  if (ghlResult.contactId) {
    const FIND_ATTEMPTS = 6;
    const FIND_DELAY_MS = 1000;
    for (let i = 0; i < FIND_ATTEMPTS; i += 1) {
      oppResult = await withTimeout(findOpportunity(ghlResult.contactId), 12000);
      if (oppResult.opportunityId) break;
      await sleep(FIND_DELAY_MS);
    }
    if (oppResult.opportunityId) {
      const first = (fields.first_name || '').toString().trim();
      const last = (fields.last_name || '').toString().trim();
      const oppName = 'WRI Permian 1 — ' + first + ' ' + last;
      const monetaryValue = parseInvestmentSize(fields.investment_size);
      const upd = await withTimeout(updateOpportunity(oppResult.opportunityId, oppName, monetaryValue), 12000);
      oppResult.update = upd;
    }
    noteResult = await withTimeout(addContactNote(ghlResult.contactId, buildSubmissionNote(fields)), 12000);
  }

  // 3. Forward to FormSubmit (team email + investor autoresponse).
  const fsResult = await withTimeout(forwardToFormSubmit(fields), 12000);

  console.log('[wri-lead] GHL contact:', JSON.stringify(ghlResult));
  console.log('[wri-lead] GHL opportunity:', JSON.stringify(oppResult));
  console.log('[wri-lead] GHL note:', JSON.stringify(noteResult));
  console.log('[wri-lead] FormSubmit:', JSON.stringify(fsResult));

  const nextUrl = (fields._next || DEFAULT_NEXT).toString();
  res.statusCode = 302;
  res.setHeader('Location', nextUrl);
  res.end();
};
