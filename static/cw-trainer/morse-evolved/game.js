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
  var speechQ = [], speaking = false;
  function say(text, face, then) {
    speechQ.push({ text: text, face: face, then: then });
    if (!speaking) nextLine();
  }
  function nextLine() {
    var item = speechQ.shift();
    if (!item) { speaking = false; return; }
    speaking = true;
    if (item.face) $('rogerImg').src = 'art/roger-' + item.face + '.webp';
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
     SENDING: the trainer's keyer + decoder. Keyer type and adapter come
     from the CW Trainer's Keyer Setup; speed from the difficulty mode.
     --------------------------------------------------------------------- */
  var keyType = function () { return HST.keyerSettings.get().keyType; };
  var adaptive = function () { var k = keyType(); return k === 'straight' || k === 'bug'; };
  var live = '', txMarks = [], downAt = null, lastUp = 0, detachKeys = null, autoTimer = null;
  var keyer = HST.createKeyer({ key: onKey, wpm: function () { return mode ? mode.sendWpm : 15; } });
  var decoder = HST.createDecoder({
    unitMs: function () { return 1200 / (mode ? mode.sendWpm : 15); },
    adaptive: adaptive,
    onChar: function (ch) { live += ch; showLive(); scheduleAutoCheck(); },
    onWord: function () { if (live && live.slice(-1) !== ' ') { live += ' '; showLive(); } }
  });
  function onKey(down, t) {
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
      autoTimer = setTimeout(checkSend, 1200 / mode.sendWpm * 8);
    }
  }
  function buildKeys() {
    var k = keyType(), box = $('keys');
    box.innerHTML = '';
    var pads = (k === 'straight') ? [['KEY', 'dit']] : [['DIT', 'dit'], ['DAH', 'dah']];
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
    var names = { straight: 'straight key', bug: 'bug', iambicA: 'iambic paddles (Mode A)', iambicB: 'iambic paddles (Mode B)' };
    $('txHelp').textContent = 'Keying as ' + (names[k] || k) + ' at ' + mode.sendWpm +
      ' wpm. Keyboard: Left Ctrl or [ ' + (k === 'straight' ? '= key' : '= dit, Right Ctrl or ] = dah') +
      '. Change the key type in the CW Trainer’s Keyer Setup.';
  }

  /* ---------------------------------------------------------------------
     MISSION FLOW
     --------------------------------------------------------------------- */
  function startMission() {
    HST.audio.unlock();
    mode = MODES[modeKey];
    $('modeLabel').textContent = mode.label + ' · ' + mode.wpm + '/' + mode.fwpm + ' wpm';
    $('startCard').hidden = true;
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
  }

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
    $('copyResult').innerHTML = '<div class="score">DECODER</div><div class="diff"><span class="ok">' +
      esc(plain(mode.rx)).replace(/ /g, '&nbsp;') + '</span></div>' +
      '<div class="muted">The decoder is free — no penalty.</div>';
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
    var html = '<div class="score">COPY ACCURACY <b>' + pct + '%</b></div>' +
      '<div class="diff">' + diffHtml(r.ops) + '</div>';
    if (r.acc === 1) html += '<div>Perfect copy.</div>';
    else if (gotFact) html += '<div>Good enough — you got the station’s name. Fix it up or continue.</div>';
    else html += '<div class="warn">Red is wrong, _ is missing. Try REPLAY or SLOWER.</div>';
    $('copyResult').innerHTML = html;
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
    $('submitBtn').disabled = true;
    $('nextBtn').hidden = true;
    lockRadio(true);
    $('txPanel').hidden = false;
    $('txTarget').textContent = plain(mode.tx);
    $('txResult').innerHTML = '';
    buildKeys();
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
    var u = 1200 / mode.sendWpm;
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
    b.addEventListener('click', function () { pickMode(b.dataset.mode); });
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
  $('copyIn').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); checkCopy(); }
  });
  // Stop keying safely if the page is hidden mid-transmission (spec section 6).
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { keyer.reset(); HST.audio.stop(); }
  });
  lockRadio(true);
})();
