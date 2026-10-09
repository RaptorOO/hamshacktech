/*
 * HamShackTech CW Trainer -- keyer engine  (Milestone 5)
 * =======================================================
 * Lets the app hear a real key. Loaded after hst-engine.js; adds:
 *
 *   HST.keyerSettings     adapter, key type, keyer speed, weight, sidetone
 *   HST.experimental      the "Experimental features" switch in Settings
 *   HST.createKeyer(h)    turns paddle / key presses into keyed signal,
 *                         with sidetone (see "KEYER" below)
 *   HST.createDecoder(o)  turns keyed signal back into letters
 *
 * HOW THE ADAPTERS REACH THE APP
 * Vail and VBand adapters plug in by USB and appear to the computer as a
 * keyboard: closing the dit paddle presses LEFT CTRL, the dah paddle
 * RIGHT CTRL (a straight key on the tip contact also shows up as left
 * Ctrl). The browser timestamps each press and release to a fraction of
 * a millisecond. The Vail adapter can also appear as a MIDI instrument;
 * Chrome and Edge can read that (Safari and Firefox can't).
 *
 * Everything here runs on the device -- no server, works offline.
 */
(function () {
  'use strict';

  var HST = window.HST;              // hst-engine.js must load first

  /* =====================================================================
     A small saved-settings helper, the same pattern as HST.shared:
     values live in localStorage, are cleaned on the way in, and every
     page/frame of the app hears about changes (the "storage" event).
     ===================================================================== */
  function makeStore(key, clean) {
    var listeners = [];
    var cur;
    try { cur = clean(JSON.parse(localStorage.getItem(key) || 'null') || {}); }
    catch (e) { cur = clean({}); }
    function notify() { var c = copy(); listeners.forEach(function (fn) { try { fn(c); } catch (e) { console.error(e); } }); }
    function copy() { return JSON.parse(JSON.stringify(cur)); }
    window.addEventListener('storage', function (e) {
      if (e.key !== key || !e.newValue) return;
      try { cur = clean(JSON.parse(e.newValue)); notify(); } catch (err) {}
    });
    return {
      get: copy,
      set: function (patch) {
        var next = copy();
        Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
        cur = clean(next);
        try { localStorage.setItem(key, JSON.stringify(cur)); } catch (e) {}
        notify();
      },
      onChange: function (fn) { listeners.push(fn); }
    };
  }

  function pick(v, allowed, dflt) { return allowed.indexOf(v) >= 0 ? v : dflt; }
  function num(v, lo, hi, dflt) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; }

  /* =====================================================================
     KEYER SETTINGS
       adapter   'vail' | 'vband' | 'keyboard' (no adapter)
       input     'keyboard' | 'midi'   (MIDI is a Vail-adapter option)
       keyType   'iambicB' (default) | 'iambicA' | 'straight' | 'bug'
       reversed  swap dit and dah (e.g. left-handed operators)
       wpm       keyer speed; for a straight key, the decoder's starting guess
       weight    dah length in dits (3.0 is standard)
       sidetone  play a tone while the key is down
     ===================================================================== */
  HST.keyerSettings = makeStore('hct-cw-keyer-v1', function (o) {
    var startWpm = (HST.shared && HST.shared.get().wpm) || 20;
    return {
      adapter: pick(o.adapter, ['vail', 'vband', 'keyboard'], 'vail'),
      input: pick(o.input, ['keyboard', 'midi'], 'keyboard'),
      keyType: pick(o.keyType, ['iambicB', 'iambicA', 'straight', 'bug'], 'iambicB'),
      reversed: !!o.reversed,
      wpm: Math.round(num(o.wpm, 5, 40, startWpm)),
      weight: Math.round(num(o.weight, 2.5, 4.5, 3) * 10) / 10,
      sidetone: o.sidetone !== false
    };
  });

  // "Experimental features" switch. Off by default; tools still being
  // built stay hidden until a tester turns this on.
  HST.experimental = makeStore('hct-cw-experimental-v1', function (o) { return { on: !!o.on }; });

  /* =====================================================================
     SIDETONE
     One oscillator runs continuously at zero volume; keying just ramps
     its volume up and down over 4 ms. Starting a fresh oscillator on
     every key-down would add a few ms of setup delay, and switching the
     sound on/off instantly would click (the same reason transmitters
     shape their keying to avoid "key clicks").
     ===================================================================== */
  var side = null;
  function sideNode() {
    var ctx = HST.audio.unlock();     // creates/resumes the shared AudioContext
    if (!side || side.ctx !== ctx) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(ctx.destination);
      osc.start();
      side = { ctx: ctx, osc: osc, g: g };
    }
    return side;
  }
  function sidePeak() { return (HST.shared.get().volume / 100) * 0.35; }  // same loudness as the trainers
  var EDGE = 0.004;                   // 4 ms rise/fall

  // Key down/up right now (straight key, bug dahs).
  function sideNow(on) {
    var s = sideNode(), now = s.ctx.currentTime, g = s.g.gain;
    s.osc.frequency.setValueAtTime(HST.shared.get().toneHz, now);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? sidePeak() : 0, now + EDGE);
  }
  // One whole element scheduled ahead on the audio clock (keyer dits/dahs):
  // exact durations, regardless of how promptly JavaScript timers fire.
  function sideElement(perfStart, durMs) {
    var s = sideNode(), g = s.g.gain, peak = sidePeak();
    // Convert a performance.now() time to the audio clock.
    var a0 = Math.max(s.ctx.currentTime, s.ctx.currentTime + (perfStart - performance.now()) / 1000);
    var a1 = a0 + durMs / 1000;
    s.osc.frequency.setValueAtTime(HST.shared.get().toneHz, a0);
    g.cancelScheduledValues(a0);
    g.setValueAtTime(0, a0);
    g.linearRampToValueAtTime(peak, a0 + EDGE);
    g.setValueAtTime(peak, Math.max(a0 + EDGE, a1 - EDGE));
    g.linearRampToValueAtTime(0, a1);
  }
  function sideSilence() {
    if (!side) return;
    var now = side.ctx.currentTime;
    side.g.gain.cancelScheduledValues(0);
    side.g.gain.setValueAtTime(0, now);
  }

  // How much delay the browser says its audio output adds (ms), if it says.
  HST.audioLatencyMs = function () {
    var ctx = HST.audio.unlock();
    var ms = ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000;
    return ms > 0 ? ms : null;
  };

  /* =====================================================================
     KEYER
       var k = HST.createKeyer({
         key: function (down, t) {...},    // keyed signal: key down/up at time t (ms, performance.now clock)
         raw: function (info) {...}        // every physical input, for the test panel
       });
       k.attachKeyboard(window)  -> detach function
       k.attachMidi()            -> Promise of { ok, msg, names }
       k.touch('dit'|'dah', down)   on-screen paddles
       k.reset()                 stop everything (closing the panel, switching tabs)

     IAMBIC KEYING (paddles). Hold the dit paddle: a stream of dits.
     Hold dah: dahs. Squeeze both: dit-dah-dit-dah alternating, which is
     how C (-.-.) becomes one squeeze. Each element is followed by exactly
     one dit of silence, so spacing inside a character is always perfect.
     A paddle pressed while an element is sounding is remembered and sent
     next ("paddle memory"). Modes A and B differ only when a squeeze is
     released: Mode B sends one more, opposite element; Mode A just
     finishes the current one. (Mode B is the common default; Mode A is
     often preferred by operators who learned on older keyers.)

     BUG (semi-automatic): the dit side makes automatic dits, the dah side
     is a manual contact, like a Vibroplex.

     STRAIGHT KEY: the sound follows the key exactly.
     ===================================================================== */
  HST.createKeyer = function (h) {
    h = h || {};
    var st = {
      dit: false, dah: false,          // paddle positions (after any swap)
      ditMem: false, dahMem: false,    // remembered presses
      busy: false, cur: null, last: null, timer: null,
      manual: {}, manualDown: false,   // inputs holding a manual contact closed
      pending: []                      // timers emitting scheduled key events
    };
    var cfg = function () { return HST.keyerSettings.get(); };

    function emit(down, t) {
      // Deliver the key event when it actually happens on the clock.
      var wait = t - performance.now();
      if (wait <= 1) { if (h.key) h.key(down, t); return; }
      var id = setTimeout(function () {
        st.pending.splice(st.pending.indexOf(id), 1);
        if (h.key) h.key(down, t);
      }, wait);
      st.pending.push(id);
    }

    // ---- manual contact (straight key, bug dah side) ----
    function manualInput(id, down, t) {
      if (down) st.manual[id] = true; else delete st.manual[id];
      var isDown = Object.keys(st.manual).length > 0;
      if (isDown === st.manualDown) return;
      st.manualDown = isDown;
      if (cfg().sidetone) sideNow(isDown);
      emit(isDown, t);
    }

    // ---- automatic elements (iambic, bug dits) ----
    function startElement(el, t0) {
      var c = cfg(), u = 1200 / c.wpm;
      var dur = el === 'dit' ? u : u * c.weight;
      st.busy = true; st.cur = el; st.last = el;
      st[el + 'Mem'] = false;
      // Mode B: an opposite paddle already held as this element starts
      // (a squeeze) is remembered, so letting go mid-element still sends it.
      var opp = el === 'dit' ? 'dah' : 'dit';
      if (c.keyType === 'iambicB' && st[opp]) st[opp + 'Mem'] = true;
      if (c.sidetone) sideElement(t0, dur);
      emit(true, t0);
      emit(false, t0 + dur);
      var nextAt = t0 + dur + u;       // one dit of silence after every element
      // Decide the next element ~4 ms early so it can be scheduled exactly on time.
      st.timer = setTimeout(function () { decide(nextAt); }, Math.max(0, nextAt - performance.now() - 4));
    }

    function decide(nextAt) {
      st.busy = false; st.timer = null;
      var bug = cfg().keyType === 'bug';
      var wantDit = st.dit || st.ditMem;
      var wantDah = !bug && (st.dah || st.dahMem);
      var el = null;
      // After a dit prefer a dah, after a dah prefer a dit: that's the
      // alternation of a squeeze. One paddle alone just repeats.
      if (st.last === 'dit') el = wantDah ? 'dah' : (wantDit ? 'dit' : null);
      else el = wantDit ? 'dit' : (wantDah ? 'dah' : null);
      if (el) startElement(el, Math.max(nextAt, performance.now()));
      else { st.ditMem = st.dahMem = false; st.last = null; }
    }

    function paddle(which, down, t) {
      st[which] = down;
      if (!down) return;
      if (st.busy) { if (which !== st.cur) st[which + 'Mem'] = true; }   // paddle memory
      else startElement(which, Math.max(t, performance.now()));
    }

    // ---- route one physical input by key type ----
    // which: 'dit' | 'dah' | 'straight' ; id: unique per physical contact
    function input(which, down, t, id) {
      var c = cfg();
      if (c.reversed && which !== 'straight') which = which === 'dit' ? 'dah' : 'dit';
      if (c.keyType === 'straight' || which === 'straight') return manualInput(id, down, t);
      if (c.keyType === 'bug') return which === 'dah' ? manualInput(id, down, t) : paddle('dit', down, t);
      paddle(which, down, t);
    }

    /* ---- inputs from the keyboard (adapters in keyboard mode) ----
       Left/Right Ctrl = dit/dah from an adapter. With no adapter, the [ and ]
       keys do the same. Held keys auto-repeat keydown events; those are ignored. */
    var KEYMAP = { ControlLeft: 'dit', ControlRight: 'dah', BracketLeft: 'dit', BracketRight: 'dah' };
    var last = { keyboard: {}, midi: {} };     // last press time per source, for comparing
    var cmp = { n: 0, sum: 0 };                 // keyboard-vs-MIDI arrival comparison

    function accepts(src) {
      var c = cfg();
      if (src === 'touch') return true;
      var useMidi = c.adapter === 'vail' && c.input === 'midi';
      return useMidi ? src === 'midi' : src === 'keyboard';
    }

    function feed(src, which, down, t, detail) {
      var info = { src: src, which: which, down: down, t: t, detail: detail, accepted: accepts(src) };
      // When one press arrives by BOTH routes (a Vail adapter can send
      // keyboard and MIDI at once), record which arrived first and by how much.
      if (down && (src === 'keyboard' || src === 'midi')) {
        last[src][which] = t;
        var other = last[src === 'keyboard' ? 'midi' : 'keyboard'][which];
        if (other != null && Math.abs(t - other) < 80) {
          var kbMinusMidi = src === 'keyboard' ? t - other : other - t;
          cmp.n++; cmp.sum += kbMinusMidi;
          info.compare = { kbMinusMidi: kbMinusMidi, avg: cmp.sum / cmp.n, n: cmp.n };
        }
      }
      if (h.raw) h.raw(info);
      if (info.accepted) input(which, down, t, src + ':' + which);
    }

    function attachKeyboard(win) {
      function kd(e) {
        var w = KEYMAP[e.code];
        if (!w) return;
        if (e.code.indexOf('Bracket') === 0) e.preventDefault();   // don't type [ ] into fields
        if (e.repeat) return;
        feed('keyboard', w, true, e.timeStamp || performance.now(), e.code);
      }
      function ku(e) {
        var w = KEYMAP[e.code];
        if (!w) return;
        feed('keyboard', w, false, e.timeStamp || performance.now(), e.code);
      }
      // If the window loses focus with a key held, its key-up never arrives.
      function blur() { releaseAll(); }
      win.addEventListener('keydown', kd, true);
      win.addEventListener('keyup', ku, true);
      win.addEventListener('blur', blur);
      return function () {
        win.removeEventListener('keydown', kd, true);
        win.removeEventListener('keyup', ku, true);
        win.removeEventListener('blur', blur);
      };
    }

    /* ---- inputs from MIDI (Vail adapter) ----
       From the Vail adapter's MIDI spec (github.com/Vail-CW/vail-adapter,
       docs/MIDI_INTEGRATION_SPEC.md):
         - It sends note on/off on channel 1: note 0 = straight key,
           1 = dit, 2 = dah. "Note on" is a contact closing; "note off"
           (or note on with velocity 0) is it opening.
         - It ALWAYS powers up in keyboard mode and sends no notes until
           the host tells it to switch: Control Change 0 with a value below
           64 (B0 00 00) = MIDI mode; 64 or above (B0 00 7F) = keyboard mode.
           This setting isn't saved, so it's sent every time.
         - Program Change 0 (C0 00) selects "passthrough": the adapter
           reports each paddle as-is and the app does the dit/dah timing --
           the same setting the Vail web repeater uses. (The adapter saves
           its keyer type, but every host that uses it sets its own.) */
    var midiAccess = null, pagehideHooked = false;
    var VAIL_MIDI_MODE = [0xB0, 0x00, 0x00];      // CC0 = 0   -> MIDI mode
    var VAIL_KEYBOARD_MODE = [0xB0, 0x00, 0x7F];  // CC0 = 127 -> keyboard mode
    var VAIL_PASSTHROUGH = [0xC0, 0x00];          // Program Change 0 -> passthrough

    // Only talk to outputs that look like a Vail adapter. These commands
    // mean "bank select" and "change instrument" to an ordinary MIDI synth,
    // so they aren't sent to just any device. Vail adapters are built on
    // Adafruit QT Py / Trinkey and Seeed XIAO boards, which is the name the
    // computer sees. If there's exactly one MIDI output, it's used regardless.
    function vailOutputs() {
      if (!midiAccess) return [];
      var all = [];
      midiAccess.outputs.forEach(function (out) { all.push(out); });
      var named = all.filter(function (out) { return /vail|qt ?py|trinkey|xiao|seeed/i.test(out.name || ''); });
      return named.length ? named : (all.length === 1 ? all : []);
    }
    function sendToVail(bytes) {
      vailOutputs().forEach(function (out) { try { out.send(bytes); } catch (e) { console.warn('MIDI send failed', e); } });
    }
    function onMidi(e) {
      var d = e.data, cmd = d[0] & 0xf0, note = d[1], vel = d[2];
      var on = cmd === 0x90 && vel > 0, off = cmd === 0x80 || (cmd === 0x90 && vel === 0);
      var t = e.timeStamp || performance.now();
      var hex = Array.prototype.map.call(d, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ');
      var which = { 0: 'straight', 1: 'dit', 2: 'dah' }[note];
      if ((on || off) && which) feed('midi', which, on, t, 'note ' + note + ' (' + hex + ')');
      else if (h.raw) h.raw({ src: 'midi', which: null, down: on, t: t, detail: 'message ' + hex, accepted: false });
    }
    function attachMidi() {
      if (!navigator.requestMIDIAccess) {
        return Promise.resolve({ ok: false, msg: 'This browser can’t read MIDI devices. Chrome and Edge can; Safari and Firefox can’t. Use the Keyboard input method instead.' });
      }
      return navigator.requestMIDIAccess().then(function (access) {
        midiAccess = access;
        var names = [];
        function hook() {
          names.length = 0;
          access.inputs.forEach(function (inp) { inp.onmidimessage = onMidi; names.push(inp.name); });
          // Switch the adapter to MIDI + passthrough. Repeated whenever a
          // device appears, since a replugged adapter starts in keyboard mode.
          sendToVail(VAIL_MIDI_MODE);
          sendToVail(VAIL_PASSTHROUGH);
        }
        hook();
        // If the app is closed while in MIDI mode, switch the adapter back too.
        // (Added once; it does nothing after detachMidi, which clears midiAccess.)
        if (!pagehideHooked) {
          pagehideHooked = true;
          window.addEventListener('pagehide', function () { sendToVail(VAIL_KEYBOARD_MODE); });
        }
        access.onstatechange = function (e) {   // adapter plugged in (or out) later
          if (e && e.port && e.port.state === 'connected') hook();
        };
        var sent = vailOutputs().length > 0;
        var msg = !names.length ? 'No MIDI device found yet. Plug in the Vail adapter.'
          : 'MIDI devices found: ' + names.join(', ') +
            (sent ? '. Adapter switched to MIDI mode.' : '. No Vail adapter output found to switch to MIDI mode.');
        return { ok: names.length > 0 && sent, names: names, msg: msg };
      }, function (err) {
        return { ok: false, msg: 'MIDI access was blocked (' + (err && err.message || err) + '). Allow MIDI for this site in the browser’s settings, or use the Keyboard input method.' };
      });
    }
    function detachMidi() {
      if (!midiAccess) return;
      // Hand the adapter back in keyboard mode, so it works as usual in
      // other apps (and in this one with the Keyboard input method).
      sendToVail(VAIL_KEYBOARD_MODE);
      midiAccess.inputs.forEach(function (inp) { inp.onmidimessage = null; });
      midiAccess.onstatechange = null;
      midiAccess = null;
    }

    function releaseAll() {
      var t = performance.now();
      st.dit = st.dah = st.ditMem = st.dahMem = false;
      Object.keys(st.manual).forEach(function (id) { delete st.manual[id]; });
      if (st.manualDown) { st.manualDown = false; if (cfg().sidetone) sideNow(false); emit(false, t); }
    }

    function reset() {
      releaseAll();
      clearTimeout(st.timer); st.timer = null; st.busy = false; st.last = null;
      st.pending.forEach(clearTimeout); st.pending = [];
      sideSilence();
      cmp.n = 0; cmp.sum = 0;
    }

    return {
      attachKeyboard: attachKeyboard,
      attachMidi: attachMidi,
      detachMidi: detachMidi,
      touch: function (which, down) { feed('touch', which, down, performance.now(), 'on-screen pad'); },
      reset: reset
    };
  };

  /* =====================================================================
     DECODER -- keyed signal back into letters
       var d = HST.createDecoder({
         unitMs: function () {...},      // expected dit length (from keyer speed)
         adaptive: function () {...},    // true for straight key / bug: learn the sender's speed
         onChar: function (text, code) {...},
         onWord: function () {...}
       });
       d.down(t); d.up(t);   d.speedWpm();   d.reset();

     Standard Morse timing, all in units of one dit:
       dah = 3   gap inside a character = 1
       gap between characters = 3       gap between words = 7
     So a mark longer than 2 units is a dah; a silence longer than 2 units
     ends the character; longer than 5 ends the word (the midpoints).
     A straight-key sender's speed drifts, so in adaptive mode the decoder
     keeps running averages of their dit and dah lengths and splits marks
     halfway between them.
     ===================================================================== */
  var PROSIGNS = { '.-.-.': '<AR>', '...-.-': '<SK>', '-.--.': '<KN>', '-...-': '<BT>', '-...-.-': '<BK>', '........': '<HH>' };
  var REVERSE = {};
  Object.keys(HST.MORSE).forEach(function (ch) { REVERSE[HST.MORSE[ch]] = ch; });
  HST.decodeSymbol = function (code) { return PROSIGNS[code] || REVERSE[code] || '*'; };

  HST.createDecoder = function (o) {
    var code = '', downT = null, timers = [];
    var ditEst = null, dahEst = null;
    var BOUNCE_MS = 8;   // shorter than this is contact bounce, not a dit

    function base() { return o.unitMs(); }
    function unit() { return o.adaptive() && ditEst ? ditEst : base(); }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function endChar() {
      if (!code) return;
      var c = code; code = '';
      if (o.onChar) o.onChar(HST.decodeSymbol(c), c);
    }

    return {
      down: function (t) {
        clearTimers();
        downT = t;
      },
      up: function (t) {
        if (downT == null) return;
        var dur = t - downT; downT = null;
        if (dur < BOUNCE_MS) return;
        var isDah;
        if (o.adaptive()) {
          if (!ditEst) { ditEst = base(); dahEst = 3 * base(); }
          isDah = dur > (ditEst + dahEst) / 2;
          // Running averages: each new element moves the estimate 25% toward itself.
          if (isDah) dahEst = 0.75 * dahEst + 0.25 * dur;
          else ditEst = 0.75 * ditEst + 0.25 * dur;
        } else {
          isDah = dur > 2 * base();
        }
        code += isDah ? '-' : '.';
        var u = unit(), now = performance.now();
        timers.push(setTimeout(endChar, Math.max(0, t + 2 * u - now)));
        timers.push(setTimeout(function () { endChar(); if (o.onWord) o.onWord(); }, Math.max(0, t + 5 * u - now)));
      },
      speedWpm: function () { return 1200 / unit(); },
      reset: function () { clearTimers(); code = ''; downT = null; ditEst = dahEst = null; }
    };
  };
})();
