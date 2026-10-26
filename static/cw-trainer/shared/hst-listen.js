/*
 * HamShackTech CW Trainer -- hands-free listening player (Car / Walk Mode)
 * ========================================================================
 * Plays practice that keeps going with the phone's screen off: ICR's Car
 * and Walk Mode, and Code Groups' Walk Mode. Loaded after hst-engine.js.
 *
 * WHY IT RENDERS AUDIO FILES. Phones stop a page's Web Audio (and its
 * timers) once the screen locks, but they keep playing an ordinary
 * <audio> element, like a podcast. So the practice is built as audio
 * ahead of time: about 90 seconds at a time, the Morse (and, in Walk
 * Mode, the spoken answer) is rendered offline into a WAV and played
 * through one <audio> element, with the next stretch queued while the
 * current one plays. Media Session puts the title and play/pause on the
 * lock screen; a pause there pauses the time left too. The phone's own
 * speech (speechSynthesis) can't be used: it goes silent when the
 * screen locks. (Tim, 2026-10-15; moved here from the ICR tab 2026-10-16
 * when Code Groups got Walk Mode.)
 *
 * THE VOICE is bundled clips, voice/<name>.mp3, one per character, spoken
 * by the Kokoro voice "af_heart" (Apache 2.0) and recorded once: letter
 * names, digits, and punctuation names. The answer is spelled out one
 * character at a time ("Tee, Aitch, Ee").
 * Each clip was made from a spelling Kokoro reads as the letter's name
 * ("Bee", "Kay", "Double you"...). Check the sound when re-recording: A was
 * first made from "Ay", which Kokoro says like "I" (phonemes /aI/ instead
 * of /eI/), so users heard "I" for A. It's now made from "Eh", which comes
 * out as /eI/, the same vowel as in "Kay" (fixed 2026-10-16).
 *
 *   var p = HST.listen.createPlayer({
 *     title:   function () { return 'Walk Mode'; },     // lock-screen title
 *     minutes: 15,
 *     next:    function () { return { text: 'K', plays: 5, gap: 2 }; },
 *              // one item: sent `plays` times, `gap` seconds of quiet after
 *              // each play; called as the audio is built, ahead of time
 *     voice:   true,             // spell the item after its last play
 *     sound:   function () { return { wpm: 20, fwpm: 0, toneHz: 600, volume: 70 }; },
 *     onShow:  function (ev) {},   // { text, play, plays } now sounding
 *     onTick:  function (msLeft) {},
 *     onPause: function (paused) {},
 *     onEnd:   function (heard) {}  // the time ran out (the bell has rung), or Stop on the lock screen
 *   });
 *   p.start()    // call from the Play tap (iPhones need that)
 *   p.restart()  // the speed changed: start a fresh item at the new speed
 *   p.stop()     // returns how many items were heard
 *   p.heard()    // items heard so far
 * start() returns a Promise that rejects if the voice can't load.
 */
