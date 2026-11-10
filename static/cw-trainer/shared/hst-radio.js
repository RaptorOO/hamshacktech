/*
 * HamShackTech CW Trainer -- radio sidetone input  (Tim, 2026-11-09)
 * ==================================================================
 * Some students key their radio instead of a Vail or VBand adapter and
 * send the radio's sidetone (the beep it makes) into the computer through
 * an audio interface such as a Focusrite Scarlett. This file listens to
 * that audio input and turns the tone starting and stopping into key down
 * and key up, like a straight key. The listening itself happens on the
 * audio thread, in hst-radio-worklet.js (how it finds the pitch and the
 * edges is explained there).
 *
 * For now only Keyer Setup's "Test your key" area uses it. The choice is
 * kept apart from HST.keyerSettings, so the practice tools carry on with
 * the adapter chosen before; connecting them is a later step.
 *
 *   HST.radioInput.supported()          can this browser do it?
 *   HST.radioInput.prefs.get() / set()  { on, deviceId, pitch } on this device
 *   HST.radioInput.start({ deviceId, key(down, t), level(info), pitch(hz), ended() })
 *        -> Promise of { ok, msg, deviceId }
 *   HST.radioInput.devices()            -> Promise of [{ deviceId, label }]
 *   HST.radioInput.delay()              -> { inputMs, detectMs, n } or null
 *   HST.radioInput.stop()
 *
 * Key times are on the performance.now() clock, like the keyboard's.
 * Nothing is recorded or sent anywhere; the input is open only while
 * Keyer Setup is.
 */
