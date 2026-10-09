/*
 * HamShackTech CW Trainer -- accounts and sync API  (Milestone 8)
 * =================================================================
 * A Cloudflare Pages Function: a small program Cloudflare runs on its
 * servers each time someone requests hamshacktech.com/api/... -- the
 * "clerk at the counter" for the static website. It signs people in with
 * an emailed 6-digit code and keeps a copy of their practice history so
 * every device they sign in on shows the same Progress.
 *
 *   GET    /api/config            is sign-in available? (+ Turnstile site key)
 *   POST   /api/auth/start        { email, turnstile }  -> emails a code
 *   POST   /api/auth/verify       { email, code, device } -> { token, user }
 *   POST   /api/auth/signout      { all? }  sign out this device (or every device)
 *   GET    /api/me                profile + signed-in devices
 *   DELETE /api/devices/:id       sign out one device
 *   POST   /api/sync              upload new sessions, download others, station details
 *   POST   /api/history/clear     clear practice history on every device
 *   GET    /api/export            everything stored about you, as a JSON file
 *   DELETE /api/account           delete your account and all its data
 *
 * SETTINGS (Cloudflare dashboard -> Pages project -> Settings):
 *   DB                 D1 database binding (separate databases for Production and Preview)
 *   Email -- either of:
 *     EMAIL            a "send email" binding to Cloudflare Email Service, if the
 *                      Pages project offers one (no token needed), or
 *     CF_ACCOUNT_ID    Cloudflare account ID (plain variable) and
 *     EMAIL_API_TOKEN  an API token with "Email Sending: Edit" (secret)
 *   TURNSTILE_SITE_KEY Turnstile site key (plain variable)
 *   TURNSTILE_SECRET   Turnstile secret key (secret)
 *   EMAIL_FROM / EMAIL_FROM_NAME / EMAIL_REPLY_TO   optional overrides
 *   DEV_MODE = "1"     LOCAL TESTING ONLY: no email or Turnstile; the code
 *                      comes back in the response. Never set in Cloudflare.
 * Until DB, the email settings and Turnstile are all present, /api/config
 * reports accounts as unavailable and the app shows no sign-in option.
 *
 * SECURITY NOTES
 *  - Codes and sign-in tokens are stored only as SHA-256 hashes, so a copy
 *    of the database can't be used to sign in.
 *  - A code expires after 10 minutes and allows 5 wrong guesses; requests
 *    are rate-limited per address and per network address.
 *  - "Start sign-in" answers the same whether or not an account exists.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_RECORD_BYTES = 16 * 1024;
const MAX_UPLOAD = 500;
const MAX_DOWNLOAD = 1000;
const TRAINERS = ['icr', 'code-groups', 'keyer', 'qso'];

/* ---------------- small helpers ---------------- */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}
function fail(status, error, extra = {}) { return json({ ok: false, error, ...extra }, status); }

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// A 6-digit code from the secure random generator. Rejecting values above the
// largest multiple of 1,000,000 keeps every code equally likely.
function sixDigits() {
  const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= 4294000000);
  return String(a[0] % 1000000).padStart(6, '0');
}
function cleanEmail(e) {
  e = String(e || '').trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}
function clip(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }
function clientIp(request) { return request.headers.get('cf-connecting-ip') || 'local'; }

function isDev(env) { return env.DEV_MODE === '1'; }
function accountsEnabled(env) {
  if (!env.DB) return false;
  if (isDev(env)) return true;
  const canEmail = !!(env.EMAIL && env.EMAIL.send) || !!(env.CF_ACCOUNT_ID && env.EMAIL_API_TOKEN);
  return canEmail && !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET);
}

