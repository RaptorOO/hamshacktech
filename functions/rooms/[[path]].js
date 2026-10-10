/* =====================================================================
   HamShackTech CW Trainer -- Jeopardy rooms, site side (Milestone 9a)

   The rooms themselves live in a separate Worker ("hamshacktech-rooms",
   folder workers/rooms) as a Durable Object class. This Pages Function
   is the doorway to them, at hamshacktech.com/rooms/...:

     GET  /rooms/config          -> { online: true|false }  (is online play set up?)
     POST /rooms/new             -> { code, hostKey }        (host creates a room)
     GET  /rooms/info/QRX472     -> { exists, phase, players, full }
     GET  /rooms/ws/QRX472?...   -> WebSocket to that room   (pid, name, key)

   Needs the Pages binding ROOMS (Durable Object namespace from the
   hamshacktech-rooms Worker). Without it, config says online: false and
   the app simply doesn't show online play.
   ===================================================================== */

// Room codes: three letters then three digits, e.g. QRX472. Letters and
// digits that are easy to confuse (I/1, O/0) are left out.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const CODE_RE = /^[A-HJ-NP-Z]{3}[2-9]{3}$/;

function rand(chars) {
  const b = new Uint8Array(1);
  crypto.getRandomValues(b);
  return chars[b[0] % chars.length];
}
function newCode() { return rand(LETTERS) + rand(LETTERS) + rand(LETTERS) + rand(DIGITS) + rand(DIGITS) + rand(DIGITS); }
function newKey() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

// At most 20 new rooms per hour from one address, using the same "hits"
// log the accounts API keeps in D1 (skipped if the database isn't bound).
async function tooMany(env, ip) {
  if (!env.DB) return false;
  try {
    const since = Date.now() - 3600 * 1000, key = 'room:' + ip;
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM hits WHERE key = ? AND at > ?').bind(key, since).first();
    if (row && row.n >= 20) return true;
    await env.DB.prepare('INSERT INTO hits (key, at) VALUES (?, ?)').bind(key, Date.now()).run();
  } catch (e) { /* the hits table may not exist yet; don't block play over it */ }
  return false;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const parts = Array.isArray(params.path) ? params.path : [params.path || ''];
  const what = parts[0];

  if (what === 'config') return json({ online: !!env.ROOMS });
  if (!env.ROOMS) return json({ ok: false, error: 'Online play isn’t set up yet.' }, 503);

  if (what === 'new' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    if (await tooMany(env, ip)) return json({ ok: false, error: 'Too many rooms from here in the last hour. Try again later.' }, 429);
    for (let tries = 0; tries < 6; tries++) {
      const code = newCode(), hostKey = newKey();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const r = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, hostKey }) });
      if (r.ok) return json({ ok: true, code, hostKey });
      // 409 = that code is already a live room; pick another.
    }
    return json({ ok: false, error: 'Couldn’t make a room. Please try again.' }, 500);
  }

  const code = String(parts[1] || '').toUpperCase();
  if (!CODE_RE.test(code)) return json({ ok: false, error: 'That doesn’t look like a room code.' }, 400);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));

  if (what === 'info') return stub.fetch('https://room/info');
  if (what === 'ws') {
    const u = new URL(request.url);
    return stub.fetch('https://room/ws' + u.search, request);
  }
  return json({ ok: false, error: 'Not found' }, 404);
}
