/*
 * HamShackTech CW Trainer -- shared engine
 * ==========================================
 * Code both trainers (and the app shell) use, so each piece exists exactly
 * once. Loaded with a plain <script src="../shared/hst-engine.js"> before a
 * trainer's own script; everything hangs off one global object, HST.
 *
 *   HST.MORSE          the Morse code table
 *   HST.timing()       dit length / Farnsworth spacing for a given speed
 *   HST.fmtClock()     m:ss / h:mm:ss formatting for the session clocks
 *   HST.shared         settings shared by both trainers (WPM, tone, volume)
 *   HST.audio          the sidetone generator plus the buzzer, beep and bell
 *   HST.createClocks() the Elapsed stopwatch + Practice Timer chips
 *   HST.history       saved practice sessions (for the Progress tab)
 */
(function () {
  'use strict';

  var HST = window.HST = {};

  /* =====================================================================
     MORSE TABLE
     ===================================================================== */
  HST.MORSE = {
    A: '.-',    B: '-...',  C: '-.-.',  D: '-..',   E: '.',
    F: '..-.',  G: '--.',   H: '....',  I: '..',    J: '.---',
    K: '-.-',   L: '.-..',  M: '--',    N: '-.',    O: '---',
    P: '.--.',  Q: '--.-',  R: '.-.',   S: '...',   T: '-',
    U: '..-',   V: '...-',  W: '.--',   X: '-..-',  Y: '-.--',
    Z: '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-',
    "'": '.----.', '-': '-....-', '(': '-.--.', ')': '-.--.-'
  };

  /* =====================================================================
     TIMING (WPM + Farnsworth)
     The standard reference word "PARIS" is 50 dit-units long, which is
     why one dit lasts 1200 / WPM milliseconds. Farnsworth timing keeps
     the dits, dahs and the gaps INSIDE a character at the full character
     speed, but stretches the gaps BETWEEN characters and words so the
     overall speed comes out at the slower Farnsworth WPM. You hear each
     letter's real rhythm, with extra thinking time between letters.
       ta = ms per dit at character speed
       ts = ms per spacing unit between characters/words
     With no Farnsworth (fwpm = wpm), ts equals ta.
     ===================================================================== */
  HST.timing = function (wpm, fwpm) {
    var ta = 1200 / wpm;
    if (!fwpm || fwpm >= wpm) return { ta: ta, ts: ta };
    // Of the 50 units in "PARIS", 31 are dits/dahs/intra-character gaps
    // (sent at ta) and 19 are character + word spacing. Solve for the
    // spacing unit ts that makes the whole word take 60000 / fwpm ms.
    var ts = ((60000 / fwpm) - (31 * ta)) / 19;
    return { ta: ta, ts: Math.max(ts, ta) };
  };

  // m:ss under an hour, h:mm:ss after that.
  HST.fmtClock = function (ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    var ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
  };

  /* =====================================================================
     SHARED SETTINGS -- character speed, tone pitch and volume
     Stored once in localStorage, so a change in either trainer (or in the
     app's Settings panel) applies to both. Browsers fire a "storage" event
     in every OTHER open page of the same site when localStorage changes;
     that's how the second trainer's tab hears about a change made in the
     first, with no extra plumbing.
     ===================================================================== */
  var SHARED_KEY = 'hct-cw-shared-v1';
  var DEFAULTS = { wpm: 20, toneHz: 600, volume: 70 };
  var LIMITS = { wpm: [5, 40], toneHz: [300, 1000], volume: [0, 100] };
  var listeners = [];

  function clampAll(obj) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = Number(obj[k]);
      if (!isFinite(v)) v = DEFAULTS[k];
      out[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));
    });
    return out;
  }

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  // First run after this update: start from whatever the person already
  // set in the old separate trainers. Code Groups first (its volume is
  // already a 0-100 percentage), then ICR for speed and pitch. ICR's old
  // volume was an overdrive amount, not a percentage, so it isn't carried.
  function migrate() {
    var cg = readJSON('hct-settings-v1') || {};
    var icr = (readJSON('cwIcrTrainer') || {}).settings || {};
    return clampAll({
      wpm: cg.wpm != null ? cg.wpm : (icr.wpm != null ? icr.wpm : DEFAULTS.wpm),
      toneHz: cg.toneHz != null ? cg.toneHz : (icr.toneHz != null ? icr.toneHz : DEFAULTS.toneHz),
      volume: cg.volume != null ? cg.volume : DEFAULTS.volume
    });
  }

  var current = (function () {
    var saved = readJSON(SHARED_KEY);
    var start = saved ? clampAll(saved) : migrate();
    if (!saved) { try { localStorage.setItem(SHARED_KEY, JSON.stringify(start)); } catch (e) {} }
    return start;
  })();

  function notify() {
    var copy = HST.shared.get();
    listeners.forEach(function (fn) { try { fn(copy); } catch (e) { console.error(e); } });
  }

  HST.shared = {
    LIMITS: LIMITS,
    get: function () { return { wpm: current.wpm, toneHz: current.toneHz, volume: current.volume }; },
    // set({ wpm: 25 }) -- clamps, saves, and tells everyone listening.
    set: function (patch) {
      var next = {};
      Object.keys(DEFAULTS).forEach(function (k) { next[k] = k in patch ? patch[k] : current[k]; });
      current = clampAll(next);
      try { localStorage.setItem(SHARED_KEY, JSON.stringify(current)); } catch (e) {}
      notify();
    },
    // onChange(fn): fn(settings) runs after any change, here or in another tab/frame.
    onChange: function (fn) { listeners.push(fn); }
  };

  window.addEventListener('storage', function (e) {
    if (e.key !== SHARED_KEY || !e.newValue) return;
    try { current = clampAll(JSON.parse(e.newValue)); notify(); } catch (err) {}
  });

  /* =====================================================================
     AUDIO
     Every dit and dah is its own short sine-wave burst with a 5 ms
     fade-in and fade-out. Switching a tone on or off instantly makes an
     audible click (a sudden jump in the waveform), which is the same
     reason real transmitters shape their keying -- hard keying produces
     "key clicks" heard up and down the band.
     ===================================================================== */
  var ctx = null;
  var live = [];          // oscillators still scheduled, so stop() can cut them off
  var unlockEl = null;

  // A half-second of silence as a WAV file, built in memory. iOS Safari
  // plays Web Audio quietly (and obeys the silent switch) unless a normal
  // <audio> element is also playing; looping this silent clip after the
  // first tap moves iOS into normal media-playback volume. Harmless
  // everywhere else.
  function silentWavUrl() {
    var rate = 8000, n = rate / 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  // Peak loudness for a 0-100 volume setting. 0.35 at full volume leaves
  // headroom so 100% is loud but never harsh.
  function peakFor(volume) { return (volume / 100) * 0.35; }

  function tone(when, durSec, freqHz, peak, type) {
    var osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freqHz;
    var g = ctx.createGain();
    var edge = Math.min(0.005, durSec / 4);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + edge);
    g.gain.setValueAtTime(peak, Math.max(when + edge, when + durSec - edge));
    g.gain.linearRampToValueAtTime(0, when + durSec);
    osc.connect(g).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + durSec + 0.02);
    return osc;
  }

  HST.audio = {
    // Create/resume the audio system. Browsers only allow this from a
    // tap or keypress, so call it from a click handler (e.g. Start).
    unlock: function () {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      if (!unlockEl) {
        unlockEl = document.createElement('audio');
        unlockEl.loop = true;
        unlockEl.setAttribute('playsinline', '');
        unlockEl.src = silentWavUrl();
        unlockEl.style.display = 'none';
        document.body.appendChild(unlockEl);
      }
      unlockEl.play().catch(function () { /* best-effort */ });
      return ctx;
    },

    // Send a sequence of characters. chars is an array (or string); a " "
    // entry is a word gap (7 spacing units instead of 3).
    // opts: { wpm, fwpm (optional), toneHz, volume }
    // Returns { soundMs, done }: soundMs = ms until the last element stops
    // sounding; done = a Promise that resolves just after that.
    playMorse: function (chars, opts) {
      HST.audio.unlock();
      var t = HST.timing(opts.wpm, opts.fwpm);
      var peak = peakFor(opts.volume);
      var leadIn = 0.05, cursor = leadIn, now = ctx.currentTime;
      live = [];
      for (var idx = 0; idx < chars.length; idx++) {
        var ch = chars[idx], isLast = idx === chars.length - 1;
        if (ch === ' ') { if (!isLast) cursor += (7 * t.ts) / 1000; continue; }
        var code = HST.MORSE[ch] || '';
        for (var i = 0; i < code.length; i++) {
          var dur = (code[i] === '-' ? 3 * t.ta : t.ta) / 1000;
          live.push(tone(now + cursor, dur, opts.toneHz, peak));
          cursor += dur;
          if (i < code.length - 1) cursor += t.ta / 1000;   // 1-unit gap inside a character
        }
        // 3-unit gap between characters, unless a word gap comes next
        if (!isLast && chars[idx + 1] !== ' ') cursor += (3 * t.ts) / 1000;
      }
      var soundMs = cursor * 1000;
      return {
        soundMs: soundMs,
        done: new Promise(function (resolve) { setTimeout(resolve, soundMs + 120); })
      };
    },

    // Silence the sidetone immediately (Stop, Next, switching tabs).
    stop: function () {
      live.forEach(function (osc) { try { osc.stop(); } catch (e) {} });
      live = [];
    },

    // Wrong/timeout buzzer: a low, harsh double buzz that never sounds like code.
    buzzer: function (volume) {
      HST.audio.unlock();
      var now = ctx.currentTime + 0.02, peak = (volume / 100) * 0.28;
      [0, 0.14].forEach(function (off) { tone(now + off, 0.11, 180, peak, 'square'); });
    },

    // Timeout beep: a falling two-note chirp (900 Hz then 450 Hz).
    beep: function (volume) {
      HST.audio.unlock();
      var now = ctx.currentTime + 0.02, peak = peakFor(volume);
      tone(now, 0.11, 900, peak);
      tone(now + 0.16, 0.11, 450, peak);
    },

    // Practice Timer bell. Struck metal vibrates in several modes at once
    // whose frequencies are NOT whole-number multiples of each other --
    // that's what makes a bell "clang" instead of sounding like a musical
    // note. Church-bell tuning names the main ones hum (1/2x), prime (1x),
    // tierce (~1.2x, a minor third), quint (1.5x) and nominal (2x), plus
    // higher partials that die away faster, which is why a bell mellows
    // as it rings out. Three strikes about a second apart. Not tracked in
    // the live list, so stopping a session never cuts the bell off.
    bell: function (volume) {
      HST.audio.unlock();
      var PARTIALS = [ // [frequency ratio, relative level, decay (s)]
        [0.5, 0.35, 1.6], [1.0, 0.60, 1.2], [1.19, 0.40, 0.9], [1.5, 0.25, 0.7],
        [2.0, 0.45, 0.6], [2.74, 0.20, 0.35], [3.76, 0.12, 0.25], [5.4, 0.06, 0.15]
      ];
      var base = 523.25;                                  // C5
      var level = Math.max(volume, 40) / 100 * 0.16;      // audible even if volume is low
      [0, 1.1, 2.2].forEach(function (strikeAt) {
        var t0 = ctx.currentTime + 0.05 + strikeAt;
        PARTIALS.forEach(function (p) {
          var osc = ctx.createOscillator();
          osc.frequency.value = base * p[0];
          var g = ctx.createGain();
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(level * p[1], t0 + 0.004);   // near-instant strike
          g.gain.setTargetAtTime(0, t0 + 0.004, p[2] / 3);            // exponential ring-down
          osc.connect(g).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + p[2] * 2 + 0.1);
        });
      });
    }
  };

  /* =====================================================================
     SESSION CLOCKS -- Elapsed stopwatch + Practice Timer chips
     Both are computed from wall-clock timestamps (Date.now()) rather than
     by counting ticks, so they stay accurate even when the browser slows
     timers down in a background tab.
       HST.createClocks({ elapsedVal, elapsedChip, timerBtn, timerVal,
                          getTimerMin: fn, onExpire: fn })
     returns { start(), stop(expired), renderIdle(), running() }
     ===================================================================== */
  HST.createClocks = function (o) {
    var startTs = 0, endTs = 0, interval = null;

    // Timer chip while idle: the chosen length, or "Off".
    function renderIdle() {
      var min = o.getTimerMin();
      o.timerVal.textContent = min ? HST.fmtClock(min * 60000) : 'Off';
      o.timerBtn.classList.toggle('armed', !!min);
      o.timerBtn.classList.remove('low');
    }

    function tick() {
      var now = Date.now();
      o.elapsedVal.textContent = HST.fmtClock(now - startTs);
      if (!endTs) return;
      var left = endTs - now;
      // Round up so the last second shows 0:01, not 0:00.
      o.timerVal.textContent = HST.fmtClock(Math.ceil(left / 1000) * 1000);
      o.timerBtn.classList.toggle('low', left <= 60000);   // red in the final minute
      if (left <= 0) { stop(true); o.onExpire(); }
    }

    function start() {
      startTs = Date.now();
      var min = o.getTimerMin();
      endTs = min ? startTs + min * 60000 : 0;
      o.elapsedChip.classList.add('live');
      o.timerBtn.classList.remove('expired');
      o.timerBtn.disabled = true;          // the timer length is locked during a session
      clearInterval(interval);
      interval = setInterval(tick, 250);
      tick();
    }

    // The stopwatch freezes on the final time. The timer chip goes back
    // to its set length, unless it just ran out (then it holds 0:00).
    function stop(expired) {
      if (!interval) return;               // already stopped
      clearInterval(interval);
      interval = null;
      o.elapsedVal.textContent = HST.fmtClock(Date.now() - startTs);
      endTs = 0;
      o.elapsedChip.classList.remove('live');
      o.timerBtn.disabled = false;
      if (expired) {
        o.timerVal.textContent = '0:00';
        o.timerBtn.classList.add('expired');
      } else {
        renderIdle();
      }
    }

    return { start: start, stop: stop, renderIdle: renderIdle,
             running: function () { return !!interval; } };
  };

  /* =====================================================================
     PRACTICE HISTORY
     Every finished practice session is saved as one record in IndexedDB,
     the browser's built-in database (it holds far more than localStorage
     and survives restarts). Nothing leaves the device.

     A session record looks like:
       { trainer: 'icr' | 'code-groups' | 'keyer' | 'qso',
         start, end, durationMs,            // wall-clock times (ms)
         group, wpm, fwpm, groupSize,       // what was practiced, at what speed
         rounds, roundsCorrect, timeouts,   // ICR: 1 character per round
         charsTotal, charsCorrect,
         chars: { A: [correct, total], ... },
         timeSum, timeCount }               // ICR reaction / Code Groups answer
                                            // times (ms), timeouts excluded
     Keyer Practice records also carry: mode ('copy' | 'free'), source,
     keyType, sentChars, charGapSum/charGapN, wordGapSum/wordGapN (units),
     overallWpm. There, charsTotal/charsCorrect count only Copy this
     letters, and wpm is the measured character speed.
     QSO records (Milestone 7): style ('std' | 'pota'), who ('they' | 'you'
     called CQ), dxCall, theirWpm, completed, overs, copyRight/copyTotal
     (the copy check), plus the same sending fields as Keyer.

       HST.history.all()      -> Promise of every record, oldest first
       HST.history.add(rec)   -> Promise
       HST.history.clear()    -> Promise
     For syncing between devices (Milestone 8, shared/hst-account.js):
       every record gets a permanent random `uid` when it's saved, so the
       same session is recognized on every device; and
       HST.history.update(recs)     save changes to existing records (e.g. synced: true)
       HST.history.addMany(recs)    add sessions that came from other devices
       HST.history.removeBefore(t)  drop sessions that started before t
       HST.history.newUid()         a fresh uid
       HST.history.onChange(fn)  fn() runs when history changes in any tab/frame
       HST.history.recorder('icr' | 'code-groups')  -> see below
     ===================================================================== */
  var DB_NAME = 'hct-cw-trainer', STORE = 'sessions';
  var dbPromise = null;
  var memoryOnly = [];       // fallback if the browser blocks IndexedDB (rare)
  var historyListeners = [];
  // BroadcastChannel tells the other frames (e.g. the Progress tab) that a
  // session was saved, so they can redraw without polling.
  var channel = ('BroadcastChannel' in window) ? new BroadcastChannel('hct-cw-history') : null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
    return dbPromise;
  }

  // Run one IndexedDB request inside a transaction and resolve with its result.
  function dbRequest(mode, makeRequest) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var req = makeRequest(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(req.result); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function historyChanged() {
    historyListeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    if (channel) channel.postMessage('changed');
  }
  if (channel) channel.onmessage = function () {
    historyListeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  };

  // 16 random bytes as 32 hex characters: unique for all practical purposes.
  function newUid() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // Run several IndexedDB requests in one transaction.
  function dbMany(makeRequests) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        makeRequests(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  HST.history = {
    newUid: newUid,
    all: function () {
      return dbRequest('readonly', function (s) { return s.getAll(); })
        .then(function (rows) { return (rows || memoryOnly).slice().sort(function (a, b) { return a.start - b.start; }); });
    },
    add: function (rec) {
      if (!rec.uid) rec.uid = newUid();
      return dbRequest('readwrite', function (s) { return s.add(rec); })
        .then(function (r) { if (r == null) memoryOnly.push(rec); historyChanged(); });
    },
    clear: function () {
      return dbRequest('readwrite', function (s) { return s.clear(); })
        .then(function () { memoryOnly = []; historyChanged(); });
    },
    onChange: function (fn) { historyListeners.push(fn); },

    update: function (recs) {
      if (!recs || !recs.length) return Promise.resolve();
      return dbMany(function (s) { recs.forEach(function (r) { if (r.id != null) s.put(r); }); })
        .then(function (ok) {
          if (ok == null) recs.forEach(function (r) {           // memory-only fallback
            var i = memoryOnly.indexOf(r); if (i < 0) memoryOnly.push(r);
          });
        });
    },
    addMany: function (recs) {
      if (!recs || !recs.length) return Promise.resolve();
      recs.forEach(function (r) { delete r.id; if (!r.uid) r.uid = newUid(); });
      return dbMany(function (s) { recs.forEach(function (r) { s.add(r); }); })
        .then(function (ok) { if (ok == null) recs.forEach(function (r) { memoryOnly.push(r); }); historyChanged(); });
    },
    removeBefore: function (t) {
      return HST.history.all().then(function (rows) {
        var old = rows.filter(function (r) { return r.start < t; });
        if (!old.length) return;
        return dbMany(function (s) { old.forEach(function (r) { if (r.id != null) s.delete(r.id); }); })
          .then(function () { memoryOnly = memoryOnly.filter(function (r) { return r.start >= t; }); historyChanged(); });
      });
    },

    /* A recorder collects one practice session (Start ... Stop) and saves
       it when the session ends:
         var rec = HST.history.recorder('icr');
         rec.start({ group: 'letters', wpm: 20 });     // at Start Session
         rec.char('K', true);                           // each character graded
         rec.round(true, 640, false);                   // each round: correct?, time ms, timed out?
         rec.finish();                                  // at Stop / timer / tab switch
       The session in progress is also kept in localStorage after every
       round, so if the app window is closed mid-session it isn't lost:
       it gets saved the next time that trainer opens. */
    recorder: function (trainer) {
      var DRAFT_KEY = 'hct-cw-run-' + trainer;
      var run = null;

      function saveDraft() {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(run)); } catch (e) {}
      }
      function commit(r) {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
        // Nothing practiced: don't record. (Keyer Practice's Free send has
        // no right answers, so it counts characters sent instead.)
        if (!r || !(r.charsTotal || r.sentChars)) return Promise.resolve();
        r.end = r.end || Date.now();
        r.durationMs = Math.max(0, r.end - r.start);
        return HST.history.add(r);
      }

      // Recover a session that was interrupted by closing the app.
      try {
        var left = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (left) commit(left);
      } catch (e) {}

      return {
        start: function (meta) {
          if (run) commit(run);
          run = { trainer: trainer, start: Date.now(), end: 0,
                  rounds: 0, roundsCorrect: 0, timeouts: 0,
                  charsTotal: 0, charsCorrect: 0, chars: {},
                  timeSum: 0, timeCount: 0 };
          Object.keys(meta || {}).forEach(function (k) { run[k] = meta[k]; });
          saveDraft();
        },
        char: function (ch, correct) {
          if (!run) return;
          var c = run.chars[ch] || (run.chars[ch] = [0, 0]);
          c[1]++; run.charsTotal++;
          if (correct) { c[0]++; run.charsCorrect++; }
        },
        round: function (correct, ms, timedOut) {
          if (!run) return;
          run.rounds++;
          if (correct) run.roundsCorrect++;
          if (timedOut) run.timeouts++;
          else if (ms != null && isFinite(ms)) { run.timeSum += ms; run.timeCount++; }
          run.end = Date.now();
          saveDraft();
        },
        // set({ sentChars: 12, ... }) -- add or update fields on the session
        // in progress (Keyer Practice keeps its sending statistics this way).
        set: function (patch) {
          if (!run) return;
          Object.keys(patch).forEach(function (k) { run[k] = patch[k]; });
          run.end = Date.now();
          saveDraft();
        },
        finish: function () {
          var r = run; run = null;
          if (r) r.end = Date.now();
          return commit(r);
        },
        active: function () { return !!run; }
      };
    }
  };
})();
