/*
 * HamShackTech CW Trainer -- QSO engine  (Milestone 7)
 * ======================================================
 * The rules of a simulated contact, kept apart from the QSO tab's screen
 * so they can be tested on their own. Loaded after hst-engine.js,
 * hst-keyer.js and hst-content.js.
 *
 *   var q = HST.qso.create({ style: 'std' | 'pota', who: 'they' | 'you',
 *                            me: { call, name, qth } });
 *   q.steps                    the script: [{ by: 'dx', text } | { by: 'me', need, want, hint }]
 *   HST.qso.check(q, step, sentText)   which required items an over contained
 *   HST.qso.respond(q, step, result, tries)   what the virtual station does next
 *   HST.qso.copyFields(q) / HST.qso.scoreCopy(q, answers)   the copy check
 *
 * A QSO is a scripted conversation -- a fixed series of "overs" that
 * alternate between the virtual station (dx) and you (me) -- not AI chat,
 * so it's predictable and works offline.
 *
 * THE TWO STYLES
 *   Standard: the classic first contact. Call signs, signal report (RST),
 *     name and QTH (location), then 73 (best regards) and goodbye.
 *   POTA (Parks on the Air): a quick contest-style exchange. The
 *     activator (the station in the park) calls "CQ POTA" with the park
 *     reference; hunters answer with just their call; each side gives a
 *     report (usually "5NN" = 599) and state; then TU (thank you) and on
 *     to the next caller.
 *
 * PROSIGNS appear in the scripts as <KN> (go ahead, only you), <SK> (end
 * of contact), <BK> (back to you) and <AR> (end of message); each is sent
 * as one run-together character.
 */
