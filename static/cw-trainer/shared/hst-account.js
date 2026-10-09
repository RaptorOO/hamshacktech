/*
 * HamShackTech CW Trainer -- account + sync  (Milestone 8)
 * =========================================================
 * Loaded by the app shell only (index.html), after hst-engine.js. Talks
 * to the site's API (functions/api/[[path]].js) to sign in with an
 * emailed code and keep practice history the same on every device.
 *
 *   HST.account.config()            -> Promise { accounts, turnstileSiteKey }
 *   HST.account.state()             -> { signedIn, email, user, lastSync, syncing, error }
 *   HST.account.start(email, turnstileToken)   email me a code
 *   HST.account.verify(email, code)            sign this device in
 *   HST.account.sync()              upload new sessions, download the rest
 *   HST.account.me()                profile + devices
 *   HST.account.signOutDevice(id) / signOut(all) / deleteAccount()
 *   HST.account.clearEverywhere()   clear history on every signed-in device
 *   HST.account.download()          save "my data" as a file
 *   HST.account.onChange(fn)
 *
 * HOW SYNC WORKS ("local-first")
 * Practice always saves on the device first, exactly as before, so the
 * app keeps working offline. Each session carries a unique id (uid). A
 * sync sends the sessions not yet marked `synced`, and asks for every
 * session stored since the last one this device downloaded (`since`, a
 * running number the server hands back). Sessions are only ever added,
 * never edited, so two devices can't conflict. Sync runs on launch, a few
 * seconds after each new session, when the connection comes back, and
 * every 15 minutes while the app is open.
 */
