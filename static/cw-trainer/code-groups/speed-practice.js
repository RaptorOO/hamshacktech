/*
 * CW Trainer -- Speed Practice in Code Groups (Tim, 2026-11-03)
 * =============================================================
 * CW Academy's speed practice (its guidelines for LCWO), without leaving
 * the app. Four exercises, each a ladder of steps:
 *
 *   Letters          1-minute runs of letter groups      3, 4, then 5 per group
 *   Words            runs of 20 short words, one by one  up to 3, 4, then 5 letters
 *   Figures          1-minute runs of figure groups      3, then 4 per group
 *   Your characters  1-minute runs of your own set       2, then 3 per group
 *
 * Each step is a group size and an effective (overall) speed: 10, 13, 15,
 * 18, 20 WPM, never below the class speed. Characters are sent at 25 WPM
 * (or the step's speed, if faster) and spaced out to the step's speed, as
 * LCWO does with "real speed" off. Once the last 3 runs at a step average
 * 90% or better (Words: fewer than 3 errors), the panel suggests the next
 * step: the next speed, and after 20 WPM, back to the class speed with one
 * more character. The student can also move between steps by hand.
 *
 * A 1-minute run plays groups without stopping; you type as you go (spaces
 * between groups), then Check Results marks your copy against what was sent
 * (groups lined up the way LCWO does, so a missed or extra group doesn't
 * throw the rest off). Words plays one word at a time; type it and press
 * Enter, like LCWO's Word Training.
 *
 * Every run is saved to Practice History through Code Groups' own recorder
 * (mode 'speed'), so it shows in Progress. The ladder, the runs and your
 * characters are kept in localStorage (KEY), and sync with the account as
 * a setting (shared/hst-account.js).
 *
 * Opened by the Speed Practice button, or from My Course's homework links
 * (?sp=letters&class=13, or HSTSpeedPractice.open('letters', 13)).
 * Loaded after Code Groups' own script, which sets window.HSTCodeGroups.
 */
