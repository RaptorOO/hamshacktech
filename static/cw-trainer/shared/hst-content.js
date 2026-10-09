/*
 * HamShackTech CW Trainer -- practice content  (Milestone 6)
 * ===========================================================
 * Things to send in the Keyer Practice tab (and, later, the QSO tab):
 *
 *   HST.content.letter()     one random letter or digit
 *   HST.content.word()       one word from a ham-flavored common-word list
 *   HST.content.callSign()   one random, realistic call sign
 *   HST.content.phrase()     one short QSO phrase, with a fresh call sign
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

  HST.content = {
    letter: function () { return pick((ALPHA + DIGITS).split('')); },
    word: function () { return pick(WORDS); },
    callSign: callSign,
    phrase: phrase
  };
})();
