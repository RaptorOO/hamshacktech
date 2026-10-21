/*
 * HamShackTech CW Trainer -- practice content  (Milestone 6)
 * ===========================================================
 * Things to send in the Keyer Practice tab (and, later, the QSO tab):
 *
 *   HST.content.letter()     one random letter or digit
 *   HST.content.word()       one word from a ham-flavored common-word list
 *   HST.content.callSign()   one random, realistic call sign
 *   HST.content.phrase()     one short QSO phrase, with a fresh call sign
 *   HST.content.lists        practice lists sent line by line (pyramid,
 *                            QSO exchanges, dits exercise, pangrams)
 *   HST.content.readText()   someone's own text or Morserino-style file,
 *                            split into chapters (see below)
 *
 * The word list and call sign rules follow the Code Groups trainer's
 * (code-groups/index.html), trimmed to what's useful for SENDING practice:
 * no 2,000-word general list, no prosign entries (those are sent as one
 * run-together character, which beginners aren't drilling yet).
 * Loaded after hst-engine.js.
 */
(function () {
  'use strict';

  var HST = window.HST;
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', DIGITS = '0123456789';

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function letters(n) { var s = ''; for (var i = 0; i < n; i++) s += pick(ALPHA); return s; }

  // Everyday + on-the-air words, 2-6 letters (from Tim's Morserino list
  // used by Code Groups' Common Words, minus prosigns and long rig names).
  var WORDS = [
    'ABOUT', 'AGN', 'ALL', 'AND', 'ANT', 'ARE', 'BAND', 'BEAM', 'BEEN', 'BUT',
    'CALL', 'CAN', 'CLDY', 'COLD', 'COME', 'COOL', 'CPY', 'CQ', 'CUL', 'CW',
    'DAY', 'DE', 'DIPOLE', 'DOWN', 'DX', 'EFHW', 'ES', 'FB', 'FER', 'FIND',
    'FOR', 'FREQ', 'FROM', 'GA', 'GE', 'GET', 'GL', 'GM', 'GND', 'GOOD',
    'GUD', 'HAVE', 'HERE', 'HOT', 'HOW', 'HPE', 'HR', 'HW', 'JUST', 'KNOW',
    'LIKE', 'LOOK', 'MAKE', 'NAME', 'NET', 'NICE', 'NOW', 'NR', 'OM', 'OP',
    'OUT', 'POTA', 'PSE', 'PWR', 'QRM', 'QRP', 'QRS', 'QSB', 'QSO', 'QTH',
    'RAIN', 'RIG', 'RPT', 'RR', 'RST', 'SEE', 'SIG', 'SOME', 'STN', 'SUN',
    'TEMP', 'TEST', 'THE', 'THAT', 'THIS', 'TIME', 'TNX', 'TU', 'UP', 'UR',
    'VY', 'WARM', 'WATTS', 'WELL', 'WHAT', 'WILL', 'WITH', 'WX', 'XYL', 'YAGI',
    'YES', 'YL', 'YOU', 'YOUR'
  ];

  /* Call signs: PREFIX + one DIGIT (call area) + SUFFIX, like real calls.
     Mostly US formats (the FCC's 1x2 / 2x2 / 2x3), with some DX. */
  function usCall() {
    var d = pick(DIGITS);
    var fmt = pick(['1x2', '2x2', '2x3', '2x3']);    // 2x3 is the most common on the air
    if (fmt === '1x2') return pick(['K', 'N', 'W']) + d + letters(2);
    var p2 = pick(['K', 'N', 'W']) + pick(ALPHA);
    if (fmt === '2x2') return p2 + d + letters(2);
    var first;                                        // the FCC skips Q-first 2x3 suffixes
    do { first = pick(ALPHA); } while (first === 'Q');
    return p2 + d + first + letters(2);
  }
  var DX = [
    ['VE', '123456789', 3], ['VA', '123456789', 2], ['DL', '123456789', 3], ['JA', '0123456789', 3],
    ['VK', '12345678', 2], ['G', '0134', 3], ['M', '0167', 3], ['F', '14568', 3],
    ['EA', '123456789', 3], ['PA', '0123456789', 3], ['I', '0123456789', 3], ['ZL', '1234', 2]
  ];
  function callSign() {
    if (Math.random() < 0.75) return usCall();
    var f = pick(DX);
    return f[0] + pick(f[1].split('')) + letters(f[2]);
  }

  // Short, real-world QSO pieces. {C} becomes a fresh call sign.
  var PHRASES = [
    'CQ CQ DE {C}', 'CQ POTA DE {C}', '{C} DE {C}', 'UR RST 599', 'RST 579 579',
    '5NN TU', 'NAME TIM', 'QTH CA', 'TNX FER QSO', 'GM OM', 'HW CPY', 'PSE QRS',
    'RIG QRP', 'ANT DIPOLE', 'WX SUNNY', 'TU 73', 'GL ES 73', 'FB OM TNX',
    'QSL TU', 'AGN PSE', 'R R TU', 'BK TU'
  ];
  function phrase() {
    return pick(PHRASES).replace(/\{C\}/g, function () { return callSign(); });
  }

  /* For the QSO tab's virtual stations (Milestone 7): short operator
     names (as sent on the air -- one word, easy to copy), a QTH as city +
     state, US state abbreviations for POTA, and a POTA park reference.
     POTA park references are country prefix + number; US parks changed
     from "K-" to "US-" in 2024 (e.g. US-1234). */
  var NAMES = ['BOB', 'JIM', 'TOM', 'BILL', 'JOE', 'DAN', 'MIKE', 'STEVE', 'DAVE', 'RON', 'KEN', 'AL',
               'ED', 'RAY', 'GARY', 'JACK', 'PAUL', 'MARK', 'RICK', 'ANN', 'SUE', 'MARY', 'KAY', 'JAN',
               'LIZ', 'PAT', 'DON', 'HAL', 'GUS', 'WALT'];
  var QTHS = [['DENVER', 'CO'], ['AUSTIN', 'TX'], ['OMAHA', 'NE'], ['BOISE', 'ID'], ['TAMPA', 'FL'],
              ['RENO', 'NV'], ['MESA', 'AZ'], ['TULSA', 'OK'], ['DAYTON', 'OH'], ['SALEM', 'OR'],
              ['BANGOR', 'ME'], ['FARGO', 'ND'], ['MACON', 'GA'], ['ERIE', 'PA'], ['TOPEKA', 'KS'],
              ['DULUTH', 'MN'], ['MOBILE', 'AL'], ['ALBANY', 'NY'], ['BUTTE', 'MT'], ['PROVO', 'UT'],
              ['DOVER', 'DE'], ['FLINT', 'MI'], ['AMES', 'IA'], ['KEENE', 'NH'], ['NAPA', 'CA']];
  var STATES = ['AL', 'AZ', 'CA', 'CO', 'FL', 'GA', 'ID', 'IL', 'IN', 'KS', 'KY', 'MA', 'MI', 'MN', 'MO',
                'NC', 'NE', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'SC', 'TN', 'TX', 'UT', 'VA', 'WA', 'WI'];

  HST.content = {
    letter: function () { return pick((ALPHA + DIGITS).split('')); },
    word: function () { return pick(WORDS); },
    callSign: callSign,
    usCallSign: usCall,      // POTA/QSO stations whose state is sent need a US call
    phrase: phrase,
    name: function () { return pick(NAMES); },
    qth: function () { var q = pick(QTHS); return { city: q[0], state: q[1] }; },
    state: function () { return pick(STATES); },
    park: function () { return 'US-' + (1000 + Math.floor(Math.random() * 8999)); }
  };

  /* ---------------------------------------------------------------------
     PRACTICE LISTS (Tim, 2026-10-21), sent one line at a time, in order.
     Each is { key, name, credit, lines() } -- lines() is a function so
     QSO exchanges get fresh call signs, names and states each time.

     The pyramid (Marie's Morse code pyramid practice): each line pairs one
     letter with itself and every letter after it, run together --
     AA AB AC ... AZ, then BB BC ... BZ, down to ZZ. Backwards runs the
     other way: ZZ ZY ... ZA, down to AA. Built from the pattern, so the
     typos in the handout (an extra W in the D line, an extra N in the N
     line, a missing letter in Q, O and E) aren't copied.
     --------------------------------------------------------------------- */
  function pyramid(backwards) {
    var order = backwards ? ALPHA.split('').reverse() : ALPHA.split('');
    return order.map(function (x, i) { return order.slice(i).map(function (y) { return x + y; }).join(''); });
  }
  function qsoExchange() {
    var a = usCall(), b, na = pick(NAMES), nb, sa = pick(STATES), sb;
    do { b = callSign(); } while (b === a);
    do { nb = pick(NAMES); } while (nb === na);
    do { sb = pick(STATES); } while (sb === sa);
    return [
      'CQ CQ CQ DE ' + a + ' ' + a + ' K',
      b + ' ' + b,
      b + ' DE ' + a + ' GM TNX FER CALL <BT>',
      'UR RST 599 5NN <BT> NAME ' + na + ' ' + na + ' <BT>',
      'QTH ' + sa + ' ' + sa + ' <BT> HW CPY? ' + b + ' DE ' + a + ' <KN>',
      'R R ' + a + ' DE ' + b + ' GM ' + na + ' TNX <BT>',
      'UR RST 579 579 <BT> NAME ' + nb + ' ' + nb + ' <BT> QTH ' + sb + ' ' + sb + ' <BT>',
      'HW? ' + a + ' DE ' + b + ' <KN>',
      'R R FB ' + nb + ' TNX FER QSO <BT> 73 ES GL',
      b + ' DE ' + a + ' <SK> TU',
      'TU ES 73 <SK> E E'
    ];
  }
  HST.content.lists = [
    { key: 'pyr-az', name: 'Pyramid A to Z', credit: 'From Marie’s Morse code pyramid practice: AA AB AC … down to ZZ.',
      lines: function () { return pyramid(false); } },
    { key: 'pyr-za', name: 'Pyramid Z to A', credit: 'From Marie’s Morse code pyramid practice, backwards: ZZ ZY ZX … down to AA.',
      lines: function () { return pyramid(true); } },
    { key: 'qso-x', name: 'QSO exchanges', credit: 'A short contact, line by line, with new call signs, names and states each time.',
      lines: qsoExchange },
    { key: 'dits', name: 'Dits exercise', credit: 'Sentences built mostly from dit letters: E, I, S, H and 5.',
      lines: function () { return ['DID SHE SEE HIS FEES?', 'IS N5SH HERE?', 'HE IS IN THESE TREES.', 'HIS TREE IS HERE.', 'THIS IS SHE.', 'SHE IS 55 AND SHE IS HIS SISTER']; } },
    { key: 'pangrams', name: 'Pangrams', credit: 'Sentences that use every letter of the alphabet.',
      lines: function () {
        return ['FIVE WINE EXPERTS JOKINGLY QUIZZED SAMPLE CHABLIS', 'PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS',
                'SPHINX OF BLACK QUARTZ JUDGE MY VOW', 'HOW VEXINGLY QUICK DAFT ZEBRAS JUMP',
                'THE FIVE BOXING WIZARDS JUMP QUICKLY', 'JACKDAWS LOVE MY BIG SPHINX OF QUARTZ'];
      } }
  ];

  /* ---------------------------------------------------------------------
     YOUR OWN TEXT -- typed, pasted, or a text file like the ones
     Morserino plays. A line starting "<c>$" begins a chapter:
         <c>$ QSO Elements
     and each chapter is its own choice. Each line is made sendable:
     capitals; prosigns as <SK> (written <SK>, /SK, or = for <BT>; <K> is
     just K); Morserino commands (\p\, \t) dropped; characters Morse
     doesn't have skipped and reported in `skipped`.
       HST.content.readText(text, title, skipped) -> [{ title, lines }]
     One file is kept for the whole app (both Copy this and Code Groups
     use it), in localStorage:
       HST.content.ownFile.get() -> { name, text } or null
       HST.content.ownFile.set({ name, text })   (throws if storage is full)
       HST.content.ownFile.clear()
       HST.content.ownFile.chapters() -> [{ title, lines }]
     --------------------------------------------------------------------- */
  var PROSIGN_NAMES = ['AR', 'SK', 'KN', 'BT', 'BK', 'AS'];
  function cleanLine(raw, skipped) {
    var t = raw.replace(/\\[a-z]\\?/gi, ' ').toUpperCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    t = t.replace(/(^|\s)\/([A-Z]{2})(?=\s|$)/g, function (m, pre, p) { return PROSIGN_NAMES.indexOf(p) >= 0 ? pre + '<' + p + '>' : m; });
    t = t.replace(/=/g, '<BT>');
    var out = '';
    t.replace(/<([A-Z]+)>|[\s\S]/g, function (m, p) {
      if (p) out += PROSIGN_NAMES.indexOf(p) >= 0 ? m : p;
      else if (/\s/.test(m)) out += ' ';
      else if (HST.MORSE[m]) out += m;
      else if (skipped) skipped[m] = true;
      return m;
    });
    return out.replace(/ +/g, ' ').trim();
  }
  function readText(text, title, skipped) {
    var chapters = [], cur = null;
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var c = /^\s*<c>\s*\$?\s*(.*)$/i.exec(raw);
      if (c) { cur = { title: c[1].trim() || 'Chapter ' + (chapters.length + 1), lines: [] }; chapters.push(cur); return; }
      var line = cleanLine(raw, skipped);
      if (!line) return;
      if (!cur) { cur = { title: title || 'My text', lines: [] }; chapters.push(cur); }
      cur.lines.push(line);
    });
    return chapters.filter(function (ch) { return ch.lines.length; });
  }
  HST.content.readText = readText;

  var OWN_KEY = 'hct-cw-own-text-v1';
  HST.content.ownFile = {
    MAX_BYTES: 200000,
    get: function () { try { return JSON.parse(localStorage.getItem(OWN_KEY) || 'null'); } catch (e) { return null; } },
    set: function (f) { localStorage.setItem(OWN_KEY, JSON.stringify({ name: f.name || '', text: String(f.text || '').slice(0, 200000) })); },
    clear: function () { try { localStorage.removeItem(OWN_KEY); } catch (e) {} },
    title: function (f) { return f && f.name ? f.name.replace(/\.[^.]+$/, '') : 'My text'; },
    chapters: function () { var f = this.get(); return f ? readText(f.text, this.title(f)) : []; }
  };
})();