(function () {
  'use strict';

  var HST = window.HST, CG = window.HSTCodeGroups;
  var KEY = 'hct-cw-speed-practice-v1';
  var SPEEDS = [10, 13, 15, 18, 20];
  var CHAR_WPM = 25;          // character speed (LCWO's usual for CW Academy)
  var RUN_MS = 60000;         // a run of groups lasts 1 minute
  var WORDS_PER_RUN = 20;
  var NEED = 3;               // runs at a step averaged for the suggestion
  var GOAL_ACC = 90, GOAL_ERR = 3;
  var EX = {
    letters: { name: 'Letters', sizes: [3, 4, 5], words: false },
    words:   { name: 'Words', sizes: [3, 4, 5], words: true },
    figures: { name: 'Figures', sizes: [3, 4], words: false },
    custom:  { name: 'Your characters', sizes: [2, 3], words: false }
  };
  var ORDER = ['letters', 'words', 'figures', 'custom'];
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), DIGITS = '0123456789'.split('');

  /* ---------------- saved state ---------------- */
  function load() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    o = o && typeof o === 'object' ? o : {};
    var out = { classWpm: clampWpm(o.classWpm) || 10, cur: EX[o.cur] ? o.cur : 'letters',
                custom: typeof o.custom === 'string' ? o.custom : '', misses: o.misses && typeof o.misses === 'object' ? o.misses : {}, ex: {} };
    ORDER.forEach(function (k) {
      var e = (o.ex && o.ex[k]) || {};
      out.ex[k] = { size: EX[k].sizes.indexOf(e.size) >= 0 ? e.size : EX[k].sizes[0], wpm: clampWpm(e.wpm) || 0,
                    runs: Array.isArray(e.runs) ? e.runs.slice(-30) : [] };
    });
    return out;
  }
  function clampWpm(w) { w = Math.round(Number(w) || 0); return w ? Math.min(40, Math.max(5, w)) : 0; }
  var sp = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(sp)); } catch (e) {} }
  // Another device's ladder came in with the settings sync.
  window.addEventListener('storage', function (e) { if (e.key === KEY && !busy()) { sp = load(); render(); } });

  /* ---------------- the ladder ---------------- */
  function floor() { return Math.max(10, sp.classWpm); }
  function speeds() { var f = floor(); return [f].concat(SPEEDS.filter(function (s) { return s > f; })); }
  function step(k) {
    var e = sp.ex[k || sp.cur];
    if (!e.wpm || e.wpm < floor()) e.wpm = floor();
    return e;
  }
  function nextStep(k) {
    var e = step(k), s = speeds(), i = s.indexOf(e.wpm), sizes = EX[k].sizes, j = sizes.indexOf(e.size);
    if (i < 0) { var up = s.filter(function (w) { return w > e.wpm; })[0]; if (up) return { size: e.size, wpm: up }; i = s.length - 1; }
    if (i < s.length - 1) return { size: e.size, wpm: s[i + 1] };
    if (j < sizes.length - 1) return { size: sizes[j + 1], wpm: floor() };
    return null;
  }
  function prevStep(k) {
    var e = step(k), s = speeds(), i = s.indexOf(e.wpm), sizes = EX[k].sizes, j = sizes.indexOf(e.size);
    if (i > 0) return { size: e.size, wpm: s[i - 1] };
    if (i < 0) { var down = s.filter(function (w) { return w < e.wpm; }).pop(); if (down) return { size: e.size, wpm: down }; }
    if (j > 0) return { size: sizes[j - 1], wpm: s[s.length - 1] };
    return null;
  }
  function stepRuns(k) {
    var e = step(k);
    return e.runs.filter(function (r) { return r.size === e.size && r.wpm === e.wpm; });
  }
  // { avg, n, ready }: the last NEED runs at this step, and whether they meet the goal.
  function standing(k) {
    var rs = stepRuns(k).slice(-NEED), words = EX[k].words;
    if (!rs.length) return { n: 0 };
    var sum = rs.reduce(function (t, r) { return t + (words ? r.err : r.acc); }, 0), avg = sum / rs.length;
    return { n: rs.length, avg: avg, ready: rs.length >= NEED && (words ? avg < GOAL_ERR : avg >= GOAL_ACC) };
  }
  function charWpm(w) { return Math.max(CHAR_WPM, w); }
  function stepText(k, s) {
    s = s || step(k);
    var unit = EX[k].words ? 'up to ' + s.size + ' letters' : s.size + ' per group';
    return unit + ' · ' + s.wpm + ' WPM';
  }

  /* ---------------- what's sent ---------------- */
  function customSet() {
    var seen = {}, out = [];
    (sp.custom || '').toUpperCase().split('').forEach(function (c) { if (HST.MORSE[c] && c !== ' ' && !seen[c]) { seen[c] = 1; out.push(c); } });
    return out;
  }
  function charset(k) { return k === 'letters' ? ALPHA : k === 'figures' ? DIGITS : customSet(); }
  function group(k, n) {
    var cs = charset(k), g = '';
    for (var i = 0; i < n; i++) g += cs[Math.floor(Math.random() * cs.length)];
    return g;
  }
  var wordDeck = { key: '', cards: [] };
  function nextWord(n) {
    var key = 'w' + n;
    if (wordDeck.key !== key || !wordDeck.cards.length) {
      var c = CG.wordsUpTo(n).slice();
      for (var i = c.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = c[i]; c[i] = c[j]; c[j] = t; }
      wordDeck = { key: key, cards: c };
    }
    return wordDeck.cards.pop();
  }

  /* ---------------- marking ---------------- */
  function lev(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  }
  // Which characters of a were copied: those in a longest common subsequence with b.
  function lcsMarks(a, b) {
    var n = a.length, m = b.length, L = [], i, j;
    for (i = 0; i <= n; i++) { L[i] = []; for (j = 0; j <= m; j++) L[i][j] = 0; }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var ok = a.split('').map(function () { return false; });
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ok[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
    return ok;
  }
  /* Lines up the groups sent with the groups typed (fewest character
     errors, like LCWO): a missed group costs its length, an extra one
     typed costs its length, and a pair costs the edits between them.
     -> { pairs: [{ sent, typed }], errors } */
  function align(sent, typed) {
    var n = sent.length, m = typed.length, D = [], i, j;
    for (i = 0; i <= n; i++) { D[i] = []; }
    D[0][0] = 0;
    for (i = 1; i <= n; i++) D[i][0] = D[i - 1][0] + sent[i - 1].length;
    for (j = 1; j <= m; j++) D[0][j] = D[0][j - 1] + typed[j - 1].length;
    for (i = 1; i <= n; i++) for (j = 1; j <= m; j++) {
      D[i][j] = Math.min(D[i - 1][j] + sent[i - 1].length, D[i][j - 1] + typed[j - 1].length, D[i - 1][j - 1] + lev(sent[i - 1], typed[j - 1]));
    }
    var pairs = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + lev(sent[i - 1], typed[j - 1])) { pairs.unshift({ sent: sent[i - 1], typed: typed[j - 1] }); i--; j--; }
      else if (i > 0 && D[i][j] === D[i - 1][j] + sent[i - 1].length) { pairs.unshift({ sent: sent[i - 1], typed: '' }); i--; }
      else { pairs.unshift({ sent: '', typed: typed[j - 1] }); j--; }
    }
    return { pairs: pairs, errors: D[n][m] };
  }

  /* ---------------- the panel ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var dlg = $('spDialog');
  var run = null;   // the run in progress: { k, size, wpm, words, sent, ... }
  function busy() { return !!run; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render() {
    var k = sp.cur, e = step(k), st = standing(k), nx = nextStep(k), pv = prevStep(k);
    ORDER.forEach(function (x) { $('spTab-' + x).setAttribute('aria-pressed', String(x === k)); });
    $('spStep').textContent = stepText(k);
    var cw = charWpm(e.wpm);
    $('spStepSub').textContent = cw > e.wpm ? 'characters at ' + cw + ' WPM, spaced out to ' + e.wpm + ' WPM' : 'characters and spacing at ' + cw + ' WPM';
    $('spPrev').disabled = !pv || busy(); $('spNext').disabled = !nx || busy();
    $('spClass').value = String(sp.classWpm);
    $('spCustomRow').hidden = k !== 'custom';
    $('spCustom').value = sp.custom;
    $('spWhat').textContent = EX[k].words
      ? 'A run is ' + WORDS_PER_RUN + ' words, one at a time: type each and press Enter. Move up when you’re making fewer than ' + GOAL_ERR + ' errors a run.'
      : 'A run is 1 minute of groups without a break: type as you go, with a space between groups, then check. Move up when you average ' + GOAL_ACC + '% or better.';
    // This step's runs, newest first.
    var rs = stepRuns(k).slice(-8).reverse();
    $('spRuns').innerHTML = rs.length ? rs.map(function (r) {
      var good = EX[k].words ? r.err < GOAL_ERR : r.acc >= GOAL_ACC;
      return '<span class="sp-run' + (good ? ' good' : '') + '">' + (EX[k].words ? r.err + ' err' : r.acc + '%') + '</span>';
    }).join('') : '<span class="sp-none">No runs at this step yet.</span>';
    var adv = '';
    if (st.n) {
      var avgTxt = EX[k].words ? (st.n === 1 ? st.avg : st.avg.toFixed(1)) + (st.avg === 1 ? ' error' : ' errors') : Math.round(st.avg) + '%';
      adv = 'Last ' + (st.n === 1 ? 'run' : st.n + ' runs') + ': ' + avgTxt + (st.n > 1 ? ' on average' : '') + '. ';
      if (st.ready) adv += nx ? 'You’re ready for the next step: ' + stepText(k, nx) + '.' : 'You’ve reached the top of this ladder. Well done!';
      else adv += st.n < NEED ? 'Do ' + (NEED - st.n) + ' more ' + (NEED - st.n === 1 ? 'run' : 'runs') + ' here.' : 'Keep going at this step.';
    } else adv = 'CW Academy suggests five or more runs a day.';
    $('spAdvice').textContent = adv;
    $('spUpBtn').hidden = !(st.ready && nx) || busy();
    if (nx) $('spUpBtn').textContent = 'Move up: ' + stepText(k, nx);
    // Buttons
    $('spStartBtn').hidden = busy();
    $('spStartBtn').textContent = stepRuns(k).length ? 'Start the next run' : 'Start a run';
    $('spStartBtn').disabled = k === 'custom' && customSet().length < 2;
    $('spStopBtn').hidden = !busy() || (run && run.over);
    $('spCheckBtn').hidden = !(run && run.over && !EX[run.k].words);
    $('spSetup').classList.toggle('sp-locked', busy());
  }

  function choose(k) { if (busy()) return; sp.cur = k; save(); $('spResult').hidden = true; render(); }
  ORDER.forEach(function (k) { $('spTab-' + k).addEventListener('click', function () { choose(k); }); });
  function moveTo(s) { if (!s || busy()) return; var e = step(); e.size = s.size; e.wpm = s.wpm; save(); $('spResult').hidden = true; render(); }
  $('spPrev').addEventListener('click', function () { moveTo(prevStep(sp.cur)); });
  $('spNext').addEventListener('click', function () { moveTo(nextStep(sp.cur)); });
  $('spUpBtn').addEventListener('click', function () { moveTo(nextStep(sp.cur)); });
  (function () {
    var o = [];
    for (var w = 5; w <= 30; w++) o.push('<option value="' + w + '">' + w + ' WPM</option>');
    $('spClass').innerHTML = o.join('');
  })();
  $('spClass').addEventListener('change', function () { sp.classWpm = clampWpm($('spClass').value) || 10; save(); render(); });
  $('spCustom').addEventListener('input', function () { sp.custom = $('spCustom').value.toUpperCase(); save(); render(); });
  // Your characters: the ones you've missed most in Letters and Figures runs.
  $('spFill').addEventListener('click', function () {
    var worst = Object.keys(sp.misses).map(function (c) { var m = sp.misses[c]; return { c: c, miss: m[0], rate: m[0] / Math.max(1, m[1]) }; })
      .filter(function (x) { return x.miss > 0; })
      .sort(function (a, b) { return b.rate - a.rate || b.miss - a.miss; }).slice(0, 6).map(function (x) { return x.c; });
    if (!worst.length) { $('spFillNote').textContent = 'No misses yet: do a few Letters or Figures runs first.'; return; }
    $('spFillNote').textContent = '';
    sp.custom = worst.join(''); save(); render();
  });

  /* ---------------- a run ---------------- */
  function sound() { var s = CG.sound(); return { toneHz: s.toneHz, volume: s.volume }; }
  function meta(text) { $('spMeta').textContent = text; }

  function start() {
    if (busy()) return;
    HST.audio.unlock();                      // inside the click, as browsers require
    CG.stopAll();
    var k = sp.cur, e = step(k);
    if (k === 'custom' && customSet().length < 2) return;
    run = { k: k, size: e.size, wpm: e.wpm, cw: charWpm(e.wpm), sent: [], id: Date.now(), over: false, results: [] };
    run.fw = run.wpm < run.cw ? run.wpm : 0;
    $('spResult').hidden = true;
    $('spPlay').hidden = false;
    $('spTyped').hidden = EX[k].words; $('spWordRow').hidden = !EX[k].words;
    $('spTyped').value = ''; $('spWord').value = ''; $('spWordFeed').innerHTML = '';
    render();
    var left = 3, id = run.id;
    meta('Starting in ' + left + '…');
    (EX[k].words ? $('spWord') : $('spTyped')).focus();
    var t = setInterval(function () {
      if (!run || run.id !== id) return clearInterval(t);
      if (--left > 0) return meta('Starting in ' + left + '…');
      clearInterval(t);
      if (EX[k].words) wordLoop(id); else streamLoop(id);
    }, 1000);
    run.countdown = t;
  }

  // 1 minute of groups, one after another with a word space between them.
  function streamLoop(id) {
    var t0 = Date.now(), s = sound();
    run.t0 = t0;
    var tick = setInterval(function () {
      if (!run || run.id !== id || run.over) return clearInterval(tick);
      meta('Copy as you go • ' + Math.max(0, Math.ceil((RUN_MS - (Date.now() - t0)) / 1000)) + ' s left');
    }, 250);
    (function next() {
      if (!run || run.id !== id) return;
      if (Date.now() - t0 >= RUN_MS) return streamOver(id);
      var g = group(run.k, run.size);
      run.sent.push(g);
      HST.audio.playMorse(g.split('').concat(' '), { wpm: run.cw, fwpm: run.fw, toneHz: s.toneHz, volume: s.volume }).done.then(next);
    })();
  }
  function streamOver(id) {
    if (!run || run.id !== id) return;
    run.over = true;
    meta('Time’s up. Finish typing what you copied, then press Check Results.');
    render();
    $('spTyped').focus();
  }
  function check() {
    if (!run || !run.over || EX[run.k].words) return;
    var typed = $('spTyped').value.toUpperCase().split(/\s+/).filter(Boolean);
    var a = align(run.sent, typed), chars = run.sent.join('').length;
    var acc = Math.max(0, Math.round(100 * (1 - a.errors / Math.max(1, chars))));
    var log = CG.log;
    log.start(runMeta());
    a.pairs.forEach(function (p) {
      if (!p.sent) return;
      var ok = lcsMarks(p.sent, p.typed);
      p.sent.split('').forEach(function (c, i) {
        log.char(c, ok[i]);
        var m = sp.misses[c] || (sp.misses[c] = [0, 0]);
        m[1]++; if (!ok[i]) m[0]++;
      });
      log.round(p.sent === p.typed, null, false);
    });
    log.set({ errors: a.errors, accuracy: acc });
    log.finish();
    finishRun({ acc: acc, err: a.errors, n: run.sent.length },
      acc + '% • ' + a.errors + (a.errors === 1 ? ' error' : ' errors') + ' in ' + run.sent.length + ' groups (' + chars + ' characters)',
      a.pairs.map(function (p) {
        var cls = p.sent === p.typed ? 'ok' : 'bad';
        return '<span class="sp-pair ' + cls + '"><b>' + esc(p.sent || '—') + '</b><i>' + esc(p.typed || '—') + '</i></span>';
      }).join(''));
  }

  // Words: one at a time, type it and press Enter.
  function wordLoop(id) {
    var s = sound();
    run.n = 0; run.right = 0; run.t0 = Date.now();
    var log = CG.log;
    log.start(runMeta());
    function play() {
      if (!run || run.id !== id) return;
      if (run.n >= WORDS_PER_RUN) return wordsOver(id);
      run.word = nextWord(run.size);
      run.sent.push(run.word);
      run.answered = false;
      run.played = Date.now();
      meta('Word ' + (run.n + 1) + ' of ' + WORDS_PER_RUN + ' • type it, then Enter');
      $('spWord').value = '';
      HST.audio.playMorse(run.word.split(''), { wpm: run.cw, fwpm: run.fw, toneHz: s.toneHz, volume: s.volume });
    }
    run.answer = function () {
      if (!run || run.id !== id || run.answered || !run.word) return;
      run.answered = true;
      HST.audio.stop();
      var typed = $('spWord').value.trim().toUpperCase(), ok = typed === run.word;
      var marks = lcsMarks(run.word, typed);
      run.word.split('').forEach(function (c, i) { log.char(c, marks[i]); });
      log.round(ok, Date.now() - run.played, false);
      run.n++; if (ok) run.right++;
      run.results.push({ sent: run.word, typed: typed });
      $('spWordFeed').innerHTML = '<span class="sp-pair ' + (ok ? 'ok' : 'bad') + '"><b>' + esc(run.word) + '</b><i>' + esc(typed || '—') + '</i></span>' + $('spWordFeed').innerHTML;
      setTimeout(play, ok ? 500 : 1200);
    };
    play();
  }
  function wordsOver(id) {
    if (!run || run.id !== id) return;
    var err = run.n - run.right, acc = Math.round(100 * run.right / Math.max(1, run.n));
    CG.log.set({ errors: err, accuracy: acc });
    CG.log.finish();
    finishRun({ acc: acc, err: err, n: run.n },
      run.right + ' of ' + run.n + ' words right • ' + err + (err === 1 ? ' error' : ' errors'),
      run.results.map(function (p) {
        return '<span class="sp-pair ' + (p.sent === p.typed ? 'ok' : 'bad') + '"><b>' + esc(p.sent) + '</b><i>' + esc(p.typed || '—') + '</i></span>';
      }).join(''));
  }
  $('spWord').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (run && run.answer) run.answer(); }
  });

  function runMeta() {
    return { mode: 'speed', speedPractice: run.k, group: { letters: 'letters', words: 'words', figures: 'numbers', custom: 'custom' }[run.k],
             groupSize: run.size, wpm: run.cw, fwpm: run.fw, classWpm: sp.classWpm, custom: run.k === 'custom' ? sp.custom : undefined };
  }
  function finishRun(score, line, detail) {
    var e = sp.ex[run.k];
    e.runs.push({ t: Date.now(), size: run.size, wpm: run.wpm, acc: score.acc, err: score.err, n: score.n });
    e.runs = e.runs.slice(-30);
    save();
    run = null;
    $('spPlay').hidden = true;
    $('spResultLine').textContent = line;
    $('spResultDetail').innerHTML = detail;
    $('spResult').hidden = false;
    render();
    $('spStartBtn').focus();
  }
  // Stop: the run is dropped (nothing saved).
  function stop() {
    if (!run) return;
    clearInterval(run.countdown);
    HST.audio.stop();
    if (EX[run.k].words && run.n) CG.log.finish();    // words already copied still count as practice
    run = null;
    $('spPlay').hidden = true;
    render();
  }
  $('spStartBtn').addEventListener('click', start);
  $('spStopBtn').addEventListener('click', stop);
  $('spCheckBtn').addEventListener('click', check);
  $('spTyped').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && run && run.over) { e.preventDefault(); check(); }
  });
  $('spCloseBtn').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', stop);

  function open(k, classWpm) {
    CG.stopAll();
    if (EX[k]) sp.cur = k;
    var c = clampWpm(classWpm);
    if (c) sp.classWpm = c;
    if (!sp.custom) sp.custom = (CG.sound().custom || '').toUpperCase().replace(/\s+/g, '');
    save();
    $('spResult').hidden = true; $('spFillNote').textContent = '';
    render();
    if (!dlg.open) dlg.showModal();
  }
  $('spBtn').addEventListener('click', function () { open(); });
  window.HSTSpeedPractice = { open: open };

  // Opened from a homework link: code-groups/?sp=letters&class=13
  var q = new URLSearchParams(location.search);
  if (EX[q.get('sp')]) setTimeout(function () { open(q.get('sp'), q.get('class')); }, 0);
})();
