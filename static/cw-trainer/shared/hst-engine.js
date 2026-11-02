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
 *   HST.audio          the sidetone generator plus the buzzer, beep and bell;
 *                      recording what you hear (startRecording / stopRecording,
 *                      HST.recordButton) and band conditions (conditions)
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
  // Prosigns: two letters sent run together, written <SK>. Kept apart from
  // HST.MORSE (several share a pattern with a punctuation mark); the
  // player sends them as one character.
  HST.PROSIGN_CODE = { '<AR>': '.-.-.', '<SK>': '...-.-', '<KN>': '-.--.', '<BT>': '-...-', '<BK>': '-...-.-', '<AS>': '.-...' };
  // Custom Characters text (ICR, Code Groups) -> its characters, each once,
  // in order. A prosign is written <AR> and counts as one character.
  HST.charsFromText = function (text) {
    var seen = {}, out = [];
    (String(text || '').toUpperCase().match(/<[A-Z]+>|\S/g) || []).forEach(function (c) {
      if ((HST.MORSE[c] || HST.PROSIGN_CODE[c]) && !seen[c]) { seen[c] = true; out.push(c); }
    });
    return out;
  };
  // How a character is shown and typed: a prosign as its letters (<AR> -> AR).
  HST.charLabel = function (c) { return c.length > 1 ? c.slice(1, -1) : c; };

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
     TOOL SETTINGS -- character speed, tone pitch and volume
     Each practice tool keeps its OWN copy (October 2026; users found one
     speed shared by every tool confusing). The tool is worked out from the
     page's address -- /cw-trainer/icr/ is "icr", /cw-trainer/qso/ is "qso",
     and the app shell itself is "app" -- and its settings live under
     "hct-cw-shared-v1:<tool>". The first time a tool runs after this
     change it starts from the old single shared setting, so nobody's
     speed jumps. (The name HST.shared is kept so the tools' code didn't
     need to change.) Browsers fire a "storage" event in every OTHER open
     page of the same site when localStorage changes; that keeps two
     windows of the same tool in step.
     ===================================================================== */
  var OLD_SHARED_KEY = 'hct-cw-shared-v1';
  HST.TOOL = HST.TOOL || (function () {
    var m = /\/cw-trainer\/([a-z0-9-]+)\//.exec(location.pathname);
    return m ? m[1] : 'app';
  })();
  var SHARED_KEY = OLD_SHARED_KEY + ':' + HST.TOOL;
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
    var saved = readJSON(SHARED_KEY) || readJSON(OLD_SHARED_KEY);   // a new tool starts from today's setting
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
    // Adaptive Speed (Tim, 2026-10-31): +1 WPM after a right answer, -1
    // after a miss, kept within LIMITS.wpm.
    adaptWpm: function (correct) { this.set({ wpm: current.wpm + (correct ? 1 : -1) }); },
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
  // Everything goes to `out` (what you hear, and what a recording takes).
  // The Morse you copy goes through `sig` first, so band conditions can
  // fade it (QSB) without fading your own sidetone. `recBus` reaches
  // recordings only: the keyer's sidetone goes there when it's switched
  // off (your radio or adapter beeps instead) so a recording still has
  // your sending (Tim, 2026-11-02).
  var out = null, sig = null, recBus = null;
  function buses() {
    out = ctx.createGain(); out.connect(ctx.destination);
    sig = ctx.createGain(); sig.connect(out);
    recBus = ctx.createGain();
  }

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

  function tone(when, durSec, freqHz, peak, type, dest) {
    var osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freqHz;
    var g = ctx.createGain();
    var edge = Math.min(0.005, durSec / 4);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + edge);
    g.gain.setValueAtTime(peak, Math.max(when + edge, when + durSec - edge));
    g.gain.linearRampToValueAtTime(0, when + durSec);
    osc.connect(g).connect(dest || out);
    osc.start(when);
    osc.stop(when + durSec + 0.02);
    return osc;
  }

  // Schedule Morse from now (plus a 50 ms lead-in) into dest, keeping each
  // oscillator in list. Returns the seconds until the last element ends.
  function sendChars(chars, wpm, fwpm, freq, peak, dest, list) {
    var t = HST.timing(wpm, fwpm);
    var cursor = 0.05, now = ctx.currentTime;
    for (var idx = 0; idx < chars.length; idx++) {
      var ch = chars[idx], isLast = idx === chars.length - 1;
      if (ch === ' ') { if (!isLast) cursor += (7 * t.ts) / 1000; continue; }
      var code = HST.MORSE[ch] || HST.PROSIGN_CODE[ch] || '';
      for (var i = 0; i < code.length; i++) {
        var dur = (code[i] === '-' ? 3 * t.ta : t.ta) / 1000;
        list.push(tone(now + cursor, dur, freq, peak, 'sine', dest));
        cursor += dur;
        if (i < code.length - 1) cursor += t.ta / 1000;   // 1-unit gap inside a character
      }
      // 3-unit gap between characters, unless a word gap comes next
      if (!isLast && chars[idx + 1] !== ' ') cursor += (3 * t.ts) / 1000;
    }
    return cursor;
  }

  HST.audio = {
    // Create/resume the audio system. Browsers only allow this from a
    // tap or keypress, so call it from a click handler (e.g. Start).
    unlock: function () {
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); buses(); }
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
      live = [];
      var cursor = sendChars(chars, opts.wpm, opts.fwpm, opts.toneHz, peakFor(opts.volume), sig, live);
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
          osc.connect(g).connect(out);
          osc.start(t0);
          osc.stop(t0 + p[2] * 2 + 0.1);
        });
      });
    },

    // Where the keyer's sidetone goes: out (heard), and recBus (only
    // recorded, when the sidetone is switched off).
    output: function () { HST.audio.unlock(); return out; },
    recordOnly: function () { HST.audio.unlock(); return recBus; },

    recording: function () { return !!rec; },
    startRecording: startRecording,
    stopRecording: stopRecording,
    conditions: conditions
  };

  /* =====================================================================
     RECORDING (Tim, 2026-11-02): Record on Send This, Free Sending and
     the QSO tab saves what you hear (your sending, and in a QSO the other
     station too) as a WAV file. A ScriptProcessor copies the output as it
     plays; it's deprecated but works in every browser, and an
     AudioWorklet would need a separate module file. The sound is kept at
     16,000 samples a second (CW is all below 1,500 Hz), mono, 16-bit: about
     2 MB a minute. Recording stops by itself after 30 minutes.
     ===================================================================== */
  var REC_RATE = 16000, REC_MAX_S = 30 * 60;
  var rec = null;
  function startRecording(onLimit) {
    HST.audio.unlock();
    if (rec) return;
    var lp = ctx.createBiquadFilter();               // nothing above 7 kHz, so 16 kHz doesn't alias
    lp.type = 'lowpass'; lp.frequency.value = 7000;
    var proc = ctx.createScriptProcessor(4096, 1, 1);
    var mute = ctx.createGain(); mute.gain.value = 0;   // the processor only runs when connected onward
    out.connect(lp); recBus.connect(lp); lp.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    var r = { lp: lp, proc: proc, mute: mute, parts: [], n: 0, pos: 0, step: ctx.sampleRate / REC_RATE, onLimit: onLimit };
    proc.onaudioprocess = function (e) {
      if (rec !== r) return;
      var d = e.inputBuffer.getChannelData(0), o = [];
      // Resample to 16 kHz (linear), carrying the position across blocks.
      for (var p = r.pos; p < d.length - 1; p += r.step) {
        var i = Math.floor(p), f = p - i, v = d[i] * (1 - f) + d[i + 1] * f;
        o.push(Math.max(-32768, Math.min(32767, Math.round(v * 32767))));
      }
      r.pos = p - d.length;
      r.parts.push(Int16Array.from(o)); r.n += o.length;
      if (r.n >= REC_MAX_S * REC_RATE && r.onLimit) { var fn = r.onLimit; r.onLimit = null; setTimeout(fn, 0); }
    };
    rec = r;
  }
  // Stops and returns the recording as a WAV Blob (null if none).
  function stopRecording() {
    var r = rec;
    if (!r) return null;
    rec = null;
    try { out.disconnect(r.lp); recBus.disconnect(r.lp); } catch (e) {}
    r.proc.onaudioprocess = null;
    try { r.proc.disconnect(); r.mute.disconnect(); r.lp.disconnect(); } catch (e) {}
    var n = Math.min(r.n, REC_MAX_S * REC_RATE), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, x) { for (var i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, REC_RATE, true); v.setUint32(28, REC_RATE * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    var at = 44;
    for (var k = 0; k < r.parts.length && at < 44 + n * 2; k++) {
      var part = r.parts[k];
      for (var j = 0; j < part.length && at < 44 + n * 2; j++, at += 2) v.setInt16(at, part[j], true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  /* The adapters' Ctrl keys where nothing is listening for them (Tim,
     2026-11-02: a Vail adapter on an iPhone 15 played iOS's "can't do
     that" sound on every dit and dah in Keyer Setup). Key presses go to
     whichever frame last had focus -- the ICR tab keeps its answer box
     focused, for one -- and iOS sounds that alert for a Ctrl press no page
     says it handled. So every page here claims Left and Right Ctrl unless
     its own keyer is listening (HST.keyListening, set by attachKeyboard in
     hst-keyer.js), and while Keyer Setup is open in the app around it,
     passes the key out to it. (Ctrl with another key, like Ctrl+C, is a
     separate key event and isn't touched.) */
  ['keydown', 'keyup'].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if ((e.code !== 'ControlLeft' && e.code !== 'ControlRight') || HST.keyListening) return;
      e.preventDefault();
      try {
        var p = window.parent;
        if (p !== window && p.HCT && p.HCT.keyerSetupOpen && p.HCT.keyerSetupOpen()) {
          p.dispatchEvent(new p.KeyboardEvent(type, { code: e.code, key: e.key, ctrlKey: e.ctrlKey, repeat: e.repeat, bubbles: true, cancelable: true }));
        }
      } catch (err) {}
    }, true);
  });

  // Save a file to the device (the browser's download).
  HST.saveFile = function (blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  };

  // A Record button: tap to start, tap again to stop and save the WAV.
  //   HST.recordButton(button, { name: function () { return 'cw-sending'; }, onChange: fn(recording) })
  // The button reads "Record", then "Stop recording 0:12" while it records.
  // HST.recorderStop() stops and saves (the app calls it when you leave the tab).
  var recBtn = null;
  HST.recordButton = function (btn, o) {
    o = o || {};
    var label = btn.innerHTML, timer = null, t0 = 0;
    function draw() {
      var on = recBtn === me && HST.audio.recording();
      btn.classList.toggle('rec-on', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.innerHTML = on ? '<span class="rec-dot" aria-hidden="true"></span>Stop recording <span class="rec-time">' + HST.fmtClock(Date.now() - t0) + '</span>' : label;
    }
    function stop() {
      clearInterval(timer); timer = null;
      var blob = HST.audio.stopRecording();
      recBtn = null; draw();
      if (o.onChange) o.onChange(false);
      if (blob && blob.size > 44) {
        var d = new Date(), pad = function (x) { return ('0' + x).slice(-2); };
        HST.saveFile(blob, (o.name ? o.name() : 'cw-recording') + '-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
          '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.wav');
      }
    }
    var me = { stop: stop, button: btn };
    btn.addEventListener('click', function () {
      btn.blur();                      // so Enter (Done) or Space can't press it again
      if (recBtn === me) { stop(); return; }
      if (recBtn) recBtn.stop();
      HST.audio.startRecording(stop);
      recBtn = me; t0 = Date.now();
      timer = setInterval(draw, 500);
      draw();
      if (o.onChange) o.onChange(true);
    });
    return me;
  };
  HST.recorderStop = function () { if (recBtn) recBtn.stop(); };

  /* =====================================================================
     BAND CONDITIONS (Tim, 2026-11-02): QSO practice and Call Signs can
     sound like a real band.
       HST.audio.conditions({ noise: 0-100, qsb, qrn, qrm, toneHz, volume })
       HST.audio.conditions(null)        quiet again
       noise  receiver hiss, through a CW filter around your tone
       qsb    fading: the signal you copy slowly swells and fades
       qrn    static crashes from lightning
       qrm    another station sending nearby, a little off your frequency
     Call it again whenever a setting, the tone or the volume changes.
     ===================================================================== */
  var band = null, noiseBuf = null;
  function noiseBuffer() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function conditions(c) {
    var on = c && (c.noise > 0 || c.qsb || c.qrn || c.qrm);
    if (!on) { bandOff(); return; }
    HST.audio.unlock();
    if (!band) band = { c: c, qrmLive: [] };
    band.c = c;
    var peak = peakFor(c.volume), now = ctx.currentTime;

    // Hiss: white noise through a band-pass around the tone, like a CW filter.
    if (c.noise > 0) {
      if (!band.noise) {
        var src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
        var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
        var g = ctx.createGain(); g.gain.value = 0;
        src.connect(f).connect(g).connect(out); src.start();
        band.noise = { src: src, f: f, g: g };
      }
      band.noise.f.frequency.setTargetAtTime(c.toneHz, now, 0.05);
      // 100% hiss is about as strong as the signal: hard copy, not hopeless.
      band.noise.g.gain.setTargetAtTime((c.noise / 100) * peak * 3.2, now, 0.1);
    } else if (band.noise) { band.noise.src.stop(); band.noise.g.disconnect(); band.noise = null; }

    // Fading: a slow wobble on the signal's volume (every 7-12 s, down to about 15%).
    if (c.qsb && !band.qsb) {
      var lfo = ctx.createOscillator(); lfo.frequency.value = rnd(0.08, 0.14);
      var depth = ctx.createGain(); depth.gain.value = 0.42;
      sig.gain.setValueAtTime(0.57, now);
      lfo.connect(depth).connect(sig.gain); lfo.start();
      band.qsb = { lfo: lfo, depth: depth };
    } else if (!c.qsb && band.qsb) { qsbOff(); }

    // Static crashes, at random.
    if (c.qrn && !band.qrnTimer) crash();
    if (!c.qrn && band.qrnTimer) { clearTimeout(band.qrnTimer); band.qrnTimer = null; }

    // Another station.
    if (c.qrm && !band.qrmTimer) band.qrmTimer = setTimeout(qrmSend, rnd(800, 2500));
    if (!c.qrm && band.qrmTimer) { clearTimeout(band.qrmTimer); band.qrmTimer = null; qrmQuiet(); }
  }
  function qsbOff() {
    band.qsb.lfo.stop(); band.qsb.depth.disconnect(); band.qsb = null;
    sig.gain.cancelScheduledValues(0); sig.gain.setValueAtTime(1, ctx.currentTime);
  }
  function crash() {
    var b = band;
    var t0 = ctx.currentTime + 0.02, peak = peakFor(b.c.volume) * rnd(0.6, 2.2);
    var src = ctx.createBufferSource(); src.buffer = noiseBuffer();
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = rnd(1500, 3500);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.003);
    g.gain.setTargetAtTime(0, t0 + 0.003, rnd(0.02, 0.09));
    src.connect(f).connect(g).connect(out);
    src.start(t0, rnd(0, 1.5)); src.stop(t0 + 0.6);
    // Crashes come in clusters: often a quick one or two, then a pause.
    b.qrnTimer = setTimeout(function () { if (band === b && b.qrnTimer) crash(); }, Math.random() < 0.35 ? rnd(60, 250) : rnd(700, 3500));
  }
  var QRM_PREFIX = ['K', 'W', 'N', 'AA', 'KD', 'KE', 'WB', 'VE', 'G', 'DL', 'F', 'I', 'EA', 'JA', 'ON', 'PA', 'OH', 'SM'];
  function qrmCall() {
    var L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', c = QRM_PREFIX[Math.floor(Math.random() * QRM_PREFIX.length)] + Math.floor(rnd(0, 10));
    for (var i = 0, n = Math.random() < 0.5 ? 2 : 3; i < n; i++) c += L[Math.floor(Math.random() * 26)];
    return c;
  }
  function qrmSend() {
    var b = band;
    if (!b || !b.c.qrm) return;
    // The same station keeps going for a while, then someone else.
    if (!b.qrm || Math.random() < 0.25) {
      var off = rnd(150, 400) * (Math.random() < 0.5 ? -1 : 1);
      b.qrm = { call: qrmCall(), wpm: Math.round(rnd(14, 28)), off: off, level: rnd(0.25, 0.55) };
    }
    var q = b.qrm, other = qrmCall(), r = Math.random();
    var text = r < 0.35 ? 'CQ CQ DE ' + q.call + ' ' + q.call + ' K'
      : r < 0.55 ? 'TEST ' + q.call + ' ' + q.call
      : r < 0.75 ? other + ' DE ' + q.call + ' TU 5NN ' + Math.floor(rnd(1, 50)) + ' BK'
      : 'R TNX FER CALL UR RST 579 579 NAME ' + ['BOB', 'JIM', 'ANN', 'TOM', 'SUE', 'ED'][Math.floor(Math.random() * 6)] + ' HW? ' + other + ' DE ' + q.call + ' KN';
    var freq = Math.max(250, Math.min(1400, b.c.toneHz + q.off));
    b.qrmLive = b.qrmLive.filter(function (o) { return o.__end > ctx.currentTime; });
    var list = [];
    var secs = sendChars(text.split(''), q.wpm, undefined, freq, peakFor(b.c.volume) * q.level, out, list);
    list.forEach(function (o) { o.__end = ctx.currentTime + secs + 0.1; });
    b.qrmLive = b.qrmLive.concat(list);
    b.qrmTimer = setTimeout(qrmSend, secs * 1000 + rnd(1200, 6000));
  }
  function qrmQuiet() {
    if (!band) return;
    band.qrmLive.forEach(function (o) { try { o.stop(); } catch (e) {} });
    band.qrmLive = []; band.qrm = null;
  }
  function bandOff() {
    if (!band) return;
    if (band.noise) { try { band.noise.src.stop(); } catch (e) {} band.noise.g.disconnect(); }
    if (band.qsb) qsbOff();
    clearTimeout(band.qrnTimer); clearTimeout(band.qrmTimer);
    qrmQuiet();
    band = null;
  }

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
       { trainer: 'icr' | 'code-groups' | 'keyer' | 'qso' | 'test-prep' | 'call-signs' | 'jeopardy' | 'manual',
         start, end, durationMs,            // wall-clock times (ms)
         group, wpm, fwpm, groupSize,       // what was practiced, at what speed
         rounds, roundsCorrect, timeouts,   // ICR: 1 character per round
         charsTotal, charsCorrect,
         chars: { A: [correct, total], ... },
         timeSum, timeCount }               // ICR reaction / Code Groups answer
                                            // times (ms), timeouts excluded
     Keyer Practice records also carry: mode ('copy' | 'free'), source,
     keyType, sentChars, charGapSum/charGapN, wordGapSum/wordGapN (units),
     overallWpm, and for Daily Scales (mode 'warmup') skipped: blocks left
     after 5 missed tries. There, charsTotal/charsCorrect count only Copy this
     letters, and wpm is the measured character speed.
     ICR records also carry bySpeed: { '13': [right, total] } (Adaptive
     Speed changes the speed mid-session, so wpm alone can't say).
     QSO records (Milestone 7): style ('std' | 'pota'), who ('they' | 'you'
     called CQ), dxCall, theirWpm, completed, overs, copyRight/copyTotal
     (the copy check), plus the same sending fields as Keyer.
     Jeopardy records (jeopardy/index.html) are time played in an online
     room: mode ('online'), clues, right (copied correctly) and score
     (Your Score at the end).
     Test Prep records (test-prep/index.html) are one practice CW Academy
     placement test each: format ('full' | 'quick'), questions, answered,
     right, score (%), passed, completed (false if quit part-way),
     replays, and items [{ cat, sent, picked, ok, ms }].
     Call Signs records (call-signs/index.html) are recorder sessions
     like Code Groups', plus mode ('find' | 'builder' | 'sim' | 'run'),
     score (Find the Number / Speed Run points), topWpm (fastest call
     copied), minWpm / maxWpm (Simulator), and for a Speed Run runCalls,
     adapt, completed and items [{ sent, typed, wpm, ok, pts, replayed,
     timedOut }].
     Manual records are practice added by hand on the Progress tab:
     kind ('zoom' | 'on-air' | 'other'), dateOnly (true when added for an
     earlier day), and only the time fields above.

       HST.history.all()      -> Promise of every record, oldest first
       HST.history.add(rec)   -> Promise
       HST.history.clear()    -> Promise
     For syncing between devices (Milestone 8, shared/hst-account.js):
       every record gets a permanent random `uid` when it's saved, so the
       same session is recognized on every device; and
       HST.history.update(recs)     save changes to existing records (e.g. synced: true)
       HST.history.addMany(recs)    add sessions that came from other devices
       HST.history.removeBefore(t)  drop sessions that started before t
       HST.history.remove(uid)      drop one session (an unticked homework play)
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
    // Only on this device: sync never edits or deletes, so a copy already
    // synced stays on the account and other devices.
    remove: function (uid) {
      return HST.history.all().then(function (rows) {
        var gone = rows.filter(function (r) { return r.uid === uid; });
        if (!gone.length) return;
        return dbMany(function (s) { gone.forEach(function (r) { if (r.id != null) s.delete(r.id); }); })
          .then(function () { memoryOnly = memoryOnly.filter(function (r) { return r.uid !== uid; }); historyChanged(); });
      });
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
      // The draft is removed only once its session is safely saved (and only
      // if it's still that session's draft -- a new one may have started).
      // Removing it first lost the session when the app was closing at that
      // moment (2026-10-14). Each run has its uid from the start, so a
      // draft whose session did get saved isn't saved twice.
      function dropDraft(uid) {
        try {
          var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
          if (!d || d.uid === uid || !d.uid) localStorage.removeItem(DRAFT_KEY);
        } catch (e) {}
      }
      function commit(r) {
        // Nothing practiced: don't record. (Keyer Practice's Free send has
        // no right answers, so it counts characters sent instead; ICR with
        // Spacebar Mode off grades nothing and counts characters heard.)
        if (!r || !(r.charsTotal || r.sentChars || r.heard)) { dropDraft(r && r.uid); return Promise.resolve(); }
        r.end = r.end || r.start;            // a recovered draft ends at its last saved moment
        r.durationMs = Math.max(0, r.end - r.start);
        if (!r.uid) r.uid = HST.history.newUid();
        return HST.history.add(r).then(function () { dropDraft(r.uid); });
      }

      // Recover a session that was interrupted by closing the app (unless
      // it was saved after all, just before the app closed).
      try {
        var left = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (left) HST.history.all().then(function (rows) {
          if (left.uid && rows.some(function (x) { return x.uid === left.uid; })) dropDraft(left.uid);
          else commit(left);
        });
      } catch (e) {}

      return {
        start: function (meta) {
          if (run) commit(run);
          run = { trainer: trainer, uid: HST.history.newUid(), start: Date.now(), end: 0,
                  rounds: 0, roundsCorrect: 0, timeouts: 0,
                  charsTotal: 0, charsCorrect: 0, chars: {},
                  timeSum: 0, timeCount: 0 };
          Object.keys(meta || {}).forEach(function (k) { run[k] = meta[k]; });
          run.end = run.start;
          saveDraft();
        },
        // Still practicing: move the session's end to now (and save the
        // draft), at most every 5 s. For long attempts like the Warm Up,
        // so time spent before the app closes is still counted.
        // patch (optional): fields to update now, e.g. { sentChars: 12 },
        // so a session closed mid-attempt still counts as practice.
        alive: function (patch) {
          if (!run) return;
          if (patch) Object.keys(patch).forEach(function (k) { run[k] = patch[k]; });
          if (Date.now() - run.end < 5000) return;
          run.end = Date.now();
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
