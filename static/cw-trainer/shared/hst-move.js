/* Move this browser's CW Trainer progress to Morse Code One.
   Vendored read-and-pack half of Morse Code One static/shared/hst-transfer.js.
   Change MOVE_TO to a preview address when testing. Do not load a script
   from the other site. Nothing here is sent to a server. */
(function () {
  'use strict';

  var MOVE_TO = 'https://morsecodeone.com';
  var MAX_JSON = 2 * 1024 * 1024;
  var MAX_LINK = 100000;
  var MAX_SESSIONS = 4000;
  var MAX_KEYS = 80;
  var MAX_VALUE = 60000;
  var TRAINERS = {
    icr: 1, 'code-groups': 1, keyer: 1, qso: 1, 'test-prep': 1,
    'call-signs': 1, jeopardy: 1, manual: 1, course: 1
  };
  var EXACT_KEYS = {
    'hct-cw-shared-v1': 1,
    'hct-cw-keyer-v1': 1,
    'hct-cw-experimental-v1': 1,
    'hct-cw-keyer-practice-v1': 1,
    'hct-cw-qso-v1': 1,
    'hct-cw-test-prep-v1': 1,
    'hct-cw-call-signs-v2': 1,
    'hct-settings-v1': 1,
    'hct-cw-speed-practice-v1': 1,
    'cwIcrTrainer': 1,
    'mcj-settings': 1,
    'mcj-online': 1,
    'hct-cw-course-v1': 1,
    'hct-cw-course-progress-v1': 1,
    'hct-cw-course-carried-v1': 1,
    'hct-cw-own-text-v1': 1,
    'hct-cw-radio-v1': 1,
    'hct-cw-adapter-keying-v1': 1,
    'hct-cw-vail-speed-v1': 1
  };
  var SHARED_RE = /^hct-cw-shared-v1:[a-z0-9-]{1,24}$/;

  function bytesOf(text) { return new TextEncoder().encode(text); }
  function b64url(buf) {
    var bin = '', bytes = new Uint8Array(buf), i;
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function allowedKey(key) { return EXACT_KEYS[key] === 1 || SHARED_RE.test(key); }
  var PROSIGN_KEYS = { 'hct-cw-own-text-v1': 1, 'hct-cw-keyer-v1': 1, 'hct-cw-keyer-practice-v1': 1 };
  var NUMBER_FIELDS = ['start', 'end', 'durationMs', 'wpm', 'fwpm', 'groupSize', 'rounds', 'roundsCorrect', 'timeouts', 'charsTotal', 'charsCorrect', 'timeSum', 'timeCount', 'sentChars', 'charGapSum', 'charGapN', 'wordGapSum', 'wordGapN', 'overallWpm', 'clues', 'right', 'score', 'questions', 'answered', 'replays', 'topWpm', 'minWpm', 'maxWpm'];
  var PROSIGN = '<(?:AR|AS|BK|BT|HH|KN|SK)>';
  var CHAR_KEY = new RegExp('^(?:' + PROSIGN + '|[^<>]{1,2})$');
  var PROSIGN_RE = new RegExp(PROSIGN, 'g');
  function localMarkupOk(key, raw) {
    if (raw.indexOf('<') < 0 && raw.indexOf('>') < 0) return true;
    if (!PROSIGN_KEYS[key]) return false;
    var stripped = raw.replace(PROSIGN_RE, '');
    return stripped.indexOf('<') < 0 && stripped.indexOf('>') < 0;
  }
  function readLocal() {
    var out = {}, i, key, raw;
    for (i = 0; i < localStorage.length; i++) {
      key = localStorage.key(i);
      if (!allowedKey(key)) continue;
      raw = localStorage.getItem(key);
      if (!raw || raw.length > MAX_VALUE || !localMarkupOk(key, raw)) continue;
      try { JSON.parse(raw); } catch (e) { continue; }
      out[key] = raw;
      if (Object.keys(out).length >= MAX_KEYS) break;
    }
    return out;
  }
  function openDb() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open('hct-cw-trainer', 1); }
      catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        req.result.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }
  function readSessions() {
    return openDb().then(function (db) {
      if (!db) return [];
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('sessions', 'readonly');
          var all = tx.objectStore('sessions').getAll();
          tx.oncomplete = function () { db.close(); resolve(all.result || []); };
          tx.onerror = function () { db.close(); resolve([]); };
          tx.onabort = function () { db.close(); resolve([]); };
        } catch (e) {
          try { db.close(); } catch (err) {}
          resolve([]);
        }
      });
    });
  }
  function charsOk(chars) {
    if (chars == null) return true;
    if (typeof chars !== 'object' || Array.isArray(chars)) return false;
    var keys = Object.keys(chars), i, pair;
    for (i = 0; i < keys.length; i++) {
      if (!CHAR_KEY.test(keys[i])) return false;
      pair = chars[keys[i]];
      if (!Array.isArray(pair) || pair.length !== 2 || !isFinite(pair[0]) || !isFinite(pair[1])) return false;
    }
    return true;
  }
  function cleanSession(rec) {
    if (!rec || typeof rec !== 'object' || !TRAINERS[rec.trainer] || !isFinite(rec.start)) return null;
    if (typeof rec.uid !== 'string' || !/^[\w-]{8,64}$/.test(rec.uid)) return null;
    var copy = {}, keys = Object.keys(rec), i, k;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (k === 'id' || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (typeof rec[k] === 'string' && rec[k].length > 4000) continue;
      if (NUMBER_FIELDS.indexOf(k) >= 0 && !isFinite(rec[k])) return null;
      copy[k] = rec[k];
    }
    if (!charsOk(copy.chars)) return null;
    var rest = {};
    Object.keys(copy).forEach(function (name) { if (name !== 'chars') rest[name] = copy[name]; });
    var text = JSON.stringify(rest);
    return text.length > MAX_VALUE || text.indexOf('<') >= 0 || text.indexOf('>') >= 0 ? null : copy;
  }
  function collect() {
    return readSessions().then(function (rows) {
      var sessions = [], dropped = 0;
      (rows || []).forEach(function (rec) {
        var clean = cleanSession(rec);
        if (clean) sessions.push(clean);
        else if (rec) dropped++;
      });
      return { v: 1, at: Date.now(), sessions: sessions, local: readLocal(), dropped: dropped };
    });
  }
  function pack(obj) {
    var json = JSON.stringify(obj);
    if (json.length > MAX_JSON) return Promise.reject(new Error('too-big'));
    if (typeof CompressionStream !== 'function') return Promise.resolve({ text: json, plain: true });
    var stream = new Blob([bytesOf(json)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buf) {
      return { text: 'mco1.' + b64url(buf), plain: false };
    });
  }
  function download(text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'morse-code-one-progress.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function move() {
    return collect().then(pack).then(function (packed) {
      if (!packed.plain && packed.text.length <= MAX_LINK) {
        location.href = MOVE_TO.replace(/\/$/, '') + '/import/#' + packed.text;
        return;
      }
      download(packed.text);
      window.alert('You have a lot of practice records, so they were saved as a file. On Morse Code One, choose that file and tap Bring it over.');
    });
  }
  function hasSavedProgress() {
    var i, key;
    try {
      for (i = 0; i < localStorage.length; i++) {
        key = localStorage.key(i);
        if (allowedKey(key) && localStorage.getItem(key)) return Promise.resolve(true);
      }
    } catch (e) {}
    return readSessions().then(function (rows) { return !!(rows && rows.length); });
  }
  window.HSTMove = { MOVE_TO: MOVE_TO, move: move, collect: collect, pack: pack, hasSavedProgress: hasSavedProgress, maxLink: MAX_LINK };
})();