(function () {
  'use strict';

  var HST = window.HST;

  // Prosigns as single characters, so the shared player can send them.
  var PROSIGN_CODES = { '<KN>': '-.--.', '<SK>': '...-.-', '<BK>': '-...-.-', '<AR>': '.-.-.' };
  Object.keys(PROSIGN_CODES).forEach(function (p) { HST.MORSE[p] = PROSIGN_CODES[p]; });

  // "N6WAX DE K1ABC" -> ['N','6','W','A','X',' ','D','E',' ','K','1','A','B','C'], prosigns kept whole.
  function tokenize(text) {
    var out = [], re = /<[A-Z]+>|\s+|\S/g, m;
    while ((m = re.exec(text))) out.push(/^\s+$/.test(m[0]) ? ' ' : m[0]);
    return out;
  }

  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'GM' : h < 18 ? 'GA' : 'GE';   // good morning / afternoon / evening
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* ------------------------------------------------------------------
     A new QSO: the virtual station's details and the script.
     ------------------------------------------------------------------ */
  function create(o) {
    var me = { call: up(o.me.call), name: up(o.me.name), qth: up(o.me.qth) };
    var qth = HST.content.qth();
    var dx = {
      call: o.style === 'pota' ? HST.content.usCallSign() : HST.content.callSign(),
      name: HST.content.name(),
      city: qth.city, state: o.style === 'pota' ? HST.content.state() : qth.state,
      rst: o.style === 'pota' ? '5NN' : pick(['599', '579', '589', '569', '559', '449']),
      park: HST.content.park()
    };
    var q = { style: o.style, who: o.who, me: me, dx: dx, myPark: HST.content.park(), gm: greeting() };
    q.steps = script(q);
    return q;
  }
  function up(s) { return String(s || '').trim().toUpperCase(); }

  // Hints show your own details filled in and theirs as [blanks] -- copying
  // their call, name and QTH by ear is the point.
  function script(q) {
    var M = q.me, D = q.dx, G = q.gm;
    if (q.style === 'std' && q.who === 'they') return [
      { by: 'dx', text: 'CQ CQ CQ DE ' + D.call + ' ' + D.call + ' K' },
      { by: 'me', need: ['mycall'], want: ['dxcall'],
        hint: '[their call] DE ' + M.call + ' ' + M.call + ' K' },
      { by: 'dx', text: M.call + ' DE ' + D.call + ' ' + G + ' TNX FER CALL UR RST ' + D.rst + ' ' + D.rst +
                        ' NAME ' + D.name + ' ' + D.name + ' QTH ' + D.city + ' ' + D.state + ' ' + D.city + ' ' + D.state +
                        ' HW? ' + M.call + ' DE ' + D.call + ' <KN>' },
      { by: 'me', need: ['rst', 'myname', 'myqth'], want: ['dxname'],
        hint: '[their call] DE ' + M.call + ' R TNX [their name] UR RST 599 599 NAME ' + M.name + ' ' + M.name +
              ' QTH ' + M.qth + ' ' + M.qth + ' HW? [their call] DE ' + M.call + ' KN' },
      { by: 'dx', text: M.call + ' DE ' + D.call + ' R TNX ' + M.name + ' FB 73 ES GL ' + M.call + ' DE ' + D.call + ' <SK>' },
      { by: 'me', need: [], want: ['bye'],
        hint: 'TU [their name] 73 GL [their call] DE ' + M.call + ' SK' },
      { by: 'dx', text: 'E E', last: true }
    ];
    if (q.style === 'std') return [   // you call CQ
      { by: 'me', need: ['cq', 'mycall'], want: [],
        hint: 'CQ CQ CQ DE ' + M.call + ' ' + M.call + ' K' },
      { by: 'dx', text: M.call + ' DE ' + D.call + ' ' + D.call + ' K' },
      { by: 'me', need: ['dxcall', 'rst', 'myname', 'myqth'], want: [],
        hint: '[their call] DE ' + M.call + ' ' + G + ' TNX FER CALL UR RST 599 599 NAME ' + M.name + ' ' + M.name +
              ' QTH ' + M.qth + ' ' + M.qth + ' HW? [their call] DE ' + M.call + ' KN' },
      { by: 'dx', text: M.call + ' DE ' + D.call + ' R TNX ' + M.name + ' UR RST ' + D.rst + ' ' + D.rst +
                        ' NAME ' + D.name + ' ' + D.name + ' QTH ' + D.city + ' ' + D.state + ' ' + D.city + ' ' + D.state +
                        ' HW? ' + M.call + ' DE ' + D.call + ' <KN>' },
      { by: 'me', need: [], want: ['dxname', 'bye'],
        hint: 'R TNX [their name] 73 GL [their call] DE ' + M.call + ' SK' },
      { by: 'dx', text: 'TU ' + M.name + ' 73 E E', last: true }
    ];
    if (q.who === 'they') return [   // POTA: they activate, you hunt
      { by: 'dx', text: 'CQ POTA CQ POTA DE ' + D.call + ' ' + D.call + ' ' + D.park + ' K' },
      { by: 'me', need: ['mycall'], want: [],
        hint: M.call + '   (hunters just send their call)' },
      { by: 'dx', text: M.call + ' ' + G + ' UR 5NN 5NN ' + D.state + ' ' + D.state + ' BK' },
      { by: 'me', need: ['rst', 'myqth'], want: ['bye'],
        hint: 'BK TU UR 5NN 5NN ' + M.qth + ' ' + M.qth + ' 73 BK' },
      { by: 'dx', text: 'TU 73 E E', last: true }
    ];
    return [                          // POTA: you activate, they hunt
      { by: 'me', need: ['cq', 'pota', 'mycall', 'park'], want: [],
        hint: 'CQ POTA CQ POTA DE ' + M.call + ' ' + M.call + ' ' + q.myPark + ' K' },
      { by: 'dx', text: D.call + ' ' + D.call },
      { by: 'me', need: ['dxcall', 'rst', 'myqth'], want: [],
        hint: '[their call] ' + G + ' UR 5NN 5NN ' + M.qth + ' ' + M.qth + ' BK' },
      { by: 'dx', text: 'BK TU UR 5NN 5NN ' + D.state + ' ' + D.state + ' 73 BK' },
      { by: 'me', need: [], want: ['bye'],
        hint: 'TU 73 E E' },
      { by: 'dx', text: 'E E', last: true }
    ];
  }

  /* ------------------------------------------------------------------
     Checking an over. Real operators copy through mistakes, so this is
     forgiving: items can come in any order, repeats and extra words are
     fine, a call sign or name of 4+ characters may have one letter wrong,
     and a word split by a long letter gap still counts (matching ignores
     spaces). A signal report is three digits, 1-5 then two 1-9s, with the
     usual "cut numbers" N = 9 and T = 0 allowed (5NN = 599).
     ------------------------------------------------------------------ */
  var LABELS = {
    cq: 'CQ', pota: 'POTA', mycall: 'your call', dxcall: 'their call', rst: 'a signal report (RST)',
    myname: 'your name', myqth: 'your QTH', dxname: 'their name', park: 'your park reference', bye: '73 or TU'
  };

  // Smallest number of single-letter changes turning a into b.
  function editDistance(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d.push([i]); for (j = 1; j <= b.length; j++) d[i].push(i ? 0 : j); }
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  }
  // Was `want` sent? `words` = the over's words; `flat` = the same with
  // spaces removed. Items of 4+ characters (call signs, most names) may be
  // found anywhere in `flat` -- so a long letter gap that split a word
  // doesn't matter -- with one wrong, missing or extra letter allowed.
  // Shorter items (CA, TIM, AL) must be a whole word, or two one-letter
  // words in a row ("C A"), so "CA" isn't found inside "CALL".
  function contains(words, flat, want) {
    want = String(want || '').replace(/[\s-]/g, '');
    if (!want) return false;
    if (want.length < 4) {
      for (var w = 0; w < words.length; w++) {
        if (words[w] === want) return true;
        var pair = words[w] + (words[w + 1] || '');
        if (pair === want && words[w].length === 1) return true;
        if (w + 2 < words.length + 1 && words[w].length === 1 && (words[w + 1] || '').length === 1 && pair + (words[w + 2] || '') === want) return true;
      }
      return false;
    }
    if (flat.indexOf(want) >= 0) return true;
    for (var len = want.length - 1; len <= want.length + 1; len++) {
      for (var i = 0; i + len <= flat.length; i++) if (editDistance(flat.substr(i, len), want) <= 1) return true;
    }
    return false;
  }

  function check(q, step, sent) {
    var words = String(sent || '').toUpperCase().split(/\s+/).filter(Boolean);
    var flat = words.join('').replace(/-/g, '');
    function has(id) {
      switch (id) {
        case 'cq': return /CQ/.test(flat);
        case 'pota': return /POTA/.test(flat);
        case 'mycall': return contains(words, flat, q.me.call);
        case 'dxcall': return contains(words, flat, q.dx.call);
        case 'myname': return contains(words, flat, q.me.name);
        case 'dxname': return contains(words, flat, q.dx.name);
        case 'myqth': return q.me.qth.split(/\s+/).some(function (w) { return contains(words, flat, w); });
        case 'park': return contains(words, flat, q.myPark);
        case 'bye': return /73|TU|<SK>|SK/.test(flat);
        case 'rst': return words.some(function (w) { return /^[1-5][1-9NT]{2}$/.test(w); }) || /[1-5][1-9N]{2}/.test(flat);
      }
      return false;
    }
    var stars = (String(sent).match(/\*/g) || []).length;
    var letters = flat.replace(/<[A-Z]+>/g, '#').length;
    // A request instead of an answer: AGN / ? = please repeat; QRS = please send slower.
    var request = null;
    if (/QRS/.test(flat)) request = 'qrs';
    else if (/AGN/.test(flat) || /^\?+$/.test(flat)) request = 'agn';
    var result = {
      text: words.join(' '),
      passed: [], missing: [], wanted: [], absent: [],
      request: request,
      unreadable: letters > 0 && stars >= Math.max(2, 0.3 * letters),
      empty: !letters
    };
    step.need.forEach(function (id) { (has(id) ? result.passed : result.missing).push(id); });
    step.want.forEach(function (id) { (has(id) ? result.wanted : result.absent).push(id); });
    return result;
  }

  /* ------------------------------------------------------------------
     What the virtual station does after one of your overs:
       { action: 'advance' }                      on to its next over
       { action: 'retry', text }                  it asks for something again
       { action: 'repeat' }                       resend its last over (you asked AGN)
       { action: 'qrs' }                          slow down, then resend (you asked QRS)
       { action: 'silence', note }                nobody heard you (your CQ was missing something)
     After two tries at the same over it gives up asking and moves on
     ("R R"), so a missed item never stalls the contact.
     ------------------------------------------------------------------ */
  function respond(q, step, r, tries) {
    if (r.request === 'qrs' && !r.passed.length) return { action: 'qrs' };
    if (r.request === 'agn' && !r.passed.length) return { action: 'repeat' };
    if (r.empty) return { action: 'silence', note: 'Nothing was heard. Send your over, then pause or press Enter.' };
    if (r.unreadable && tries < 2) return { action: 'retry', text: 'QRS PSE AGN' };
    if (!r.missing.length || tries >= 2) return { action: 'advance' };
    var firstOver = q.steps.indexOf(step) === 0;
    if (firstOver && (r.missing.indexOf('cq') >= 0 || r.missing.indexOf('mycall') >= 0)) {
      // Calling CQ without "CQ" or your call: nobody knows to answer.
      return { action: 'silence', note: 'No one answered. A CQ needs "CQ" and your call sign — try again.' };
    }
    if (r.missing.length > 1) return { action: 'retry', text: 'PSE AGN' };
    var D = q.dx;
    var ask = {
      mycall: 'QRZ?',                                // "who is calling me?"
      dxcall: 'DE ' + D.call + ' ' + D.call,         // they repeat their call for you
      rst: 'RST?', myname: 'NAME?', myqth: q.style === 'pota' ? 'STATE?' : 'QTH?',
      park: 'REF?', cq: 'PSE AGN', pota: 'PSE AGN'
    }[r.missing[0]];
    return { action: 'retry', text: ask || 'PSE AGN' };
  }

  /* ------------------------------------------------------------------
     Copy check: what you should have copied from them.
     ------------------------------------------------------------------ */
  function copyFields(q) {
    var D = q.dx, f = [{ id: 'call', label: 'Their call', truth: D.call }];
    if (q.style === 'std') {
      f.push({ id: 'name', label: 'Their name', truth: D.name });
      f.push({ id: 'qth', label: 'Their QTH', truth: D.city + ' ' + D.state });
    } else {
      if (q.who === 'they') f.push({ id: 'park', label: 'Their park', truth: D.park });
      f.push({ id: 'state', label: 'Their state', truth: D.state });
    }
    f.push({ id: 'rst', label: 'RST they gave you', truth: D.rst });
    return f;
  }
  function norm(s) { return up(s).replace(/[\s-]/g, ''); }
  function rstNorm(s) { return norm(s).replace(/N/g, '9').replace(/T/g, '0'); }
  function scoreCopy(q, answers) {
    return copyFields(q).map(function (f) {
      var given = up(answers[f.id]), ok;
      if (f.id === 'rst') ok = rstNorm(given) === rstNorm(f.truth);
      else if (f.id === 'qth') ok = given.split(/[\s,]+/).filter(Boolean).some(function (w) { return w === q.dx.city || w === q.dx.state; });
      else ok = norm(given) === norm(f.truth);
      return { id: f.id, label: f.label, truth: f.truth, given: given, ok: ok };
    });
  }

  HST.qso = {
    create: create, check: check, respond: respond,
    copyFields: copyFields, scoreCopy: scoreCopy,
    tokenize: tokenize, LABELS: LABELS, contains: contains
  };
})();
