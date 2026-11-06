/*
 * Morse Evolved -- vertical slice: one contact (Xander).
 *
 * Flow:  START -> INTRO (Roger explains) -> SCAN -> RECEIVE (CW plays)
 *        -> COPY (notebook, check, hints, free decoder) -> SEND (player keys
 *        the reply) -> SIGN-OFF -> END card.
 *
 * Uses the CW Trainer's shared engine (hst-engine.js, hst-keyer.js) for the
 * Morse table, timing, audio, band noise, keyer and decoder.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------------------
     DIFFICULTY MODES (spec section 4; values are adjustable defaults)
     wpm = character speed, fwpm = effective (Farnsworth) copy speed,
     sendWpm = keyer speed for the player's sending.
     --------------------------------------------------------------------- */
  var MODES = {
    hiker: {
      label: 'Hiker', wpm: 15, fwpm: 5, sendWpm: 8, noise: 0, qsb: false,
      rx: 'XANDER K', tx: 'R TU', signoff: 'TU 73'
    },
    ranger: {
      label: 'Park Ranger', wpm: 20, fwpm: 12, sendWpm: 15, noise: 22, qsb: false,
      rx: 'CQ CQ DE XANDER K', tx: 'XANDER DE ROGER', signoff: 'TU ROGER 73 <SK>'
    },
    scientist: {
      label: 'SpaceY Scientist', wpm: 25, fwpm: 20, sendWpm: 22, noise: 40, qsb: true,
      rx: 'CQ CQ CQ DE XANDER XANDER QTH KORR MOON BASE K',
      tx: 'XANDER DE ROGER CRASHED NM PSE QSP TELLURA K',
      signoff: 'SRI ROGER NO TELLURA HR GL 73 <SK>'
    }
  };
  var KEY_FACT = 'XANDER';           // the copy must get the station's name right
  var BANDS = { '40m': [7.000, 7.060], '20m': [14.000, 14.070], '15m': [21.000, 21.070] };

  var mode = null, modeKey = 'hiker', band = '20m';
  var phase = 'start';               // start | intro | ready | scanning | rx | copy | tx | signoff | end
  var stats = { t0: 0, checks: 0, firstAcc: null, bestAcc: 0, decoded: false, sends: 0, sendAcc: null };
  var copyFails = 0, quipped = false;

  /* ---------------------------------------------------------------------
     ROGER'S TRANSLATOR (scripted lines, typed out; spec section 11)
     --------------------------------------------------------------------- */
  // Roger in the background: one scene picture per pose, faded in.
  var POSES = { neutral: 'neutral', excited: 'excited', celebrating: 'excited', frustrated: 'frustrated', amused: 'amused' };
  function pose(face) {
    var p = POSES[face] || 'neutral';
    document.querySelectorAll('.pose').forEach(function (im) { im.classList.toggle('on', im.dataset.pose === p); });
  }

  var speechQ = [], speaking = false;
  function say(text, face, then) {
    speechQ.push({ text: text, face: face, then: then });
    if (!speaking) nextLine();
  }
  function nextLine() {
    var item = speechQ.shift();
    if (!item) { speaking = false; return; }
    speaking = true;
    if (item.face) pose(item.face);
    var el = $('speech');
    el.innerHTML = '<span class="who">ROGER &gt; TRANSLATED</span><span class="txt"></span>';
    var out = el.querySelector('.txt'), i = 0;
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    (function type() {
      if (reduced) i = item.text.length; else i += 2;
      out.textContent = item.text.slice(0, i);
      if (i < item.text.length) { setTimeout(type, 28); return; }
      setTimeout(function () { if (item.then) item.then(); nextLine(); },
                 speechQ.length ? Math.min(2600, 700 + item.text.length * 25) : 0);
    })();
  }

  /* ---------------------------------------------------------------------
     SIGNAL DISPLAY: key-down intervals drawn as a scrolling trace that
     follows the actual keying (never shows decoded text).
     --------------------------------------------------------------------- */
  var marks = [];                    // { s, e } in performance.now() ms; e null while held
  var noisy = false;
  var canvas = $('wave'), g2 = canvas.getContext('2d');
  var WINDOW_MS = 4000;
  function draw() {
    var W = canvas.width, H = canvas.height, now = performance.now(), from = now - WINDOW_MS;
    g2.clearRect(0, 0, W, H);
    g2.strokeStyle = 'rgba(109,255,156,0.12)'; g2.lineWidth = 1;
    for (var x = 0; x < W; x += 40) { g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, H); g2.stroke(); }
    var base = H * 0.78, top = H * 0.22;
    g2.strokeStyle = '#6dff9c'; g2.lineWidth = 2.5; g2.shadowColor = '#6dff9c'; g2.shadowBlur = 8;
    g2.beginPath();
    var step = 3;
    for (var px = 0; px <= W; px += step) {
      var t = from + (px / W) * WINDOW_MS, on = false;
      for (var i = marks.length - 1; i >= 0; i--) {
        var m = marks[i];
        if (m.s <= t && (m.e == null ? t <= now : t < m.e)) { on = true; break; }
      }
      var jitter = noisy ? (Math.random() - 0.5) * H * 0.18 : 0;
      var y = (on ? top : base) + jitter;
      if (px === 0) g2.moveTo(px, y); else g2.lineTo(px, y);
    }
    g2.stroke(); g2.shadowBlur = 0;
    // forget old marks
    while (marks.length && marks[0].e != null && marks[0].e < from - 1000) marks.shift();
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  /* ---------------------------------------------------------------------
     RECEIVING: play text as CW and record the same schedule for the trace.
     Mirrors sendChars() in hst-engine.js (50 ms lead-in, PARIS timing).
     --------------------------------------------------------------------- */
  function tokens(text) { return text.match(/<[A-Z]+>|./g) || []; }
  function plain(text) { return text.replace(/<([A-Z]+)>/g, '$1'); }
  var playing = null;
  function playCW(text, fwpm) {
    HST.audio.stop();
    var sh = HST.shared.get(), chars = tokens(text);
    var p = HST.audio.playMorse(chars, { wpm: mode.wpm, fwpm: fwpm, toneHz: sh.toneHz, volume: sh.volume });
    var t = HST.timing(mode.wpm, fwpm), cursor = 50, t0 = performance.now();
    chars.forEach(function (ch, idx) {
      var last = idx === chars.length - 1;
      if (ch === ' ') { if (!last) cursor += 7 * t.ts; return; }
      var code = HST.MORSE[ch] || HST.PROSIGN_CODE[ch] || '';
      for (var i = 0; i < code.length; i++) {
        var d = code[i] === '-' ? 3 * t.ta : t.ta;
        marks.push({ s: t0 + cursor, e: t0 + cursor + d });
        cursor += d;
        if (i < code.length - 1) cursor += t.ta;
      }
      if (!last && chars[idx + 1] !== ' ') cursor += 3 * t.ts;
    });
    var token = {};
    playing = token;
    setStatus('RECEIVING');
    return p.done.then(function () {
      if (playing === token) { playing = null; setStatus('LISTENING'); }
    });
  }

  function setStatus(s) { $('radioStatus').textContent = s; }
  function bandNoise(level, qsb) {
    var sh = HST.shared.get();
    noisy = level > 0;
    if (level > 0) HST.audio.conditions({ noise: level, qsb: !!qsb, toneHz: sh.toneHz, volume: sh.volume });
    else HST.audio.conditions(null);
  }

  /* ---------------------------------------------------------------------
     COPY GRADING (spec section 7): align copy to the canonical text and
     count substitutions, deletions and insertions.
     accuracy = max(0, 1 - (S + D + I) / N)
     --------------------------------------------------------------------- */
  function norm(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function align(exp, got) {
    var n = exp.length, m = got.length, d = [], i, j;
    for (i = 0; i <= n; i++) { d[i] = [i]; }
    for (j = 1; j <= m; j++) d[0][j] = j;
    for (i = 1; i <= n; i++) for (j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (exp[i - 1] === got[j - 1] ? 0 : 1));
    }
    var ops = [], S = 0, D = 0, I = 0;
    i = n; j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (exp[i - 1] === got[j - 1] ? 0 : 1)) {
        var same = exp[i - 1] === got[j - 1];
        ops.unshift({ op: same ? 'ok' : 'sub', e: exp[i - 1], g: got[j - 1] });
        if (!same) S++;
        i--; j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
        ops.unshift({ op: 'del', e: exp[i - 1] }); D++; i--;
      } else {
        ops.unshift({ op: 'ins', g: got[j - 1] }); I++; j--;
      }
    }
    var acc = n ? Math.max(0, 1 - (S + D + I) / n) : 1;
    return { ops: ops, S: S, D: D, I: I, acc: acc };
  }
  function esc(c) { return c === ' ' ? '&nbsp;' : c.replace(/[&<>]/g, function (x) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]; }); }
  // Shows the player's own copy: right characters green, wrong ones red,
  // gaps where something is missing as an amber "_" (doesn't give the answer away).
  function diffHtml(ops) {
    return ops.map(function (o) {
      if (o.op === 'ok') return '<span class="ok">' + esc(o.g) + '</span>';
      if (o.op === 'sub' || o.op === 'ins') return '<span class="bad">' + esc(o.g) + '</span>';
      return '<span class="miss">_</span>';
    }).join('');
  }

  /* ---------------------------------------------------------------------
     SENDING: the trainer's keyer + decoder. Key type, adapter and paddle
     swap are the CW Trainer's Keyer Setup settings (set on the start
     screen); the sending speed is the game's own (start screen slider).

     ADAPTER KEYING (Tim's keyer read wrong, 2026-11-06): a Vail adapter
     with its own keyer switched on sends finished dits and dahs at ITS
     speed, and hst-keyer.js then just follows it (HST.adapterKeying).
     The decoder has to read those at the adapter's speed and learn the
     sender's timing, exactly as the Keyer tab does -- reading them at
     the game's speed (8 wpm for Hiker) turned every dah into a dit.
     --------------------------------------------------------------------- */
  var keyType = function () { return HST.keyerSettings.get().keyType; };
  // True when the adapter's own keyer is making the dits and dahs.
  function following() {
    var s = HST.keyerSettings.get();
    return HST.adapterKeying.get().on && s.adapter !== 'keyboard' && s.keyType !== 'straight';
  }
  // Timing comes from the sender (straight key, bug, or the adapter's keyer)
  // rather than from the app's own keyer.
  var adaptive = function () { return !HST.keyerAutomatic(); };
  var SEND_KEY = 'morse-evolved-send-wpm';
  var sendWpm = (function () { var v = 0; try { v = +localStorage.getItem(SEND_KEY); } catch (e) {} return v >= 5 && v <= 35 ? v : 15; })();
  function setSendWpm(v) {
    sendWpm = Math.max(5, Math.min(35, Math.round(v)));
    try { localStorage.setItem(SEND_KEY, String(sendWpm)); } catch (e) {}
  }
  function unitMs() { return following() ? HST.adapterKeying.get().unitMs : 1200 / sendWpm; }

  var live = '', txMarks = [], downAt = null, lastUp = 0, detachKeys = null, autoTimer = null;
  var keyer = HST.createKeyer({ key: onKey, wpm: function () { return sendWpm; }, adapterKeying: function () { decoder.reset(); testDecoder.reset(); renderTestNote(); } });
  var decoder = HST.createDecoder({
    unitMs: unitMs,
    adaptive: adaptive,
    onChar: function (ch) { live += ch; showLive(); scheduleAutoCheck(); },
    onWord: function () { if (live && live.slice(-1) !== ' ') { live += ' '; showLive(); } }
  });
  // The start screen's key test uses its own decoder (same settings).
  var testLive = '', testCode = '';
  var testDecoder = HST.createDecoder({
    unitMs: unitMs,
    adaptive: adaptive,
    onChar: function (ch) { testLive += ch; testCode = ''; renderTest(); },
    onWord: function () { if (testLive && testLive.slice(-1) !== ' ') { testLive += ' '; renderTest(); } }
  });
  function onKey(down, t) {
    if (phase === 'start') { onTestKey(down, t); return; }
    if (phase !== 'tx') return;
    if (down) {
      clearTimeout(autoTimer);
      downAt = t; decoder.down(t);
      marks.push({ s: t, e: null });
    } else if (downAt != null) {
      txMarks.push({ s: downAt, e: t }); downAt = null; lastUp = t;
      decoder.up(t);
      for (var i = marks.length - 1; i >= 0; i--) if (marks[i].e == null) { marks[i].e = t; break; }
    }
  }
  function showLive() { $('txLive').textContent = live || ' '; }
  function scheduleAutoCheck() {
    // Check by itself once they've sent as many characters as the target.
    var want = plain(mode.tx).replace(/\s/g, '').length;
    if (live.replace(/\s/g, '').length >= want) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(checkSend, unitMs() * 8);
    }
  }
  // On-screen key(s). keyer.touch() applies the paddle swap itself, so the
  // labels follow the swap too.
  function buildKeys(box) {
    var s = HST.keyerSettings.get(), k = s.keyType;
    box.innerHTML = '';
    var pads = (k === 'straight') ? [['KEY', 'dit']] : [[s.reversed ? 'DAH' : 'DIT', 'dit'], [s.reversed ? 'DIT' : 'DAH', 'dah']];
    pads.forEach(function (p) {
      var el = document.createElement('button');
      el.className = 'key'; el.textContent = p[0]; el.type = 'button';
      function dn(e) { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('down'); keyer.touch(p[1], true); }
      function up() { if (!el.classList.contains('down')) return; el.classList.remove('down'); keyer.touch(p[1], false); }
      el.addEventListener('pointerdown', dn);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      box.appendChild(el);
    });
  }
  var KEY_NAMES = { straight: 'straight key', bug: 'bug', iambicA: 'iambic paddles (Mode A)', iambicB: 'iambic paddles (Mode B)' };
  function keyHelp() {
    var k = keyType();
    var speed = k === 'straight' ? 'your own speed'
      : following() ? 'your adapter’s speed (about ' + Math.round(1200 / HST.adapterKeying.get().unitMs) + ' wpm)'
      : sendWpm + ' wpm';
    return 'Keying as ' + (KEY_NAMES[k] || k) + ' at ' + speed + '. Keyboard: Left Ctrl or [ ' +
      (k === 'straight' ? '= key.' : '= dit, Right Ctrl or ] = dah.');
  }

  /* ---------------------------------------------------------------------
     START SCREEN KEYER SETUP + TEST PAD (Tim, 2026-11-06)
     The choices write straight to HST.keyerSettings, so they're the same
     settings the CW Trainer's Keyer Setup uses.
     --------------------------------------------------------------------- */
  function seg(id, value) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) {
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', b.dataset.v === value ? 'true' : 'false');
    });
  }
  function renderSetup() {
    var s = HST.keyerSettings.get();
    seg('keyTypeSeg', s.keyType);
    seg('adapterSeg', s.adapter);
    $('swapIn').checked = !!s.reversed;
    $('swapIn').disabled = s.keyType === 'straight';
    $('sendWpmIn').value = sendWpm;
    $('sendWpmVal').textContent = sendWpm + ' wpm';
    $('sendWpmIn').disabled = following();
    $('testHow').textContent = s.keyType === 'straight' ? 'Left Ctrl or [ is the key'
      : 'Left Ctrl or [ = ' + (s.reversed ? 'dah' : 'dit') + ', Right Ctrl or ] = ' + (s.reversed ? 'dit' : 'dah');
    buildKeys($('testKeys'));
    renderTestNote();
  }
  function renderTestNote() {
    var s = HST.keyerSettings.get(), n = '';
    if (following()) n = 'Your adapter is doing the keying itself, at about <b>' + Math.round(1200 / HST.adapterKeying.get().unitMs) +
      ' wpm</b>, so the speed slider doesn’t apply. Change its speed in Vail Zoomer.';
    else if (s.keyType === 'straight') n = 'Straight key: send at your own pace; the game learns your speed. The slider is just its first guess.';
    else if (s.keyType === 'bug') n = 'Bug: the dit side makes dits at the slider’s speed; dahs are yours.';
    $('testNote').innerHTML = n;
  }
  function renderTest() {
    $('testLive').textContent = testLive.slice(-40);
    $('testElems').textContent = testCode ? testCode.replace(/\./g, '·').replace(/-/g, '–') : ' ';
  }
  var testDownAt = null;
  function onTestKey(down, t) {
    if (down) { testDownAt = t; testDecoder.down(t); return; }
    if (testDownAt == null) return;
    var d = t - testDownAt; testDownAt = null;
    testDecoder.up(t);
    // Show the element just sent (the decoder's own split, roughly).
    if (d >= 8) { testCode += adaptive() ? guessEl(d) : (d > 2 * unitMs() ? '-' : '.'); renderTest(); }
  }
  var elDit = null;
  function guessEl(d) {        // for the display only; the decoder makes the real call
    if (elDit == null) elDit = unitMs();
    var dah = d > 2 * elDit;
    if (!dah) elDit = 0.75 * elDit + 0.25 * d;
    return dah ? '-' : '.';
  }
  function clearTest() { testLive = ''; testCode = ''; elDit = null; testDecoder.reset(); renderTest(); }
  document.querySelectorAll('#keyTypeSeg button').forEach(function (b) {
    b.addEventListener('click', function () { HST.keyerSettings.set({ keyType: b.dataset.v }); });
  });
  document.querySelectorAll('#adapterSeg button').forEach(function (b) {
    b.addEventListener('click', function () { HST.keyerSettings.set({ adapter: b.dataset.v }); });
  });
  $('swapIn').addEventListener('change', function () { HST.keyerSettings.set({ reversed: this.checked }); });
  $('sendWpmIn').addEventListener('input', function () { setSendWpm(+this.value); keyer.reset(); renderSetup(); });
  $('testClear').addEventListener('click', clearTest);
  function refreshTx() { if (phase === 'tx') { buildKeys($('keys')); $('txHelp').textContent = keyHelp(); } }
  HST.keyerSettings.onChange(function () { keyer.reset(); decoder.reset(); clearTest(); renderSetup(); refreshTx(); });
  HST.adapterKeying.onChange(function () { decoder.reset(); testDecoder.reset(); renderSetup(); refreshTx(); });

  /* ---------------------------------------------------------------------
     MISSION FLOW
     --------------------------------------------------------------------- */
  function startMission() {
    HST.audio.unlock();
    mode = MODES[modeKey];
    $('modeLabel').textContent = mode.label + ' · ' + mode.wpm + '/' + mode.fwpm + ' wpm';
    $('startCard').hidden = true;
    if (detachKeys) { detachKeys(); detachKeys = null; }   // the key test is over
    keyer.reset();
    stats.t0 = Date.now();
    phase = 'intro';
    lockRadio(true);
    say('Translator… online.', 'neutral');
    say('Human! Over here. My ship came down hard and my fingers are wrecked. I can’t work the key.', 'frustrated');
    say('This radio can reach my home world, Tellura. Pick a band and hit SCAN.', 'neutral', function () {
      phase = 'ready'; lockRadio(false);
      $('replayBtn').disabled = $('slowBtn').disabled = $('decodeBtn').disabled = true;
      $('scanBtn').focus();
    });
  }
  function lockRadio(on) {
    ['scanBtn', 'replayBtn', 'slowBtn', 'decodeBtn'].forEach(function (id) { $(id).disabled = on; });
  }

  function scan() {
    if (phase !== 'ready') return;
    phase = 'scanning';
    lockRadio(true);
    setStatus('SCANNING');
    $('bandLabel').textContent = band.toUpperCase();
    bandNoise(60, false);
    var r = BANDS[band], stopAt = performance.now() + 2600;
    var target = r[0] + 0.012 + Math.random() * (r[1] - r[0] - 0.02);
    (function sweep() {
      var left = stopAt - performance.now();
      if (left > 0) {
        var f = left > 500 ? r[0] + Math.random() * (r[1] - r[0]) : target + (Math.random() - 0.5) * 0.0004;
        $('freqNum').textContent = f.toFixed(4);
        setTimeout(sweep, 70);
        return;
      }
      $('freqNum').textContent = target.toFixed(4);
      acquire();
    })();
  }

  function acquire() {
    bandNoise(mode.noise, mode.qsb);
    setStatus('SIGNAL');
    var img = $('contactImg');
    img.src = 'art/contact-xander.webp'; img.hidden = false;
    $('noSignal').hidden = true;
    img.classList.remove('flicker'); void img.offsetWidth; img.classList.add('flicker');
    say('Signal! Copy it into the notebook. Type what you hear.', 'excited');
    phase = 'rx';
    setTimeout(function () {
      playCW(mode.rx, mode.fwpm).then(function () {
        if (phase === 'rx') enterCopy();
      });
    }, 900);
  }

  function enterCopy() {
    phase = 'copy';
    var ta = $('copyIn');
    ta.disabled = false; ta.focus();
    $('submitBtn').disabled = false;
    $('replayBtn').disabled = $('slowBtn').disabled = $('decodeBtn').disabled = false;
    renderWriting();
  }

  /* ---------------------------------------------------------------------
     THE NOTEBOOK (Tim, 2026-11-06: "obviously a text box over a picture")
     You type into a transparent text box; the page shows the same text
     hand-written in pencil -- each letter a little off its line and
     tilted, the same way every time it's drawn -- with a pencil-mark
     caret where you're writing. Same font and size as the text box, so
     the lines wrap in the same places.
     --------------------------------------------------------------------- */
  function jitter(i, ch) {      // small, repeatable wobble per letter
    var h = Math.sin((i + 1) * 12.9898 + ch.charCodeAt(0) * 78.233) * 43758.5453;
    h -= Math.floor(h);
    var h2 = Math.sin((i + 7) * 39.3468 + ch.charCodeAt(0) * 11.135) * 24634.6345;
    h2 -= Math.floor(h2);
    return { r: (h - 0.5) * 7, y: (h2 - 0.5) * 0.12 };
  }
  function renderWriting() {
    var ta = $('copyIn'), v = ta.value.toUpperCase(), out = [], word = [];
    var caretAt = document.activeElement === ta && !ta.disabled ? ta.selectionEnd : -1;
    function flush() { if (word.length) { out.push('<span class="w">' + word.join('') + '</span>'); word = []; } }
    for (var i = 0; i <= v.length; i++) {
      if (i === caretAt) word.push('<span class="caret"></span>');
      if (i === v.length) break;
      var ch = v[i];
      if (ch === ' ' || ch === '\n') { flush(); out.push(ch === ' ' ? ' ' : '\n'); continue; }
      var j = jitter(i, ch);
      word.push('<span class="c" style="transform:translateY(' + j.y.toFixed(3) + 'em) rotate(' + j.r.toFixed(1) + 'deg)">' + esc(ch) + '</span>');
    }
    flush();
    $('writing').innerHTML = out.join('');
    $('hintLine').hidden = !!v || phase !== 'copy';
    $('paper').classList.toggle('focus', caretAt >= 0);
  }
  ['input', 'keyup', 'click', 'select', 'focus', 'blur'].forEach(function (ev) { $('copyIn').addEventListener(ev, renderWriting); });
  document.addEventListener('selectionchange', function () { if (document.activeElement === $('copyIn')) renderWriting(); });
  $('paper').addEventListener('pointerdown', function (e) { if (e.target === $('paper') && !$('copyIn').disabled) { e.preventDefault(); $('copyIn').focus(); } });

  function replay(slow) {
    if (phase !== 'copy' && phase !== 'rx') return;
    // Slower keeps each letter at full speed and adds space between them (Farnsworth).
    var f = slow ? Math.max(3, Math.round(mode.fwpm * 0.6)) : mode.fwpm;
    playCW(mode.rx, f);
    $('copyIn').focus();
  }

  function decodeReveal() {
    if (phase !== 'copy') return;
    stats.decoded = true;
    $('grade').innerHTML = '<div class="printout">DECODER: ' + esc(plain(mode.rx)).replace(/ /g, '&nbsp;') + '</div>';
    $('copyMsg').textContent = 'The decoder is free — no penalty.';
    $('contactName').textContent = 'XANDER';
    say('Hey, no shame. That’s what the button’s for.', 'amused');
    $('nextBtn').hidden = false;
  }

  function checkCopy() {
    if (phase !== 'copy') return;
    var exp = norm(plain(mode.rx)), got = norm($('copyIn').value);
    if (!got) { $('copyIn').focus(); return; }
    var r = align(exp, got);
    stats.checks++;
    if (stats.firstAcc == null) stats.firstAcc = r.acc;
    stats.bestAcc = Math.max(stats.bestAcc, r.acc);
    var pct = Math.round(r.acc * 100);
    var gotFact = got.indexOf(KEY_FACT) >= 0;
    // Marked on the page in red pencil: the score circled, your copy with
    // wrong letters struck through and a _ where something is missing.
    var html = '<div class="score">' + pct + '%</div>';
    if (r.acc < 1) html += '<div class="gdiff">' + diffHtml(r.ops) + '</div>';
    html += '<div class="note">' + (r.acc === 1 ? 'Perfect copy!' : gotFact ? 'Got his name.' : 'Listen again.') + '</div>';
    $('grade').innerHTML = html;
    $('copyMsg').innerHTML = r.acc === 1 ? 'Perfect copy.'
      : gotFact ? 'Good enough — you got the station’s name. Fix it up or continue.'
      : '<span class="warn">Struck-through letters are wrong, _ is missing. Try REPLAY or SLOWER.</span>';
    if (gotFact || r.acc === 1) {
      $('contactName').textContent = 'XANDER';
      $('nextBtn').hidden = false;
      $('nextBtn').focus();
      say('Xander. Not Tellura, but he sounds friendly.', 'amused');
    } else {
      copyFails++;
      if (copyFails >= 2 && !quipped) {
        quipped = true;
        say('You know, we do have the technology to perfectly decode CW. Just saying.', 'frustrated');
      }
    }
  }

  function enterSend() {
    if (phase !== 'copy') return;
    phase = 'tx';
    HST.audio.stop();
    $('copyIn').disabled = true;
    renderWriting();
    $('submitBtn').disabled = true;
    $('nextBtn').hidden = true;
    $('copyMsg').textContent = '';
    lockRadio(true);
    $('txPanel').hidden = false;
    $('txTarget').textContent = plain(mode.tx);
    $('txResult').innerHTML = '';
    buildKeys($('keys'));
    $('txHelp').textContent = keyHelp();
    clearSend();
    detachKeys = keyer.attachKeyboard(window);   // only while sending, so [ ] stay typeable in the notebook
    setStatus('TRANSMIT');
    say('Answer him. Send: ' + plain(mode.tx), 'neutral');
  }

  function clearSend() {
    clearTimeout(autoTimer);
    live = ''; txMarks = []; downAt = null;
    decoder.reset();
    showLive();
  }

  function checkSend() {
    if (phase !== 'tx') return;
    clearTimeout(autoTimer);
    var u = unitMs();
    var wait = Math.max(0, lastUp + 7 * u - performance.now());
    if (wait > 0 && txMarks.length) { setTimeout(checkSend, wait + 20); return; }
    var want = norm(plain(mode.tx)), sent = norm(live);
    if (!sent) { $('txResult').innerHTML = '<span class="warn">Nothing heard yet — key the message.</span>'; return; }
    stats.sends++;
    // Content: compare without spaces (word spacing is reported, not failed).
    var r = align(want.replace(/ /g, ''), sent.replace(/ /g, ''));
    stats.sendAcc = r.acc;
    var html = '<div class="score">SENDING ACCURACY <b>' + Math.round(r.acc * 100) + '%</b></div>' + timingReport();
    if (r.acc === 1) {
      $('txResult').innerHTML = html;
      finishSend();
    } else {
      html += '<div class="diff">' + diffHtml(align(want, sent).ops) + '</div>' +
        '<div class="warn">Not quite. CLEAR and send it again — he’s still listening.</div>';
      $('txResult').innerHTML = html;
      say('Close. Try that again.', 'frustrated');
    }
  }

  // Timing feedback from the actual key-down lengths (spec section 8).
  function timingReport() {
    if (txMarks.length < 2) return '';
    var unit = 1200 / decoder.speedWpm(), dits = [], dahs = [];
    txMarks.forEach(function (m) { var d = m.e - m.s; (d < 2 * unit ? dits : dahs).push(d); });
    var avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    var parts = ['Speed about <b>' + Math.round(decoder.speedWpm()) + ' wpm</b>'];
    if (dits.length && dahs.length && adaptive()) {
      var ratio = avg(dahs) / avg(dits);
      parts.push('dah:dit ratio <b>' + ratio.toFixed(1) + '</b> (aim for 3.0)');
    }
    return '<div class="muted">' + parts.join(' · ') + '</div>';
  }

  function finishSend() {
    phase = 'signoff';
    if (detachKeys) { detachKeys(); detachKeys = null; }
    keyer.reset();
    say('Clean sending. Well, your sending. My hands are in bandages.', 'celebrating');
    setTimeout(function () {
      setStatus('RECEIVING');
      playCW(mode.signoff, mode.fwpm).then(function () {
        say('Nice kid. Not Tellura though. We’ll keep scanning.', 'neutral', showEnd);
      });
    }, 1600);
  }

  function showEnd() {
    phase = 'end';
    bandNoise(0);
    var mins = Math.max(1, Math.round((Date.now() - stats.t0) / 60000));
    $('endStats').innerHTML =
      'Mode: ' + mode.label + '<br>' +
      'Copy accuracy: ' + Math.round((stats.firstAcc || 0) * 100) + '% first try, ' + Math.round(stats.bestAcc * 100) + '% best' +
      (stats.decoded ? ' (decoder used)' : '') + '<br>' +
      'Sending: ' + (stats.sendAcc != null ? Math.round(stats.sendAcc * 100) + '%' : '–') +
      ' in ' + stats.sends + (stats.sends === 1 ? ' try' : ' tries') + '<br>' +
      'Time: about ' + mins + ' min';
    setTimeout(function () { $('endCard').hidden = false; $('againBtn').focus(); }, 800);
  }

  /* ---------------------------------------------------------------------
     WIRING
     --------------------------------------------------------------------- */
  function pickMode(k) {
    modeKey = k;
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.mode === k ? 'true' : 'false');
    });
    try { localStorage.setItem('morse-evolved-mode', k); } catch (e) {}
  }
  function pickBand(b) {
    band = b;
    document.querySelectorAll('.band-btn').forEach(function (x) {
      x.setAttribute('aria-checked', x.dataset.band === b ? 'true' : 'false');
    });
    $('bandLabel').textContent = b.toUpperCase();
  }
  document.querySelectorAll('.mode-btn').forEach(function (b) {
    b.setAttribute('role', 'radio');
    // Picking a player also sets the suggested sending speed (the slider can change it).
    b.addEventListener('click', function () { pickMode(b.dataset.mode); setSendWpm(MODES[b.dataset.mode].sendWpm); renderSetup(); });
  });
  document.querySelectorAll('.band-btn').forEach(function (b) {
    b.setAttribute('role', 'radio');
    b.addEventListener('click', function () { if (phase === 'ready' || phase === 'start' || phase === 'intro') pickBand(b.dataset.band); });
  });
  var saved = null;
  try { saved = localStorage.getItem('morse-evolved-mode'); } catch (e) {}
  pickMode(MODES[saved] ? saved : 'hiker');
  pickBand('20m');

  var sh = HST.shared.get();
  $('toneIn').value = sh.toneHz; $('volIn').value = sh.volume;
  $('toneIn').addEventListener('input', function () { HST.shared.set({ toneHz: +this.value }); if (noisy) bandNoise(mode.noise, mode.qsb); });
  $('volIn').addEventListener('input', function () { HST.shared.set({ volume: +this.value }); if (noisy) bandNoise(mode.noise, mode.qsb); });

  $('startBtn').addEventListener('click', startMission);
  $('scanBtn').addEventListener('click', scan);
  $('replayBtn').addEventListener('click', function () { replay(false); });
  $('slowBtn').addEventListener('click', function () { replay(true); });
  $('decodeBtn').addEventListener('click', decodeReveal);
  $('submitBtn').addEventListener('click', checkCopy);
  $('nextBtn').addEventListener('click', enterSend);
  $('txDone').addEventListener('click', checkSend);
  $('txClear').addEventListener('click', function () { clearSend(); $('txResult').innerHTML = ''; });
  $('againBtn').addEventListener('click', function () { location.reload(); });
  // Quit (Tim, 2026-11-06): confirm, then back to the start screen.
  $('quitBtn').addEventListener('click', function () {
    if (phase === 'start') return;
    if (phase === 'end') { location.reload(); return; }
    $('quitCard').hidden = false; $('quitNo').focus();
  });
  $('quitNo').addEventListener('click', function () { $('quitCard').hidden = true; });
  $('quitYes').addEventListener('click', function () {
    keyer.reset(); HST.audio.stop(); HST.audio.conditions(null);
    location.reload();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('quitCard').hidden) $('quitCard').hidden = true;
  });
  $('copyIn').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); checkCopy(); }
  });
  // Stop keying safely if the page is hidden mid-transmission (spec section 6).
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { keyer.reset(); HST.audio.stop(); }
  });
  lockRadio(true);
  $('quitBtn').disabled = true;   // nothing to quit until a mission starts
  $('startBtn').addEventListener('click', function () { $('quitBtn').disabled = false; });
  renderSetup();
  renderTest();
  detachKeys = keyer.attachKeyboard(window);   // the start screen's key test

  /* ---------------------------------------------------------------------
     SPARKS: a few embers dripping from the cut cables in the scene
     (the emitters sit on the sparking cables painted in the art).
     --------------------------------------------------------------------- */
  var sc = $('sparks'), sg = sc.getContext('2d'), embers = [];
  var EMITTERS = [[300, 20], [318, 10], [1075, 40], [1092, 28], [655, 60]];
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function sparkFrame() {
    sg.clearRect(0, 0, sc.width, sc.height);
    if (Math.random() < 0.18) {
      var e = EMITTERS[Math.floor(Math.random() * EMITTERS.length)];
      embers.push({ x: e[0] + (Math.random() - 0.5) * 8, y: e[1], vx: (Math.random() - 0.5) * 0.6, vy: Math.random() * 0.8, life: 1 });
    }
    sg.globalCompositeOperation = 'lighter';
    embers = embers.filter(function (p) {
      p.vy += 0.07; p.x += p.vx; p.y += p.vy; p.life -= 0.012;
      if (p.life <= 0 || p.y > 360) return false;
      sg.fillStyle = 'rgba(255,' + Math.round(150 + 90 * p.life) + ',80,' + p.life.toFixed(2) + ')';
      sg.beginPath(); sg.arc(p.x, p.y, 1.4 + p.life, 0, 6.283); sg.fill();
      return true;
    });
    sg.globalCompositeOperation = 'source-over';
    requestAnimationFrame(sparkFrame);
  }
  if (!calm) requestAnimationFrame(sparkFrame);
})();
