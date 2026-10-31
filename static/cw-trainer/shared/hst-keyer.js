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
       weight    dah length in dits: always the standard 3.0 (the
                 adjustable "Dah length" setting was removed 2026-10-10)
       sidetone  play a tone while the key is down
     ===================================================================== */
  /* MIDI input is switched OFF for now (2026-10-09). In testing with a
     Vail adapter, the app's MIDI connection left the adapter unresponsive
     -- to keyboard as well -- until it was unplugged, and Edge's MIDI
     request sometimes never answered. The keyboard route (Left/Right Ctrl)
     works reliably, and it's what VBand and Morse Code World use too.
     While this is false: the Input method choice is hidden, a saved
     "midi" setting is treated as "keyboard", and the app never opens a
     MIDI connection or sends the adapter anything. The MIDI code below is
     kept for a later investigation; set this to true to bring it back. */
  HST.MIDI_ENABLED = false;

  HST.keyerSettings = makeStore('hct-cw-keyer-v1', function (o) {
    var startWpm = (HST.shared && HST.shared.get().wpm) || 20;
    return {
      adapter: pick(o.adapter, ['vail', 'vband', 'keyboard'], 'vail'),
      input: HST.MIDI_ENABLED ? pick(o.input, ['keyboard', 'midi'], 'keyboard') : 'keyboard',
      keyType: pick(o.keyType, ['iambicB', 'iambicA', 'straight', 'bug'], 'iambicB'),
      reversed: !!o.reversed,
      wpm: Math.round(num(o.wpm, 5, 40, startWpm)),
      weight: 3,   // standard dah = 3 dits; an older saved custom value is ignored
      sidetone: o.sidetone !== false
    };
  });

  /* ADAPTER DOES THE KEYING (Tim, 2026-10-14)
     A Vail adapter has its own keyer, and Vail Zoomer (or the adapter's
     own buttons) switches it on and sets its speed; the adapter saves
     that. Then a held paddle doesn't arrive as one long press but as
     finished dits and dahs at the ADAPTER's speed (Diagnostics showed a
     held dah as 210 ms on / 70 ms off, over and over). Timing those again
     with the app's own keyer garbled them whenever the app was slower.
     The app can't switch the adapter's keyer off: "passthrough" (MIDI
     Program Change 0) crashes the current firmware (keyers[0] is NULL in
     vail-adapter keyers.cpp), freezing it until replugged. So instead the
     keyer below RECOGNIZES the adapter's keying -- presses exactly 1 or 3
     units long with exactly 1-unit gaps, which a hand on a paddle doesn't
     produce -- and from then on simply follows it, like a straight key:
     tone on while the adapter says "down". The speed is the adapter's.
     It's remembered (all tools, every launch), and dropped again as soon
     as a press is too long to be the adapter's (a hand holding a paddle).
       on       true while the adapter is doing the keying
       unitMs   the adapter's dit length (its speed = 1200 / unitMs) */
  HST.adapterKeying = makeStore('hct-cw-adapter-keying-v1', function (o) {
    return { on: !!o.on, unitMs: Math.round(num(o.unitMs, 15, 300, 80)) };
  });
  // True when the app's own keyer makes the dits and dahs (paddles, and
  // the adapter isn't keying itself). Every tool's timing analysis uses it:
  // exact element lengths at the tool's speed, or learned from the sending.
  HST.keyerAutomatic = function () {
    var k = HST.keyerSettings.get().keyType;
    return (k === 'iambicA' || k === 'iambicB') && !HST.adapterKeying.get().on;
  };

  /* SETTING THE ADAPTER'S SPEED (Tim, 2026-10-14)
     Following the adapter fixes the stutter, but then its speed rules,
     and each tool's own speed setting would do nothing. So the app sets
     the adapter's speed to the speed of the tool being used, with the one
     MIDI command Vail Zoomer uses for that: Control Change 1, dit length
     in 2 ms steps (B0 01 vv). The firmware only stores the new length
     (adapter.cpp HandleMIDI, case 1), so this command is safe. The app
     never sends anything else: Program Change 0 crashes the adapter, and
     CC 0 would switch it out of keyboard mode.
     Opt-in (a button in Keyer Setup), Chrome and Edge only (Web MIDI).
     Sent only when the speed actually needs to change: when you start
     keying at a different speed than last sent, or when the adapter is
     heard keying at a speed other than the tool's (Vail Zoomer sets its
     own speed every time it connects). The port is opened, the command
     sent, and the port let go of straight away, so Vail Zoomer can still
     connect to the adapter. Only the top window talks MIDI; tool frames
     call it there.
       HST.vailSpeed.enable()        ask for MIDI (after a click) and switch this on
       HST.vailSpeed.disable()
       HST.vailSpeed.want(wpm, force)  make the adapter key at wpm
       HST.vailSpeed.state()         { on, supported, status } ; onChange(fn) */
  HST.midiSupported = !!navigator.requestMIDIAccess;
  HST.vailSpeedPrefs = makeStore('hct-cw-vail-speed-v1', function (o) { return { on: !!o.on }; });
  var topHST = null;
  try { topHST = window.top !== window && window.top.HST; } catch (e) {}
  if (topHST && topHST.vailSpeed) {
    HST.vailSpeed = topHST.vailSpeed;               // a tool inside the app: use the app's
  } else HST.vailSpeed = (function () {
    var VAIL_NAME = /vail|qt ?py|trinkey|xiao|seeed|adafruit/i;
    var access = null, asking = null, lastSent = null, lastAt = 0, status = '', fns = [];
    function changed(msg) {
      if (msg != null) status = msg;
      var s = api.state();
      fns.forEach(function (fn) { try { fn(s); } catch (e) { console.error(e); } });
    }
    // MIDI access, with a time limit: on Tim's PC the Windows MIDI service
    // once hung, and a request that never answers mustn't block anything.
    function getAccess() {
      if (access) return Promise.resolve(access);
      if (!HST.midiSupported) return Promise.reject(new Error('This browser can’t use MIDI. Chrome and Edge can.'));
      if (asking) return asking;
      asking = new Promise(function (resolve, reject) {
        var t = setTimeout(function () { asking = null; reject(new Error('The browser didn’t answer the MIDI request. Unplug the adapter and plug it back in, then try again.')); }, 8000);
        navigator.requestMIDIAccess().then(function (a) {
          clearTimeout(t); asking = null; access = a;
          a.onstatechange = function (e) { if (e && e.port && e.port.state === 'disconnected') lastSent = null; };
          resolve(a);
        }, function (err) {
          clearTimeout(t); asking = null;
          reject(new Error('MIDI is blocked for this site. Allow “MIDI devices” in the browser’s site settings, then try again.'));
        });
      });
      return asking;
    }
    function adapterPorts(a) {
      var out = [];
      a.outputs.forEach(function (p) { if (p.state === 'connected' && VAIL_NAME.test(p.name || '')) out.push(p); });
      return out;
    }
    function send(value) {
      return getAccess().then(function (a) {
        var ports = adapterPorts(a);
        if (!ports.length) throw new Error('No Vail adapter found among the MIDI devices. Is it plugged in?');
        return Promise.all(ports.map(function (p) {
          return (p.open ? p.open() : Promise.resolve()).then(function () {
            p.send([0xB0, 0x01, value]);                      // CC 1: dit length = value x 2 ms
            setTimeout(function () { try { if (p.close) p.close(); } catch (e) {} }, 400);
          });
        }));
      });
    }
    var api = {
      state: function () { return { on: HST.vailSpeedPrefs.get().on, supported: HST.midiSupported, status: status }; },
      onChange: function (fn) { fns.push(fn); },
      enable: function () {
        changed('Asking the browser for MIDI access… choose Allow if it asks.');
        return getAccess().then(function () {
          HST.vailSpeedPrefs.set({ on: true });
          lastSent = null;
          changed('The app now sets your adapter’s speed to the speed of the tool you’re using.');
          return true;
        }, function (e) { changed(e.message); return false; });
      },
      disable: function () { HST.vailSpeedPrefs.set({ on: false }); changed(''); },
      want: function (wpm, force) {
        if (!HST.vailSpeedPrefs.get().on || !HST.midiSupported) return;
        var value = Math.max(1, Math.min(127, Math.round(1200 / Math.max(5, wpm) / 2)));
        var now = performance.now();
        if (value === lastSent && !force) return;
        if (now - lastAt < 1500) return;                     // at most one command every 1.5 s
        lastAt = now;
        var prev = lastSent;
        lastSent = value;
        send(value).then(function () {
          HST.adapterKeying.set({ unitMs: value * 2 });
          changed('Adapter speed set to ' + Math.round(1200 / (value * 2)) + ' WPM.');
        }, function (e) { lastSent = prev; changed(e.message); });
      }
    };
    return api;
  })();

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
         raw: function (info) {...},       // every physical input, for the test panel
         wpm: function () {...}            // optional: keyer speed to use instead of Keyer Setup's
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
      // h.wpm (optional): a page can supply its own keyer speed, as the QSO
      // tab does with its "Your sending speed" setting. Otherwise the speed
      // from Keyer Setup is used.
      var c = cfg(), u = 1200 / ((h.wpm && h.wpm()) || c.wpm);
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
    // An event's own timestamp is the most precise "when", but only if it's
    // on the same clock as performance.now(); some browsers have reported
    // MIDI timestamps on another clock. If it's more than a second off, use now.
    function evTime(e) {
      var now = performance.now(), t = e && e.timeStamp;
      return (t && Math.abs(t - now) < 1000) ? t : now;
    }
    var KEYMAP = { ControlLeft: 'dit', ControlRight: 'dah', BracketLeft: 'dit', BracketRight: 'dah' };
    var last = { keyboard: {}, midi: {} };     // last press time per source, for comparing
    var cmp = { n: 0, sum: 0 };                 // keyboard-vs-MIDI arrival comparison

    function accepts(src) {
      var c = cfg();
      if (src === 'touch') return true;
      var useMidi = c.adapter === 'vail' && c.input === 'midi';
      return useMidi ? src === 'midi' : src === 'keyboard';
    }

    /* ---- recognizing an adapter that keys by itself (see HST.adapterKeying) ----
       Watches the adapter's key presses. Six in a row that are each 1 or 3
       units long (within ~20%), never overlapping, with at least three
       1-unit gaps between them, are the adapter's keyer at work -- as long
       as one paddle repeats with a 1-unit gap somewhere in them (a held
       paddle arriving as dah, dah, dah). A hand on paddles never does that
       with the app's keyer (it holds the paddle instead), but a steady hand
       sending AAAAA does press 1 and 3 units long with 1-unit gaps: before
       this check, that switched a student's iambic B to following, which
       plays like a straight key (Tim, 2026-10-31). */
    var watch = { down: {}, presses: [] };
    function following() {
      var c = cfg();
      return HST.adapterKeying.get().on && c.adapter !== 'keyboard' && c.keyType !== 'straight';
    }
    function near(x, target, tol) { return x >= target * (1 - tol) && x <= target * (1 + tol); }
    function looksKeyed(p) {
      var vals = [], gaps = [], i;
      for (i = 0; i < p.length; i++) {
        vals.push(p[i].e - p[i].s);
        if (i) {
          var g = p[i].s - p[i - 1].e;
          if (g < 0) return 0;                       // overlapping presses: a hand
          gaps.push(g);
          if (g < 400) vals.push(g);
        }
      }
      var u = Math.min.apply(null, vals);
      if (!(u >= 15 && u <= 250)) return 0;          // 5 to 80 WPM
      for (i = 0; i < p.length; i++) {
        var d = p[i].e - p[i].s;
        if (!near(d, u, 0.2) && !near(d, 3 * u, 0.15)) return 0;
      }
      var unitGaps = gaps.filter(function (g) { return g < 2 * u; });
      if (unitGaps.length < 3 || !unitGaps.every(function (g) { return near(g, u, 0.25); })) return 0;
      var repeat = false;                            // one paddle again, a unit later
      for (i = 1; i < p.length; i++) if (p[i].w === p[i - 1].w && near(p[i].s - p[i - 1].e, u, 0.25)) repeat = true;
      if (!repeat) return 0;
      // The unit: from the key-down lengths (dits as they are, dahs / 3).
      var sum = 0;
      for (i = 0; i < p.length; i++) { var dd = p[i].e - p[i].s; sum += near(dd, u, 0.2) ? dd : dd / 3; }
      return sum / p.length;
    }
    function observe(which, down, t) {
      var c = cfg();
      if (c.adapter === 'keyboard' || c.keyType === 'straight') return;
      var other = which === 'dit' ? 'dah' : 'dit';
      if (down) {
        // Both paddles down at once never comes from the adapter's keyer.
        if (watch.down[other] != null && following()) stopFollowing('both paddles held');
        watch.down[which] = t;
        // Starting to key: make sure the adapter keys at this tool's speed.
        if (following()) HST.vailSpeed.want(wantWpm());
        return;
      }
      var s = watch.down[which];
      delete watch.down[which];
      if (s == null) return;
      var ak = HST.adapterKeying.get();
      if (following()) {
        var d = t - s;
        if (d > 6.5 * ak.unitMs) { stopFollowing('a long press'); return; }   // a hand holding the paddle
        // The adapter's actual speed, from this element (a dit, or a dah / 3).
        var u = d < 2 * ak.unitMs ? d : d / 3;
        if (Math.abs(u - ak.unitMs) > 0.12 * ak.unitMs) {
          watch.offSpeed = (watch.offSpeed || 0) + 1;
          if (watch.offSpeed >= 2) {                 // keying at another speed (Vail Zoomer set it?)
            watch.offSpeed = 0;
            HST.adapterKeying.set({ unitMs: u });
            HST.vailSpeed.want(wantWpm(), true);
          }
        } else watch.offSpeed = 0;
        return;
      }
      watch.presses.push({ s: s, e: t, w: which });
      if (watch.presses.length > 6) watch.presses.shift();
      if (watch.presses.length < 6) return;
      var u = looksKeyed(watch.presses);
      if (u) {
        watch.presses = [];
        clearTimeout(st.timer); st.timer = null; st.busy = false;   // stop the app's own element sequence
        st.dit = st.dah = st.ditMem = st.dahMem = false; st.last = null;
        sideSilence();
        HST.adapterKeying.set({ on: true, unitMs: u });
        if (h.adapterKeying) h.adapterKeying(true, 1200 / u);
        HST.vailSpeed.want(wantWpm());
      }
    }
    // This tool's sending speed (the QSO and Jeopardy tabs have their own).
    function wantWpm() { return (h.wpm && h.wpm()) || cfg().wpm; }
    function stopFollowing(why) {
      watch.presses = [];
      HST.adapterKeying.set({ on: false });
      if (h.adapterKeying) h.adapterKeying(false, null, why);
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
      if (!info.accepted) return;
      if (src === 'keyboard' && which !== 'straight') {
        var was = following();
        observe(which, down, t);
        // While the adapter keys, its presses ARE the dits and dahs: one
        // contact, followed exactly. (The press that just switched this on
        // or off was already handled the other way.)
        if (was && following()) return manualInput('adapter', down, t);
        if (!was && following()) return;
        if (was) {                    // just stopped following: let go of the adapter's contact
          manualInput('adapter', false, t);
          if (!down) return;
        }
      }
      input(which, down, t, src + ':' + which);
    }

    // h.keyLog (optional): told about EVERY key event, mapped or not, so
    // Keyer Setup's Diagnostics can show exactly what a device sends.
    function logKey(e) {
      if (h.keyLog) h.keyLog({ type: e.type, code: e.code, key: e.key, ctrl: e.ctrlKey, repeat: e.repeat, t: evTime(e) });
    }
    function attachKeyboard(win) {
      function kd(e) {
        logKey(e);
        var w = KEYMAP[e.code];
        if (!w) return;
        // Tell the browser we've handled the key. For [ ] that stops them
        // being typed into fields. For the adapters' Left/Right Ctrl it
        // matters on iPhone/iPad: iOS treats Ctrl pressed with the other
        // Ctrl as an unknown keyboard shortcut and plays its "can't do
        // that" sound unless the page says it handled the key.
        e.preventDefault();
        if (e.repeat) return;
        feed('keyboard', w, true, evTime(e), e.code);
      }
      function ku(e) {
        logKey(e);
        var w = KEYMAP[e.code];
        if (!w) return;
        e.preventDefault();
        feed('keyboard', w, false, evTime(e), e.code);
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
    /* Commands to the adapter go through a queue, one at a time, with a
       pause after each. The adapter reads one MIDI message per pass of its
       main loop, and a keyer-type change (C0) makes it save to its memory,
       which takes a second or two. Tim's adapter froze -- dead to keyboard
       and MIDI until unplugged -- when several commands arrived in a burst
       during that save, so the queue waits 250 ms after an ordinary
       command and 2.5 s after a keyer-type change. */
    var queue = [], queueBusy = false;
    var GAP_MS = 250, SAVE_GAP_MS = 2500;
    function sendToVail(bytes, immediate) {
      if (immediate) return sendNow(bytes);      // page closing: no time to wait
      queue.push(bytes);
      if (!queueBusy) drain();
    }
    function drain() {
      var bytes = queue.shift();
      if (!bytes) { queueBusy = false; return; }
      queueBusy = true;
      sendNow(bytes);
      setTimeout(drain, bytes[0] === 0xC0 ? SAVE_GAP_MS : GAP_MS);
    }
    function sendNow(bytes) {
      vailOutputs().forEach(function (out) {
        try { out.send(bytes); } catch (e) { console.warn('MIDI send failed', e); }
        if (h.midiLog) h.midiLog('sent ' + bytes.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ') + ' to ' + out.name, performance.now(), true);
      });
    }
    function onMidi(e) {
      var d = e.data, cmd = d[0] & 0xf0, note = d[1], vel = d[2];
      var on = cmd === 0x90 && vel > 0, off = cmd === 0x80 || (cmd === 0x90 && vel === 0);
      var t = evTime(e);
      var hex = Array.prototype.map.call(d, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ');
      var which = { 0: 'straight', 1: 'dit', 2: 'dah' }[note];
      if (h.midiLog) h.midiLog(hex, t);      // every message, raw, for the Diagnostics log
      if ((on || off) && which) feed('midi', which, on, t, 'note ' + note + ' (' + hex + ')');
      else if (h.raw) h.raw({ src: 'midi', which: null, down: on, t: t, detail: 'message ' + hex, accepted: false });
    }
    function attachMidi() {
      // Belt and braces: with MIDI switched off, never touch the MIDI system.
      if (!HST.MIDI_ENABLED) return Promise.resolve({ ok: false, msg: 'MIDI input is turned off.' });
      if (!navigator.requestMIDIAccess) {
        return Promise.resolve({ ok: false, msg: 'This browser can’t read MIDI devices. Chrome and Edge can; Safari and Firefox can’t. Use the Keyboard input method instead.' });
      }
      if (midiAccess) return Promise.resolve(status());   // already connected
      return navigator.requestMIDIAccess().then(function (access) {
        try { return connected(access); }
        catch (e) {                            // never leave the panel saying "Connecting..."
          console.error(e);
          return { ok: false, msg: 'MIDI connected, but setting up the adapter failed (' + (e && e.message || e) + ').' };
        }
      }, function (err) {
        return { ok: false, msg: 'MIDI access was blocked (' + (err && err.message || err) + '). Allow MIDI for this site in the browser’s settings, or use the Keyboard input method.' };
      });
    }
    /* Switch the adapter to MIDI + passthrough ONCE per connection. Edge
       and Chrome fire several "statechange" events while a device connects
       (and again when the app opens its ports), and answering each one with
       a fresh setup is what flooded the adapter. So: wait until the events
       settle (400 ms), then set up any adapter output not set up yet. An
       output is forgotten when it's unplugged, so a replugged adapter (which
       starts in keyboard mode again) gets set up afresh. */
    var setupDone = {}, setupTimer = null;
    function scheduleSetup() {
      clearTimeout(setupTimer);
      setupTimer = setTimeout(function () {
        var fresh = vailOutputs().filter(function (out) { return !setupDone[out.id]; });
        if (!fresh.length) return;
        fresh.forEach(function (out) { setupDone[out.id] = true; });
        sendToVail(VAIL_MIDI_MODE);
        sendToVail(VAIL_PASSTHROUGH);
      }, 400);
    }
    function connected(access) {
        if (midiAccess === access) return status();   // already connected: nothing to resend
        midiAccess = access;
        function hook() {
          access.inputs.forEach(function (inp) { inp.onmidimessage = onMidi; });
          scheduleSetup();
        }
        hook();
        // If the app is closed while in MIDI mode, switch the adapter back too.
        // (Added once; it does nothing after detachMidi, which clears midiAccess.)
        if (!pagehideHooked) {
          pagehideHooked = true;
          window.addEventListener('pagehide', function () { sendToVail(VAIL_KEYBOARD_MODE, true); });
        }
        access.onstatechange = function (e) {   // adapter plugged in (or out) later
          if (!e || !e.port) return;
          if (e.port.state === 'disconnected') delete setupDone[e.port.id];
          else hook();
        };
        return status();
    }
    function status() {
        var names = [];
        if (midiAccess) midiAccess.inputs.forEach(function (inp) { names.push(inp.name); });
        var found = vailOutputs().length > 0;
        var msg = !names.length ? 'No MIDI device found yet. Plug in the Vail adapter.'
          : 'MIDI devices found: ' + names.join(', ') +
            (found ? '. Switching the adapter to MIDI mode (takes about 3 seconds).' : '. No Vail adapter output found to switch to MIDI mode.');
        return { ok: names.length > 0 && found, names: names, msg: msg };
    }
    function detachMidi() {
      if (!midiAccess) return;
      clearTimeout(setupTimer);
      queue = [];                               // drop any setup not yet sent
      // Hand the adapter back in keyboard mode, so it works as usual in
      // other apps (and in this one with the Keyboard input method).
      if (Object.keys(setupDone).length) sendToVail(VAIL_KEYBOARD_MODE);
      setupDone = {};
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

    // For Diagnostics: each MIDI port the browser sees, with its state.
    // state = connected/disconnected; connection = open/pending/closed
    // ("pending" usually means another program has the device open).
    function midiPorts() {
      if (!midiAccess) return [];
      var list = [];
      midiAccess.inputs.forEach(function (p) { list.push('in: ' + p.name + ' (' + p.state + ', ' + p.connection + ')'); });
      midiAccess.outputs.forEach(function (p) { list.push('out: ' + p.name + ' (' + p.state + ', ' + p.connection + ')'); });
      return list;
    }

    return {
      attachKeyboard: attachKeyboard,
      attachMidi: attachMidi,
      detachMidi: detachMidi,
      midiPorts: midiPorts,
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
  var PROSIGNS = { '.-.-.': '<AR>', '...-.-': '<SK>', '-.--.': '<KN>', '-...-': '<BT>', '-...-.-': '<BK>', '.-...': '<AS>', '........': '<HH>' };
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
        // o.spaceRatio (optional): Farnsworth sending, so a word space is longer.
        var sr = (o.spaceRatio && o.spaceRatio()) || 1;
        timers.push(setTimeout(function () { endChar(); if (o.onWord) o.onWord(); }, Math.max(0, t + 5 * u * sr - now)));
      },
      speedWpm: function () { return 1200 / unit(); },
      reset: function () { clearTimers(); code = ''; downT = null; ditEst = dahEst = null; }
    };
  };
  /* =====================================================================
     SENDING ANALYZER  (Milestone 6; the QSO tab reuses it)
       var a = HST.analyzeSending(marks, { unitMs: 60, automatic: true });
     marks = the key-down periods of one attempt, in order:
             [{ s: downTime, e: upTime }, ...]   (ms, performance.now clock)
     unitMs    = expected dit length (1200 / keyer WPM)
     automatic = true when an electronic keyer formed the dits and dahs
                 (iambic paddles), so their lengths are exact and only the
                 spacing is the operator's own.
     expectWords (optional) = how many words were meant to be sent. When
                 known (Copy this), the biggest gaps of 5+ units -- that
                 many minus one -- are the word breaks, and every other gap
                 is between letters however long. Without it, a learner's
                 extra-wide (Farnsworth) letter gaps would read as word gaps.

     THE TIMING RULES IT GRADES AGAINST. Everything is measured in "units",
     the length of one dit:
       dit = 1   dah = 3   gap inside a letter = 1
       gap between letters = 3   gap between words = 7
     A silence shorter than 2 units is therefore inside a letter, 2-5 units
     separates letters, and over 5 separates words (the midpoints).

     FINDING THE UNIT. With paddles the keyer sets it. With a straight key
     or a bug the operator's own dits and dahs set it, so the marks are
     split into two groups -- short (dits) and long (dahs) -- by repeatedly
     moving the dividing line to halfway between the two groups' averages.
     The dit average is the unit; dah average / dit average is the
     "weighting" ratio, ideally 3.

     Returns {
       unit, charWpm, overallWpm, ratio, ditMean, dahMean,
       chars: [{ text, code, first, last, start, end }],   // first/last = mark indexes
       words: [[charIndex, ...], ...],  text: 'CQ DE',
       gaps:  [{ after: charIndex, kind: 'char'|'word', units }],
       intra:   { mean, n },          // average gap inside letters, units (ideal 1)
       charGap: { mean, sd, n, tight, loose },   // between letters (ideal 3)
       wordGap: { mean, n }           // between words (ideal 7)
     } -- or null when there's nothing to analyze.
     ===================================================================== */
  HST.analyzeSending = function (marks, o) {
    if (!marks || !marks.length) return null;
    var durs = marks.map(function (m) { return Math.max(0, m.e - m.s); });

    // ---- the unit, and which marks are dahs ----
    var u, th, dits = [], dahs = [];
    function split(threshold) {
      dits = []; dahs = [];
      durs.forEach(function (d) { (d > threshold ? dahs : dits).push(d); });
    }
    function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
    if (o.automatic) {
      u = o.unitMs;
      split(2 * u);
    } else {
      th = 2 * o.unitMs;
      for (var it = 0; it < 4; it++) {
        split(th);
        if (dits.length && dahs.length) th = (mean(dits) + mean(dahs)) / 2;
      }
      u = dits.length ? mean(dits) : mean(dahs) / 3;
    }
    u = Math.max(u, 15);                       // guard: never shorter than 80 WPM
    var ditMean = mean(dits), dahMean = mean(dahs);

    // ---- group marks into letters and words by the silences between them ----
    var chars = [], gaps = [], intraGaps = [];
    var cur = { code: '', first: 0 };
    function isDah(i) { return o.automatic ? durs[i] > 2 * u : durs[i] > (th || 2 * u); }
    for (var i = 0; i < marks.length; i++) {
      cur.code += isDah(i) ? '-' : '.';
      var last = i === marks.length - 1;
      var gapMs = last ? Infinity : marks[i + 1].s - marks[i].e;
      var gapU = gapMs / u;
      if (gapU < 2) { intraGaps.push(gapU); continue; }
      chars.push({ code: cur.code, text: HST.decodeSymbol(cur.code), first: cur.first, last: i,
                   start: marks[cur.first].s, end: marks[i].e });
      // o.spaceRatio (optional, >= 1): the sender uses Farnsworth spacing,
      // gaps that much longer than standard, so the letter/word split moves
      // out by the same factor.
      if (!last) gaps.push({ after: chars.length - 1, kind: gapU < 5 * (o.spaceRatio || 1) ? 'char' : 'word', units: gapU });
      cur = { code: '', first: i + 1 };
    }

    if (o.expectWords) {
      var byLength = gaps.slice().sort(function (a, b) { return b.units - a.units; });
      gaps.forEach(function (g) { g.kind = 'char'; });
      byLength.slice(0, o.expectWords - 1).forEach(function (g) { if (g.units >= 5) g.kind = 'word'; });
    }

    var words = [[]];
    chars.forEach(function (c, k) {
      words[words.length - 1].push(k);
      var g = gaps[k];
      if (g && g.kind === 'word') words.push([]);
    });
    var text = words.map(function (w) { return w.map(function (k) { return chars[k].text; }).join(''); }).join(' ');

    // ---- spacing statistics ----
    // With Farnsworth (o.spaceRatio) every gap is meant to be that much
    // longer, so the "pause to think" cut-offs below stretch with it.
    var sr = o.spaceRatio || 1;
    // A letter gap over 10 units is a pause to think, not spacing -- left out too.
    var cg = gaps.filter(function (g) { return g.kind === 'char' && g.units <= 10 * sr; }).map(function (g) { return g.units; });
    // A word gap over 14 units is a pause to think, not spacing -- left out of the average.
    var wg = gaps.filter(function (g) { return g.kind === 'word' && g.units <= 14 * sr; }).map(function (g) { return g.units; });
    var cgMean = mean(cg);
    var cgSd = cg.length > 1 ? Math.sqrt(cg.reduce(function (a, x) { return a + (x - cgMean) * (x - cgMean); }, 0) / (cg.length - 1)) : 0;

    // ---- speeds ----
    // Character speed: how fast the dits and dahs themselves go.
    // Overall speed: the same text with the operator's own spacing -- what a
    // listener experiences. Thinking pauses are capped (10 units inside a
    // word, 14 between words) so one long pause doesn't swamp the number.
    var idealUnits = 0, actualMs = 0;
    chars.forEach(function (c, k) {
      for (var m = c.first; m <= c.last; m++) {
        idealUnits += c.code[m - c.first] === '-' ? 3 : 1;
        actualMs += durs[m];
        if (m < c.last) { idealUnits += 1; actualMs += marks[m + 1].s - marks[m].e; }
      }
      var g = gaps[k];
      if (g) {
        idealUnits += g.kind === 'word' ? 7 : 3;
        actualMs += Math.min(g.units, (g.kind === 'word' ? 14 : 10) * sr) * u;
      }
    });

    return {
      unit: u,
      charWpm: 1200 / u,
      overallWpm: actualMs > 0 ? 1200 * idealUnits / actualMs : 1200 / u,
      ratio: (!o.automatic && dits.length && dahs.length) ? dahMean / ditMean : null,
      ditMean: ditMean, dahMean: dahMean,
      chars: chars, words: words, text: text, gaps: gaps,
      intra: { mean: mean(intraGaps), n: intraGaps.length },
      charGap: { mean: cgMean, sd: cgSd, n: cg.length,
                 tight: cg.filter(function (x) { return x < 2.5 * sr; }).length,
                 loose: cg.filter(function (x) { return x > 4.5 * sr; }).length },
      wordGap: { mean: mean(wg), n: wg.length }
    };
  };

  /* Compare what was sent with what was asked for, letter by letter.
     Uses the same "edit distance" idea as a spelling checker: the fewest
     changes (a wrong letter, a missing one, an extra one) that turn the
     sent text into the target. Spaces are ignored here -- word spacing is
     judged separately -- so "CQDE" for "CQ DE" still scores its letters.
       HST.gradeSending('CQ DE', 'CQ DR')
       -> { correct: 4, total: 5, items: [{ want: 'C', got: 'C', ok: true }, ...,
                                          { want: 'E', got: 'R', ok: false }],
            extra: 0 }                                                       */
  function tokens(str) {
    var out = [], re = /<[A-Z]+>|[^\s]/g, m;
    while ((m = re.exec(str))) out.push(m[0]);
    return out;
  }
  HST.gradeSending = function (target, sent) {
    var T = tokens(target), S = tokens(sent), n = T.length, m = S.length;
    var d = [];
    for (var i = 0; i <= n; i++) { d.push([i]); for (var j = 1; j <= m; j++) d[i].push(i ? 0 : j); }
    for (i = 1; i <= n; i++) for (j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (T[i - 1] === S[j - 1] ? 0 : 1));
    }
    // Walk back from the end to see which change produced each step.
    var items = [], extra = 0;
    i = n; j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (T[i - 1] === S[j - 1] ? 0 : 1)) {
        items.unshift({ want: T[i - 1], got: S[j - 1], ok: T[i - 1] === S[j - 1] }); i--; j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
        items.unshift({ want: T[i - 1], got: '', ok: false }); i--;       // missed
      } else { extra++; j--; }                                           // sent something extra
    }
    var correct = items.filter(function (x) { return x.ok; }).length;
    return { correct: correct, total: n, items: items, extra: extra };
  };
})();