(function () {
  'use strict';
  var HST = window.HST;
  var WORKLET_URL = new URL('hst-radio-worklet.js', document.currentScript.src).href;
  var PREFS_KEY = 'hct-cw-radio-v1';

  function loadPrefs() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) {}
    return { on: !!p.on, deviceId: typeof p.deviceId === 'string' ? p.deviceId : '',
             pitch: Number(p.pitch) >= 300 && Number(p.pitch) <= 1500 ? Number(p.pitch) : 0 };
  }
  var prefs = {
    get: loadPrefs,
    set: function (patch) {
      var p = loadPrefs();
      Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
    }
  };

  var cur = null;   // { ctx, stream, node, h, offset, last, delays }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
              window.AudioContext && window.AudioWorkletNode);
  }

  // Plain-English messages for what the browser says when it can't open the input.
  function why(err) {
    var n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError')
      return 'Microphone access is blocked, so CW Trainer can’t hear your radio. To allow it, click the icon at the left of the address bar (Site settings), set Microphone to Allow, then choose “Radio sidetone” again. CW Trainer only listens while Keyer Setup is open, and nothing is recorded or sent anywhere.';
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError')
      return 'No audio input found. Plug in your audio interface (and switch it on), then choose “Radio sidetone” again.';
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError')
      return 'The audio input is busy or not working. Another program may be using it: close that program, or unplug the interface and plug it back in.';
    return 'The audio input couldn’t be opened' + (err && err.message ? ' (' + err.message + ')' : '') + '.';
  }

  function stop() {
    if (!cur) return;
    var c = cur; cur = null;
    try { c.node.port.onmessage = null; c.node.disconnect(); } catch (e) {}
    try { c.stream.getTracks().forEach(function (t) { t.onended = null; t.stop(); }); } catch (e) {}
    try { c.ctx.close(); } catch (e) {}
  }

  function start(h) {
    stop();
    if (!supported()) return Promise.resolve({ ok: false, msg: 'This browser can’t listen to an audio input. Use Chrome, Edge, Firefox or Safari, and open CW Trainer from hamshacktech.com.' });
    // Made now, while the click that chose this still counts, so the browser lets it play.
    var ctx;
    try { ctx = new AudioContext({ latencyHint: 'interactive' }); }
    catch (e) { return Promise.resolve({ ok: false, msg: why(e) }); }
    var me = { ctx: ctx, h: h || {}, offset: null, lastMsg: 0, delays: [] };
    cur = me;
    var raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    function ask(id) {
      var a = {};
      Object.keys(raw).forEach(function (k) { a[k] = raw[k]; });
      if (id) a.deviceId = { exact: id };
      return navigator.mediaDevices.getUserMedia({ audio: a });
    }
    // The interface chosen last time may be unplugged: then use the default input.
    return ask(me.h.deviceId).catch(function (err) {
      if (me.h.deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) return ask('');
      throw err;
    }).then(function (stream) {
      if (cur !== me) { stream.getTracks().forEach(function (t) { t.stop(); }); throw { name: 'stale' }; }
      me.stream = stream;
      var track = stream.getAudioTracks()[0];
      me.deviceId = (track.getSettings && track.getSettings().deviceId) || '';
      me.label = track.label || '';
      track.onended = function () { if (cur === me && me.h.ended) me.h.ended(); stop(); };
      return ctx.audioWorklet.addModule(WORKLET_URL);
    }).then(function () {
      if (cur !== me) throw { name: 'stale' };
      var src = ctx.createMediaStreamSource(me.stream);
      var node = new AudioWorkletNode(ctx, 'hst-radio-listener', { numberOfOutputs: 1, outputChannelCount: [1] });
      var mute = ctx.createGain();
      mute.gain.value = 0;               // the radio is heard from the radio; nothing is played here
      src.connect(node); node.connect(mute).connect(ctx.destination);
      me.node = node;
      node.port.onmessage = function (e) { if (cur === me) onMessage(me, e.data); };
      var p = prefs.get().pitch;
      if (p) node.port.postMessage({ t: 'pitch', hz: p });
      try { ctx.resume(); } catch (e) {}
      return { ok: true, deviceId: me.deviceId, label: me.label };
    }).catch(function (err) {
      if (err && err.name === 'stale') return { ok: false, stale: true };
      if (cur === me) stop();
      return { ok: false, msg: why(err) };
    });
  }

  // Audio clock -> performance.now() clock. The smallest gap seen between a
  // message's sample time and its arrival is the true offset; later
  // arrivals were only held up on the way. It creeps up a little so slow
  // drift between the two clocks can't strand it.
  function toPerf(me, m, frame, now) {
    var ct = (m.t0 + frame / m.sr) * 1000;
    var seen = now - (m.t0 + m.frameNow / m.sr) * 1000;
    if (me.offset === null || seen < me.offset) me.offset = seen;
    else me.offset += Math.min(0.5, (now - me.lastMsg) * 0.0001);
    me.lastMsg = now;
    return ct + me.offset;
  }

  function onMessage(me, m) {
    var now = performance.now();
    if (m.t === 'level') {
      m.frameNow = m.frame; toPerf(me, m, m.frame, now);
      if (me.h.level) me.h.level(m);
      return;
    }
    if (m.t === 'pitch') {
      prefs.set({ pitch: m.hz });
      if (me.h.pitch) me.h.pitch(m.hz);
      return;
    }
    if (m.t === 'key') {
      m.frameNow = m.detect;
      var t = toPerf(me, m, m.frame, now);
      // How long after the tone started the app knew about it (the start
      // is what you feel; the end of a radio's tone fades over a few ms).
      if (m.down) me.delays.push(Math.max(0, now - t));
      if (me.delays.length > 40) me.delays.shift();
      if (me.h.key) me.h.key(m.down, t);
    }
  }

  // The delay from the radio's tone to the app: the audio input's own
  // buffering (when the browser reports it) plus the time to recognise
  // the tone starting (measured on every key-down; the median of the last
  // 40). That measurement already includes the wait for the audio block.
  function delay() {
    if (!cur || !cur.stream) return null;
    var track = cur.stream.getAudioTracks()[0], s = track && track.getSettings ? track.getSettings() : {};
    var inputMs = s.latency > 0 ? s.latency * 1000 : null;
    if (!cur.delays.length) return { inputMs: inputMs, detectMs: null, n: 0 };
    var d = cur.delays.slice().sort(function (a, b) { return a - b; });
    return { inputMs: inputMs, detectMs: d[Math.floor(d.length / 2)], n: d.length };
  }

  function devices() {
    if (!supported() || !navigator.mediaDevices.enumerateDevices) return Promise.resolve([]);
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      return list.filter(function (d) { return d.kind === 'audioinput' && d.deviceId !== 'communications'; })
                 .map(function (d, i) { return { deviceId: d.deviceId, label: d.label || ('Audio input ' + (i + 1)) }; });
    }).catch(function () { return []; });
  }

  function resetPitch() {
    prefs.set({ pitch: 0 });
    if (cur && cur.node) cur.node.port.postMessage({ t: 'reset' });
  }

  HST.radioInput = { supported: supported, prefs: prefs, start: start, stop: stop, devices: devices,
                     delay: delay, resetPitch: resetPitch, active: function () { return !!(cur && cur.node); } };
})();