(function () {
  'use strict';

  var HST = window.HST;
  var RATE = 24000;            // sample rate of the rendered audio (the clips' rate)
  var CHUNK_S = 90;            // seconds of practice rendered at a time
  var VOICE_AFTER_S = 1.0;     // quiet after the spoken answer
  var SPELL_GAP_S = 0.08;      // between spelled characters
  var WORD_GAP_S = 0.3;        // ...and a bit more at a space

  // Clip file for each character the trainers can send.
  var CLIP = { '?': 'qmark', '/': 'slash', "'": 'apos', '.': 'period', ',': 'comma',
               '=': 'equals', '-': 'dash', '(': 'lparen', ')': 'rparen' };
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').forEach(function (c) { CLIP[c] = c; });

  var voicePromise = null, silentUrl = null;

  // Every clip, decoded once, as { char: AudioBuffer }.
  function loadVoice() {
    if (voicePromise) return voicePromise;
    var ctx = HST.audio.unlock(), chars = Object.keys(CLIP);
    voicePromise = Promise.all(chars.map(function (c) {
      return fetch(voiceUrl(CLIP[c]))
        .then(function (r) { if (!r.ok) throw new Error(c); return r.arrayBuffer(); })
        .then(function (b) { return new Promise(function (ok, bad) { ctx.decodeAudioData(b, ok, bad); }); });
    })).then(function (bufs) {
      var m = {}; chars.forEach(function (c, i) { m[c] = bufs[i]; }); return m;
    }).catch(function (e) { voicePromise = null; throw e; });
    return voicePromise;
  }
  // The clips live in cw-trainer/voice/, next to this file's folder.
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/shared\/[^\/]*$/, 'voice/') : '../voice/';
  })();
  function voiceUrl(name) { return BASE + name + '.mp3'; }

  // One shaped tone burst (5 ms fades, like the live sidetone).
  function tone(octx, when, dur, hz, peak) {
    var osc = octx.createOscillator(); osc.frequency.value = hz;
    var g = octx.createGain(), edge = Math.min(0.005, dur / 4);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + edge);
    g.gain.setValueAtTime(peak, Math.max(when + edge, when + dur - edge));
    g.gain.linearRampToValueAtTime(0, when + dur);
    osc.connect(g).connect(octx.destination);
    osc.start(when); osc.stop(when + dur + 0.01);
  }
  // The end-of-time bell: the Practice Timer bell's recipe (HST.audio.bell),
  // but about 2.5 times as loud and struck four times, for the car (Tim,
  // 2026-10-25: "the timer did not buzz"; at the old level it measured
  // about a third as loud as the Morse, easy to miss over road noise).
  // Peaks at about 0.75 at full volume. BELL_S long.
  var BELL_S = 7;
  function bell(octx, t0, volume) {
    var P = [[0.5, 0.35, 1.6], [1.0, 0.60, 1.2], [1.19, 0.40, 0.9], [1.5, 0.25, 0.7], [2.0, 0.45, 0.6], [2.74, 0.20, 0.35], [3.76, 0.12, 0.25], [5.4, 0.06, 0.15]];
    var level = Math.max(volume, 50) / 100 * 0.42;
    [0, 1.1, 2.2, 3.3].forEach(function (s) {
      P.forEach(function (p) {
        var osc = octx.createOscillator(); osc.frequency.value = 523.25 * p[0];
        var g = octx.createGain(), t = t0 + s;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level * p[1], t + 0.004);
        g.gain.setTargetAtTime(0, t + 0.004, p[2] / 3);
        osc.connect(g).connect(octx.destination);
        osc.start(t); osc.stop(t + p[2] * 2 + 0.1);
      });
    });
  }

  // How long `text` takes to send, and (with draw) render it starting at t0.
  // Farnsworth: elements and the gaps inside a letter at the character
  // speed, the gaps between letters (3) and words (7) at the spacing unit.
  function morse(text, tm, octx, t0, hz, peak) {
    t0 = t0 || 0;
    var t = t0, ta = tm.ta / 1000, ts = tm.ts / 1000;
    for (var k = 0; k < text.length; k++) {
      var ch = text[k];
      if (ch === ' ') continue;
      var code = HST.MORSE[ch] || '';
      for (var i = 0; i < code.length; i++) {
        var d = (code[i] === '-' ? 3 : 1) * ta;
        if (octx) tone(octx, t, d, hz, peak);
        t += d + (i < code.length - 1 ? ta : 0);
      }
      if (k < text.length - 1) t += (text[k + 1] === ' ' ? 7 : 3) * ts;
    }
    return t - t0;
  }
  // How long spelling `text` takes, and (with draw) render it starting at t0.
  function spell(text, voice, octx, t0, gain) {
    t0 = t0 || 0;
    var t = t0;
    for (var k = 0; k < text.length; k++) {
      var ch = text[k];
      if (ch === ' ') { t += WORD_GAP_S; continue; }
      var buf = voice[ch];
      if (!buf) continue;
      if (octx) {
        var src = octx.createBufferSource(); src.buffer = buf;
        var g = octx.createGain(); g.gain.value = gain;
        src.connect(g).connect(octx.destination);
        src.start(t);
      }
      t += buf.duration + SPELL_GAP_S;
    }
    return t - t0;
  }

  // An AudioBuffer as a 16-bit mono WAV file.
  function wav(buf) {
    var data = buf.getChannelData(0), n = data.length;
    var out = new DataView(new ArrayBuffer(44 + n * 2));
    function str(o, s) { for (var i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2, true);
    out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var s = Math.max(-1, Math.min(1, data[i])); out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
    return new Blob([out.buffer], { type: 'audio/wav' });
  }

  // A shared <audio> element (one per page) for everything this plays.
  var el = null, owner = null;
  function element() {
    if (el) return el;
    el = document.createElement('audio');
    el.setAttribute('playsinline', ''); el.preload = 'auto';
    el.style.display = 'none'; document.body.appendChild(el);
    ['ended', 'timeupdate', 'pause', 'play'].forEach(function (type) {
      el.addEventListener(type, function (e) { if (owner) owner(e); });
    });
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', function () { if (owner) el.play().catch(function () {}); });
        navigator.mediaSession.setActionHandler('pause', function () { el.pause(); });
        navigator.mediaSession.setActionHandler('stop', function () { if (owner) owner({ type: 'mediastop' }); });
      } catch (e) {}
    }
    return el;
  }

  function createPlayer(o) {
    var running = false, endAt = 0, pausedAt = 0, pausedMs = 0;
    var cur = null, next = null, rendering = null, gen = 0, heardBefore = 0, raf = 0;

    function pausedFor() { return pausedMs + (pausedAt ? Date.now() - pausedAt : 0); }
    function msLeft() { return endAt + pausedFor() - Date.now(); }

    // Plan and render up to CHUNK_S seconds of whole items into a WAV,
    // ending with the bell if the time is up by then. startAt = when
    // (wall clock) this stretch will start playing.
    function render(startAt) {
      return (o.voice ? loadVoice() : Promise.resolve(null)).then(function (voice) {
        var snd = o.sound(), tm = HST.timing(snd.wpm, snd.fwpm);
        var peak = (snd.volume / 100) * 0.35, vgain = Math.min(1, snd.volume / 100 * 0.9);
        var left = (endAt + pausedFor() - startAt) / 1000;   // practice time remaining
        var plan = [], t = 0.3, sets = 0;                    // plan: [t, item, play]
        while (t < CHUNK_S && t < left) {
          var item = o.next(); sets++;
          for (var p = 1; p <= item.plays; p++) {
            plan.push([t, item, p]);
            t += morse(item.text, tm) + item.gap;
            if (voice && p === item.plays) {
              item.sayAt = t;
              t += spell(item.text, voice) + VOICE_AFTER_S;
            }
          }
        }
        var last = t >= left, dur = t + (last ? BELL_S + 0.3 : 0);
        var octx = new OfflineAudioContext(1, Math.ceil(dur * RATE), RATE);
        plan.forEach(function (x) {
          morse(x[1].text, tm, octx, x[0], snd.toneHz, peak);
          if (voice && x[2] === x[1].plays) spell(x[1].text, voice, octx, x[1].sayAt, vgain);
        });
        if (last) bell(octx, t + 0.2, snd.volume);
        return octx.startRendering().then(function (buf) {
          return { url: URL.createObjectURL(wav(buf)), dur: dur, sets: sets, last: last,
                   events: plan.map(function (x) { return { t: x[0], text: x[1].text, play: x[2], plays: x[1].plays }; }) };
        });
      });
    }

    function heardInCur() {
      if (!cur || cur.counted || !el) return 0;
      return cur.events.filter(function (e) { return e.play === 1 && e.t <= el.currentTime; }).length;
    }
    function show() {
      if (!running || !cur) return;
      var now = el.currentTime, ev = null;
      for (var i = 0; i < cur.events.length; i++) { if (cur.events[i].t <= now + 0.05) ev = cur.events[i]; else break; }
      if (ev && o.onShow) o.onShow(ev);
      if (o.onTick) o.onTick(Math.max(0, msLeft()));
    }
    function frame() { show(); if (running) raf = requestAnimationFrame(frame); }

    function play(chunk) {
      cur = chunk;
      el.loop = false;
      el.src = chunk.url;
      var go = el.play();
      if (go && go.catch) go.catch(function () { if (o.onPause) o.onPause(true); });
      if (!chunk.last) {
        var g = gen;
        rendering = render(Date.now() + chunk.dur * 1000).then(function (n) {
          if (g === gen && running) next = n; else URL.revokeObjectURL(n.url);
        }).catch(function () {});
      }
    }
    function onEnded() {
      if (!running || !cur) return;
      var done = cur;
      heardBefore += done.counted ? 0 : done.sets;
      if (done.last) { cur = null; URL.revokeObjectURL(done.url); finish(); return; }
      var g = gen;
      Promise.resolve(next || rendering).then(function () {
        if (!running || g !== gen) return;
        var n = next; next = null;
        URL.revokeObjectURL(done.url); cur = null;
        if (n) { play(n); return; }
        // The next stretch isn't there (its render failed, or a speed change
        // dropped it). This used to end the run right here, with no bell.
        // Render again from now: more practice if there's time left,
        // otherwise just the bell.
        render(Date.now()).then(function (c) {
          if (!running || g !== gen || cur) { URL.revokeObjectURL(c.url); return; }
          play(c);
        }, function () { if (running && g === gen) finish(); });
      });
    }
    function onEvent(e) {
      if (e.type === 'ended') return onEnded();
      if (e.type === 'timeupdate') return show();
      if (e.type === 'mediastop') return finish();
      if (e.type === 'pause') {
        if (!running || el.ended || el.loop) return;      // ended, or the silent start
        if (!pausedAt) pausedAt = Date.now();
        if (o.onPause) o.onPause(true);
      }
      if (e.type === 'play') {
        if (pausedAt) { pausedMs += Date.now() - pausedAt; pausedAt = 0; }
        if (o.onPause) o.onPause(false);
      }
    }

    // The time ran out (or Stop on the lock screen): o.onEnd(items heard).
    function finish() { var n = heardBefore + heardInCur(); halt(); if (o.onEnd) o.onEnd(n); }
    function halt() {
      gen++;
      running = false;
      cancelAnimationFrame(raf);
      if (owner === onEvent) owner = null;
      if (el) { el.pause(); el.loop = false; el.removeAttribute('src'); el.load(); }
      [cur, next].forEach(function (c) { if (c) URL.revokeObjectURL(c.url); });
      cur = next = null; pausedAt = 0;
      if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = null; } catch (e) {} }
    }

    return {
      // Call from the Play tap: iPhones only let an <audio> element play if
      // a tap started it, and rendering takes a moment, so the element
      // starts right away on a looping bit of silence and the real audio
      // is swapped in when it's ready.
      start: function () {
        var a = element();
        if (!silentUrl) silentUrl = URL.createObjectURL(wav(HST.audio.unlock().createBuffer(1, RATE / 2, RATE)));
        owner = onEvent;
        a.loop = true; a.src = silentUrl; a.play().catch(function () {});
        running = true; gen++; heardBefore = 0; pausedAt = 0; pausedMs = 0; next = null; cur = null;
        endAt = Date.now() + o.minutes * 60000;
        if ('mediaSession' in navigator && window.MediaMetadata) {
          try {
            navigator.mediaSession.metadata = new MediaMetadata({ title: o.title(), artist: 'HamShackTech CW Trainer',
              artwork: [{ src: BASE.replace(/voice\/$/, 'icons/android-chrome-512x512.png'), sizes: '512x512', type: 'image/png' }] });
          } catch (e) {}
        }
        var g = gen;
        return render(Date.now()).then(function (first) {
          if (!running || g !== gen) { URL.revokeObjectURL(first.url); return; }
          play(first);
          cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
        }, function (err) { halt(); throw err; });
      },
      restart: function () {
        if (!running) return;
        var g = ++gen;
        heardBefore += heardInCur();
        if (cur) cur.counted = true;        // a second tap before the new audio is ready mustn't count it twice
        if (next) { URL.revokeObjectURL(next.url); next = null; }
        return render(Date.now()).then(function (chunk) {
          if (g !== gen || !running) { URL.revokeObjectURL(chunk.url); return; }
          var old = cur;
          play(chunk);
          if (old) URL.revokeObjectURL(old.url);
        });
      },
      stop: function () { var n = heardBefore + heardInCur(); if (running) halt(); return n; },
      heard: function () { return heardBefore + heardInCur(); },
      running: function () { return running; },
      msLeft: msLeft
    };
  }

  HST.listen = { createPlayer: createPlayer, loadVoice: loadVoice };
})();