/* ---------------- database setup ----------------
   Tables are created the first time each server instance handles a
   request (IF NOT EXISTS makes this a no-op afterwards), so there's no
   separate setup step. */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, created INTEGER NOT NULL,
     call TEXT, name TEXT, qth TEXT, station_updated INTEGER NOT NULL DEFAULT 0,
     cleared_before INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS codes (
     email TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL,
     expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS codes_email ON codes(email)`,
  `CREATE TABLE IF NOT EXISTS devices (
     token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL,
     label TEXT, created INTEGER NOT NULL, last_seen INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS devices_user ON devices(user_id)`,
  // seq increases with every stored session, so "everything after seq N"
  // is exactly what a device hasn't seen yet.
  `CREATE TABLE IF NOT EXISTS records (
     seq INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, uid TEXT NOT NULL,
     start INTEGER NOT NULL, trainer TEXT, data TEXT NOT NULL, UNIQUE(user_id, uid))`,
  `CREATE INDEX IF NOT EXISTS records_user_seq ON records(user_id, seq)`,
  `CREATE TABLE IF NOT EXISTS hits (key TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS hits_key ON hits(key, at)`
];
let schemaReady = null;
function ensureSchema(db) {
  if (!schemaReady) schemaReady = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

/* ---------------- rate limits ----------------
   Each limited action is logged in `hits`; too many in the window = no. */
async function overLimit(db, key, max, windowMs) {
  const since = Date.now() - windowMs;
  const row = await db.prepare('SELECT COUNT(*) AS n FROM hits WHERE key = ? AND at > ?').bind(key, since).first();
  return (row ? row.n : 0) >= max;
}
async function logHit(db, key) {
  await db.prepare('INSERT INTO hits (key, at) VALUES (?, ?)').bind(key, Date.now()).run();
}
// Forget rate-limit records (which include network addresses) and expired
// codes once they're a day old -- the Privacy Policy promises this. Run on
// every sign-in request; the tables stay tiny, so it's cheap.
async function forgetOld(db) {
  const dayAgo = Date.now() - 86400000;
  await db.batch([
    db.prepare('DELETE FROM hits WHERE at < ?').bind(dayAgo),
    db.prepare('DELETE FROM codes WHERE expires < ?').bind(dayAgo)
  ]);
}

/* ---------------- outside services ---------------- */
async function verifyTurnstile(env, token, ip) {
  if (isDev(env)) return true;
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await r.json().catch(() => ({}));
  return !!out.success;
}

async function sendCodeEmail(env, to, code) {
  if (isDev(env)) return { ok: true };
  const msg = codeEmail(code);
  const fromAddr = env.EMAIL_FROM || 'signin@hamshacktech.com';
  const fromName = env.EMAIL_FROM_NAME || 'HamShackTech CW Trainer';
  const replyTo = env.EMAIL_REPLY_TO || 'contact@hamshacktech.com';

  // 1. The built-in binding, when the project has one.
  if (env.EMAIL && env.EMAIL.send) {
    try {
      await env.EMAIL.send({ to, from: { email: fromAddr, name: fromName }, replyTo,
                             subject: msg.subject, text: msg.text, html: msg.html });
      return { ok: true };
    } catch (e) {
      console.error('Email binding send failed', e && e.message);
      if (!(env.CF_ACCOUNT_ID && env.EMAIL_API_TOKEN)) return { ok: false };
    }
  }
  // 2. The REST API with a token. (Field names differ from the binding's:
  //    from.address and reply_to here, from.email and replyTo there.)
  const body = {
    to,
    from: { address: fromAddr, name: fromName },
    reply_to: replyTo,
    subject: msg.subject, text: msg.text, html: msg.html,
    headers: { 'Auto-Submitted': 'auto-generated' }
  };
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID + '/email/sending/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.EMAIL_API_TOKEN },
    body: JSON.stringify(body)
  });
  const out = await r.json().catch(() => ({}));
  if (!out.success) console.error('Email send failed', r.status, JSON.stringify(out.errors || out));
  return { ok: !!out.success };
}

function codeEmail(code) {
  return {
    subject: 'Your CW Trainer sign-in code: ' + code,
    text: 'Your sign-in code for the HamShackTech CW Trainer is:\n\n    ' + code + '\n\n' +
          'Type it into the app within 10 minutes. If you didn’t ask for this, you can ignore this email — ' +
          'nobody can sign in without the code.\n\n73,\nHamShackTech — hamshacktech.com',
    html: '<p>Your sign-in code for the HamShackTech CW Trainer is:</p>' +
          '<p style="font:600 28px/1.2 monospace;letter-spacing:6px">' + code + '</p>' +
          '<p>Type it into the app within 10 minutes. If you didn’t ask for this, you can ignore this email — nobody can sign in without the code.</p>' +
          '<p>73,<br>HamShackTech &mdash; <a href="https://hamshacktech.com">hamshacktech.com</a></p>'
  };
}

/* ---------------- who is calling ---------------- */
async function auth(request, db) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  const row = await db.prepare(
    'SELECT d.id AS device_id, d.last_seen, u.* FROM devices d JOIN users u ON u.id = d.user_id WHERE d.token_hash = ?'
  ).bind(await sha256(token)).first();
  if (!row) return null;
  if (Date.now() - row.last_seen > 3600000) {          // note "last seen" at most hourly
    await db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').bind(Date.now(), row.device_id).run();
  }
  return row;
}
function publicUser(u) {
  return { id: u.id, email: u.email, call: u.call || '', name: u.name || '', qth: u.qth || '',
           stationUpdated: u.station_updated || 0, clearedBefore: u.cleared_before || 0, created: u.created };
}

/* ---------------- handlers ---------------- */
async function startSignIn(request, env, db) {
  const body = await request.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  if (!email) return fail(400, 'Please enter a valid email address.');
  const ip = clientIp(request);
  await forgetOld(db);
  if (await overLimit(db, 'start-ip:' + ip, 20, 3600000)) return fail(429, 'Too many sign-in requests from this network. Try again in an hour.');
  if (await overLimit(db, 'start:' + email, 3, 15 * 60000) || await overLimit(db, 'start-day:' + email, 10, 86400000)) {
    return fail(429, 'A code was just sent to this address. Check your inbox (and spam folder), or try again in 15 minutes.');
  }
  if (!(await verifyTurnstile(env, body.turnstile, ip))) return fail(400, 'The “I’m human” check didn’t pass. Please try again.');

  const code = sixDigits();
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM codes WHERE email = ?').bind(email),               // only the newest code works
    db.prepare('INSERT INTO codes (email, hash, created, expires) VALUES (?, ?, ?, ?)')
      .bind(email, await sha256(email + ':' + code), now, now + CODE_TTL_MS)
  ]);
  await logHit(db, 'start-ip:' + ip); await logHit(db, 'start:' + email); await logHit(db, 'start-day:' + email);
  const sent = await sendCodeEmail(env, email, code);
  if (!sent.ok) return fail(502, 'We couldn’t send the email just now. Please try again in a few minutes.');
  return json({ ok: true, ...(isDev(env) ? { devCode: code } : {}) });
}

async function verifySignIn(request, env, db) {
  const body = await request.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  const code = String(body.code || '').replace(/\D/g, '');
  if (!email || code.length !== 6) return fail(400, 'Enter the 6-digit code from the email.');
  const ip = clientIp(request);
  if (await overLimit(db, 'verify-ip:' + ip, 40, 3600000)) return fail(429, 'Too many tries from this network. Try again in an hour.');
  await logHit(db, 'verify-ip:' + ip);

  const row = await db.prepare('SELECT rowid, * FROM codes WHERE email = ? ORDER BY created DESC LIMIT 1').bind(email).first();
  if (!row || row.expires < Date.now()) return fail(400, 'That code has expired or was already used. Ask for a new one.');
  if (row.attempts >= MAX_CODE_ATTEMPTS) return fail(400, 'Too many wrong tries. Ask for a new code.');
  if ((await sha256(email + ':' + code)) !== row.hash) {
    await db.prepare('UPDATE codes SET attempts = attempts + 1 WHERE rowid = ?').bind(row.rowid).run();
    const left = MAX_CODE_ATTEMPTS - row.attempts - 1;
    return fail(400, left > 0 ? 'That code isn’t right. ' + left + ' ' + (left === 1 ? 'try' : 'tries') + ' left.' : 'Too many wrong tries. Ask for a new code.');
  }

  // Right code: find or create the account, and give this device its own token.
  const now = Date.now();
  let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) {
    user = { id: crypto.randomUUID(), email, created: now, station_updated: 0, cleared_before: 0 };
    await db.prepare('INSERT INTO users (id, email, created) VALUES (?, ?, ?)').bind(user.id, email, now).run();
  }
  const token = randomToken();
  const deviceId = crypto.randomUUID();
  await db.batch([
    db.prepare('DELETE FROM codes WHERE email = ?').bind(email),
    db.prepare('INSERT INTO devices (token_hash, id, user_id, label, created, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await sha256(token), deviceId, user.id, clip(body.device, 80) || 'Unnamed device', now, now)
  ]);
  return json({ ok: true, token, deviceId, user: publicUser(user) });
}

async function me(user, db) {
  const devices = await db.prepare('SELECT id, label, created, last_seen FROM devices WHERE user_id = ? ORDER BY last_seen DESC').bind(user.id).all();
  const count = await db.prepare('SELECT COUNT(*) AS n FROM records WHERE user_id = ?').bind(user.id).first();
  return json({ ok: true, user: publicUser(user), deviceId: user.device_id, sessions: count ? count.n : 0,
                devices: (devices.results || []).map((d) => ({ id: d.id, label: d.label, created: d.created, lastSeen: d.last_seen, current: d.id === user.device_id })) });
}

/* Sync. The device sends the sessions it hasn't uploaded yet, the last
   seq it has downloaded, and its QSO station details. The server stores
   the new sessions (a repeat upload of the same uid is ignored), then
   returns everything stored after `since` that came from elsewhere, plus
   whichever station details are newer, plus "cleared before" (history
   cleared on another device). */
async function sync(request, user, db) {
  const body = await request.json().catch(() => ({}));
  const up = Array.isArray(body.sessions) ? body.sessions.slice(0, MAX_UPLOAD) : [];
  const accepted = [];
  const stmts = [];
  for (const s of up) {
    if (!s || typeof s.uid !== 'string' || !/^[\w-]{8,64}$/.test(s.uid)) continue;
    const start = Number(s.start);
    if (!isFinite(start) || start < user.cleared_before) continue;      // cleared history stays cleared
    if (TRAINERS.indexOf(s.trainer) < 0) continue;
    const data = JSON.stringify(s);
    if (data.length > MAX_RECORD_BYTES) continue;
    stmts.push(db.prepare('INSERT OR IGNORE INTO records (user_id, uid, start, trainer, data) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, s.uid, start, s.trainer, data));
    accepted.push(s.uid);
  }

  // Station details: the newer copy wins.
  let station = publicUser(user);
  const st = body.station;
  if (st && Number(st.updated) > (user.station_updated || 0)) {
    station = { ...station, call: clip(st.call, 12).toUpperCase(), name: clip(st.name, 20).toUpperCase(), qth: clip(st.qth, 30).toUpperCase(), stationUpdated: Number(st.updated) };
    stmts.push(db.prepare('UPDATE users SET call = ?, name = ?, qth = ?, station_updated = ? WHERE id = ?')
      .bind(station.call, station.name, station.qth, station.stationUpdated, user.id));
  }
  if (stmts.length) await db.batch(stmts);

  const since = Math.max(0, Number(body.since) || 0);
  const rows = await db.prepare('SELECT seq, uid, data FROM records WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .bind(user.id, since, MAX_DOWNLOAD).all();
  const results = rows.results || [];
  const mine = new Set(accepted);
  return json({
    ok: true,
    accepted,
    sessions: results.filter((r) => !mine.has(r.uid)).map((r) => JSON.parse(r.data)),
    seq: results.length ? results[results.length - 1].seq : since,
    more: results.length === MAX_DOWNLOAD,
    clearedBefore: user.cleared_before || 0,
    station: { call: station.call, name: station.name, qth: station.qth, updated: station.stationUpdated }
  });
}

async function clearHistory(user, db) {
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM records WHERE user_id = ?').bind(user.id),
    db.prepare('UPDATE users SET cleared_before = ? WHERE id = ?').bind(now, user.id)
  ]);
  return json({ ok: true, clearedBefore: now });
}

async function exportData(user, db) {
  const devices = await db.prepare('SELECT label, created, last_seen FROM devices WHERE user_id = ?').bind(user.id).all();
  const rows = await db.prepare('SELECT data FROM records WHERE user_id = ? ORDER BY start').bind(user.id).all();
  const out = {
    exported: new Date().toISOString(),
    account: { email: user.email, created: new Date(user.created).toISOString(), call: user.call || '', name: user.name || '', qth: user.qth || '' },
    devices: (devices.results || []).map((d) => ({ label: d.label, signedIn: new Date(d.created).toISOString(), lastSeen: new Date(d.last_seen).toISOString() })),
    sessions: (rows.results || []).map((r) => JSON.parse(r.data))
  };
  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
               'content-disposition': 'attachment; filename="cw-trainer-data.json"' }
  });
}

async function deleteAccount(user, db) {
  await db.batch([
    db.prepare('DELETE FROM records WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM devices WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM codes WHERE email = ?').bind(user.email),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id)
  ]);
  return json({ ok: true });
}

/* ---------------- router ---------------- */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const method = request.method;

  if (path === 'config' && method === 'GET') {
    return json({ ok: true, accounts: accountsEnabled(env), turnstileSiteKey: isDev(env) ? '' : (env.TURNSTILE_SITE_KEY || '') });
  }
  if (!accountsEnabled(env)) return fail(503, 'Accounts aren’t available yet.');
  // JSON bodies only, from this site: a simple guard against other sites
  // posting to the API on a signed-in visitor's behalf.
  if (method !== 'GET' && method !== 'DELETE' && !(request.headers.get('content-type') || '').includes('application/json')) {
    return fail(415, 'Expected JSON.');
  }

  const db = env.DB;
  try {
    await ensureSchema(db);
    if (path === 'auth/start' && method === 'POST') return await startSignIn(request, env, db);
    if (path === 'auth/verify' && method === 'POST') return await verifySignIn(request, env, db);

    const user = await auth(request, db);
    if (!user) return fail(401, 'Please sign in again.');

    if (path === 'me' && method === 'GET') return await me(user, db);
    if (path === 'sync' && method === 'POST') return await sync(request, user, db);
    if (path === 'export' && method === 'GET') return await exportData(user, db);
    if (path === 'history/clear' && method === 'POST') return await clearHistory(user, db);
    if (path === 'account' && method === 'DELETE') return await deleteAccount(user, db);
    if (path === 'auth/signout' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.all) await db.prepare('DELETE FROM devices WHERE user_id = ?').bind(user.id).run();
      else await db.prepare('DELETE FROM devices WHERE id = ?').bind(user.device_id).run();
      return json({ ok: true });
    }
    const m = path.match(/^devices\/([\w-]{8,64})$/);
    if (m && method === 'DELETE') {
      await db.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').bind(m[1], user.id).run();
      return json({ ok: true });
    }
    return fail(404, 'Not found.');
  } catch (e) {
    console.error(e && e.stack || e);
    return fail(500, 'Something went wrong on our end. Please try again.');
  }
}