(function () {
  'use strict';

  var HST = window.HST;
  var KEY = 'hct-cw-account-v1';
  var QSO_KEY = 'hct-cw-qso-v1';         // the QSO tab's saved station details
  var listeners = [];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; }
  }
  var st = load();     // { token, deviceId, user, since, clearedBefore, lastSync }
  var syncing = false, lastError = '', again = false;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function notify() {
    var s = state();
    listeners.forEach(function (fn) { try { fn(s); } catch (e) { console.error(e); } });
  }
  function state() {
    return { signedIn: !!st.token, email: st.user ? st.user.email : '', user: st.user || null,
             lastSync: st.lastSync || 0, syncing: syncing, error: lastError };
  }
  // Another window of the app signed in or out: pick that up.
  window.addEventListener('storage', function (e) { if (e.key === KEY) { st = load(); notify(); } });

  /* ---------------- talking to the API ---------------- */
  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (st.token) headers.authorization = 'Bearer ' + st.token;
    return fetch('/api/' + path, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && st.token) {          // signed out elsewhere, or account deleted
          forget();
          throw new Error('You were signed out. Sign in again to keep syncing.');
        }
        if (!r.ok || j.ok === false) throw new Error(j.error || 'The server didn’t answer (' + r.status + ').');
        return j;
      });
    }, function () { throw new Error('Can’t reach hamshacktech.com right now. Check your internet connection.'); });
  }

  var configPromise = null;
  function config() {
    if (!configPromise) {
      configPromise = api('config').catch(function () { configPromise = null; return { accounts: false, offline: true }; });
    }
    return configPromise;
  }

  // A friendly name for this device in the account's device list.
  function deviceLabel() {
    var ua = navigator.userAgent;
    var os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
           : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'Mac'
           : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'Device';
    var br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
    var app = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? ' (app)' : '';
    return os + ' · ' + br + app;
  }

  /* ---------------- signing in and out ---------------- */
  function start(email, turnstile) {
    return api('auth/start', { body: { email: email, turnstile: turnstile || '' } });
  }
  function verify(email, code) {
    return api('auth/verify', { body: { email: email, code: code, device: deviceLabel() } }).then(function (j) {
      st = { token: j.token, deviceId: j.deviceId, user: j.user, since: 0, clearedBefore: 0, lastSync: 0 };
      save(); lastError = ''; notify();
      return sync().then(function () { return j.user; });
    });
  }
  function forget() { st = {}; save(); notify(); }
  function signOut(all) {
    var done = st.token ? api('auth/signout', { body: { all: !!all } }).catch(function () {}) : Promise.resolve();
    return done.then(forget);
  }
  function signOutDevice(id) { return api('devices/' + encodeURIComponent(id), { method: 'DELETE' }); }
  function me() { return api('me'); }
  function deleteAccount() { return api('account', { method: 'DELETE' }).then(forget); }

  function clearEverywhere() {
    return api('history/clear', { body: {} }).then(function (j) {
      st.clearedBefore = j.clearedBefore; save();
      return HST.history.clear();
    });
  }

  function download() {
    return fetch('/api/export', { headers: { authorization: 'Bearer ' + st.token }, cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Couldn’t download your data (' + r.status + ').');
      return r.blob();
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cw-trainer-data-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
  }

  /* ---------------- sync ---------------- */
  function readStation() {
    try { var q = JSON.parse(localStorage.getItem(QSO_KEY) || 'null') || {}; return q; } catch (e) { return {}; }
  }

  function sync() {
    if (!st.token) return Promise.resolve();
    if (syncing) { again = true; return Promise.resolve(); }
    if (navigator.onLine === false) return Promise.resolve();
    syncing = true; notify();

    return HST.history.all().then(function (rows) {
      // Older sessions recorded before accounts existed get their uid now.
      var needUid = rows.filter(function (r) { return !r.uid; });
      needUid.forEach(function (r) { r.uid = HST.history.newUid(); });
      return HST.history.update(needUid).then(function () { return rows; });
    }).then(function (rows) {
      var have = {};
      rows.forEach(function (r) { have[r.uid] = r; });
      var cleared = st.clearedBefore || 0;
      var pending = rows.filter(function (r) { return !r.synced && r.start >= cleared; });
      var q = readStation();
      var station = q.call ? { call: q.call, name: q.name, qth: q.qth, updated: q.stationUpdated || 0 } : null;

      // One round: up to 500 sessions up, up to 1,000 down. Repeats while
      // there's more either way.
      function round() {
        var batch = pending.splice(0, 500);
        var upload = batch.map(function (r) { var c = {}; Object.keys(r).forEach(function (k) { if (k !== 'id' && k !== 'synced') c[k] = r[k]; }); return c; });
        return api('sync', { body: { since: st.since || 0, sessions: upload, station: station } }).then(function (j) {
          station = null;                                   // only needs sending once
          var acc = {};
          j.accepted.forEach(function (u) { acc[u] = 1; });
          var marked = batch.filter(function (r) { return acc[r.uid]; });
          marked.forEach(function (r) { r.synced = true; });
          var incoming = j.sessions.filter(function (s) { return s.uid && !have[s.uid] && s.start >= (j.clearedBefore || 0); });
          incoming.forEach(function (s) { s.synced = true; have[s.uid] = s; });
          var steps = HST.history.update(marked).then(function () { return HST.history.addMany(incoming); });

          // History cleared on another device: clear the same here.
          if (j.clearedBefore && j.clearedBefore > (st.clearedBefore || 0)) {
            st.clearedBefore = j.clearedBefore;
            steps = steps.then(function () { return HST.history.removeBefore(j.clearedBefore); });
          }
          // Station details: take the server's when they're newer.
          if (j.station && j.station.call && j.station.updated > (readStation().stationUpdated || 0)) {
            var q2 = readStation();
            q2.call = j.station.call; q2.name = j.station.name; q2.qth = j.station.qth; q2.stationUpdated = j.station.updated;
            try { localStorage.setItem(QSO_KEY, JSON.stringify(q2)); } catch (e) {}
          }
          st.since = j.seq;
          return steps.then(function () { if (pending.length || j.more) return round(); });
        });
      }
      return round();
    }).then(function () {
      st.lastSync = Date.now(); lastError = ''; save();
    }, function (err) {
      lastError = err.message || String(err);
    }).then(function () {
      syncing = false; notify();
      if (again) { again = false; return sync(); }
    });
  }

  // Automatic syncing (only once signed in): on launch, a few seconds after
  // any new session, when the connection returns, and every 15 minutes.
  var soon = null;
  function syncSoon(ms) { clearTimeout(soon); soon = setTimeout(sync, ms || 4000); }
  HST.history.onChange(function () { if (st.token && !syncing) syncSoon(); });
  window.addEventListener('online', function () { syncSoon(1000); });
  setInterval(function () { if (st.token && document.visibilityState === 'visible') sync(); }, 15 * 60000);
  if (st.token) syncSoon(1500);

  HST.account = {
    config: config, state: state, start: start, verify: verify, sync: sync, me: me,
    signOut: signOut, signOutDevice: signOutDevice, deleteAccount: deleteAccount,
    clearEverywhere: clearEverywhere, download: download,
    onChange: function (fn) { listeners.push(fn); }
  };
})();
