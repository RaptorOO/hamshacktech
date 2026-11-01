/*
 * HamShackTech CW Trainer -- your Morse code course (Tim, 2026-10-23)
 * =====================================================================
 * Which course you're taking (chosen in Settings) and what the My Course
 * tab shows about it: the class schedule and the curriculum.
 *
 *   HST.course.get()            { program: '' | 'cwa' | 'licw', level, firstClass: 'YYYY-MM-DD' | '', days: [1, 4],
 *                                 times: { 1: '19:00', 4: '19:00' } }  -- each class day's start time ('' = not set)
 *   HST.course.set(patch)
 *   HST.course.onChange(fn)     fn(course) -- also when another tab/frame changes it
 *   HST.course.PROGRAMS         { cwa: { name, levels: [{ key, name }] }, licw: {...} }
 *   HST.course.info(program, level)  -> that level's details, or null
 *   HST.course.ORDERS           { cwaBeginner: { name, classes: [['A','E','N','T'], ...] } } -- the order
 *                               a course teaches characters, class by class; prosigns written '<AR>'
 *   HST.course.charsThrough(order, n)  -> every character taught in classes 1..n, in order
 *   HST.course.progress         each task's (or class's) Done date and redo count (see CLASS PROGRESS)
 *   HST.course.fileUrl(code)    a CW Academy audio file's address, from its curriculum name ('QSO101-10')
 *   HST.course.fileSpeeds(base) the speeds that file comes at ('QSO101' -> [10, 13, 15, 18, 20, 25, 30, 35])
 *   HST.course.link(key)        a link used in the task text ('groups' -> LCWO Code Groups; see LINKS)
 *
 * Kept on this device only (localStorage). Loaded after hst-engine.js.
 *
 * CW Academy content is from CWops' public pages (cwops.org/cw-academy,
 * the CW Academy options and student resources pages, and each level's
 * curriculum), summarized in our own words; the curriculum itself is
 * linked, not copied. LICW content is still to come.
 */
(function () {
  'use strict';

  var HST = window.HST;
  var KEY = 'hct-cw-course-v1';

  var PROGRAMS = {
    cwa: { name: 'CW Academy', levels: [
      { key: 'beginner', name: 'Beginner' }, { key: 'fundamental', name: 'Fundamental' },
      { key: 'intermediate', name: 'Intermediate' }, { key: 'advanced', name: 'Advanced' }] },
    licw: { name: 'LICW', levels: [
      { key: 'beginners', name: 'Beginners' }, { key: 'intermediate', name: 'Intermediate' }, { key: 'advanced', name: 'Advanced' }] }
  };

  function clean(o) {
    o = o || {};
    var program = PROGRAMS[o.program] ? o.program : '';
    var levels = program ? PROGRAMS[program].levels.map(function (l) { return l.key; }) : [];
    var level = levels.indexOf(o.level) >= 0 ? o.level : (levels[0] || '');
    var first = /^\d{4}-\d{2}-\d{2}$/.test(o.firstClass || '') ? o.firstClass : '';
    var days = Array.isArray(o.days) ? o.days.map(Number).filter(function (d) { return d >= 0 && d <= 6; }) : [];
    if (!days.length) days = [1, 4];                       // CW Academy classes meet Monday and Thursday
    var times = {};
    Object.keys(o.times || {}).forEach(function (d) {
      if (/^[0-6]$/.test(d) && /^\d{2}:\d{2}$/.test(o.times[d])) times[d] = o.times[d];
    });
    return { program: program, level: level, firstClass: first, days: days.slice(0, 7).sort(), times: times };
  }
  var cur;
  try { cur = clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { cur = clean({}); }
  var listeners = [];
  function copy() { return JSON.parse(JSON.stringify(cur)); }
  function notify() { var c = copy(); listeners.forEach(function (fn) { try { fn(c); } catch (e) { console.error(e); } }); }
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    try { cur = clean(JSON.parse(e.newValue || 'null')); notify(); } catch (err) {}
  });

  /* ---------------------------------------------------------------------
     CW ACADEMY. Every level: 8 weeks, 16 class sessions, twice a week
     (Monday and Thursday), in three semesters a year. Each session row:
     [speed, focus]. Speed is what the curriculum gives for that session
     ('' when it doesn't say).
     --------------------------------------------------------------------- */
  var CWA = {
    semesters: 'Jan\u2013Feb, May\u2013Jun, Sep\u2013Oct',
    meets: 'Classes meet twice a week on Zoom at times set by your Master Advisor. Plan on about an hour of practice every day.',
    resources: 'https://cwops.org/cw-academy/cw-academy-student-resources/',
    register: 'https://cwa.cwops.org/register/',
    levels: {
      beginner: {
        about: 'For people with little or no Morse code who want to learn it and use it on the air.',
        entry: 'Little or no Morse code', goal: '6 WPM or more',
        curriculum: 'https://cwa.cwops.org/wp-content/uploads/Beginner-curriculum-ver-4.8.htm',
        practice: '',
        speedNote: 'Characters are sent at 18–25 WPM with extra space between them (Farnsworth), for an overall speed of 4–6 WPM.',
        // Classes 1-10 below as character lists, for the CW Academy Beginners
        // practice group in ICR and Code Groups (ORDERS.cwaBeginner). Keep the two in step.
        // Each session's homework as one checklist (Tim, 2026-10-30): the
        // Beginner curriculum v4.8 has no practice days. Tasks are written
        // 'id|text' (see LINKS below for the [label](link) form).
        noDays: true,
        every: 'Each session is a checklist: copy practice and sending practice in the Morse Code Trainer (start with the characters and move on once you know them), then the Daily Sending Drill. ICR starts at Session 10, and Sessions 14\u201316 are about listening and sending on the air. Tick each task as you finish it.',
        sessionAnchor: function (n) { return '#_Toc' + [173139164, 173139165, 173139166, 173139167, 173139168, 173139169, 173139170, 173139171, 173139172, 173139173, 173139175, 173139176, 173139177, 173139178, 173139179, 173139180][n - 1]; },
        sessions: [
          ['18/4', 'New characters: A E N T',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 1)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 1)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 1)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 1)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 1)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 1)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 1)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 1)', 'drill|Send the Daily Sending Drill: TTTTT EEEEE AAAAA NNNNN']]],
          ['', 'New: S I O 1 4',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 2)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 2)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 2)', 'cnu|Copy the numbers in the [Morse Code Trainer](mct) (Copying, Session 2)', 'ccs|Copy the call signs in the [Morse Code Trainer](mct) (Copying, Session 2)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 2)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 2)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 2)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 2)', 'snu|Send the numbers in the [Morse Code Trainer](mct) (Sending, Session 2)', 'scs|Send the call signs in the [Morse Code Trainer](mct) (Sending, Session 2)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 2)', 'drill|Send the Daily Sending Drill: every character so far, five times each (AAAAA EEEEE IIIII \u2026)']]],
          ['', 'New: D H L R 2 5',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 3)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 3)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 3)', 'cnu|Copy the numbers in the [Morse Code Trainer](mct) (Copying, Session 3)', 'ccs|Copy the call signs in the [Morse Code Trainer](mct) (Copying, Session 3)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 3)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 3)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 3)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 3)', 'snu|Send the numbers in the [Morse Code Trainer](mct) (Sending, Session 3)', 'scs|Send the call signs in the [Morse Code Trainer](mct) (Sending, Session 3)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 3)', 'drill|Send the Daily Sending Drill: every character so far, five times each (AAAAA DDDDD EEEEE \u2026)']]],
          ['', 'New: C U',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 4)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 4)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 4)', 'cnu|Copy the numbers in the [Morse Code Trainer](mct) (Copying, Session 4)', 'ccs|Copy the call signs in the [Morse Code Trainer](mct) (Copying, Session 4)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 4)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 4)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 4)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 4)', 'snu|Send the numbers in the [Morse Code Trainer](mct) (Sending, Session 4)', 'scs|Send the call signs in the [Morse Code Trainer](mct) (Sending, Session 4)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 4)', 'drill|Send the Daily Sending Drill: every character so far, five times each (AAAAA CCCCC DDDDD \u2026)']]],
          ['', 'New: M W 3 6 ?',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 5)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 5)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 5)', 'cnu|Copy the numbers in the [Morse Code Trainer](mct) (Copying, Session 5)', 'ccs|Copy the call signs in the [Morse Code Trainer](mct) (Copying, Session 5)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 5)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 5)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 5)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 5)', 'snu|Send the numbers in the [Morse Code Trainer](mct) (Sending, Session 5)', 'scs|Send the call signs in the [Morse Code Trainer](mct) (Sending, Session 5)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 5)', 'drill|Send the Daily Sending Drill: every character so far, five times each (AAAAA CCCCC DDDDD \u2026)']]],
          ['', 'New: F Y and the comma',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 6)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 6)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 6)', 'cnu|Copy the numbers in the [Morse Code Trainer](mct) (Copying, Session 6)', 'ccs|Copy the call signs in the [Morse Code Trainer](mct) (Copying, Session 6)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 6)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 6)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 6)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 6)', 'snu|Send the numbers in the [Morse Code Trainer](mct) (Sending, Session 6)', 'scs|Send the call signs in the [Morse Code Trainer](mct) (Sending, Session 6)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 6)', 'drill|Send the Daily Sending Drill: every character so far, five times each (AAAAA CCCCC DDDDD \u2026)']]],
          ['25/6', 'New: G P Q 7 9 /',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 7)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 7)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 7)', 'cnu|Copy the numbers in the [Morse Code Trainer](mct) (Copying, Session 7)', 'ccs|Copy the call signs in the [Morse Code Trainer](mct) (Copying, Session 7)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 7)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 7)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 7)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 7)', 'snu|Send the numbers in the [Morse Code Trainer](mct) (Sending, Session 7)', 'scs|Send the call signs in the [Morse Code Trainer](mct) (Sending, Session 7)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 7)', 'drill|Send the Daily Sending Drill: every character so far, five times each (AAAAA CCCCC DDDDD \u2026)']]],
          ['', 'New: B V and <AR>',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 8)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 8)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 8)', 'cnu|Copy the numbers in the [Morse Code Trainer](mct) (Copying, Session 8)', 'ccs|Copy the call signs in the [Morse Code Trainer](mct) (Copying, Session 8)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 8)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 8)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 8)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 8)', 'snu|Send the numbers in the [Morse Code Trainer](mct) (Sending, Session 8)', 'scs|Send the call signs in the [Morse Code Trainer](mct) (Sending, Session 8)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 8)', 'drill|Send the Daily Sending Drill: every character so far, five times each (AAAAA BBBBB CCCCC \u2026)']]],
          ['', 'New: J K 0 8 and <BT>',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 9)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 9)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 9)', 'cnu|Copy the numbers in the [Morse Code Trainer](mct) (Copying, Session 9)', 'ccs|Copy the call signs in the [Morse Code Trainer](mct) (Copying, Session 9)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 9)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 9)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 9)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 9)', 'snu|Send the numbers in the [Morse Code Trainer](mct) (Sending, Session 9)', 'scs|Send the call signs in the [Morse Code Trainer](mct) (Sending, Session 9)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 9)', 'drill|Send the Daily Sending Drill: every character so far, five times each (AAAAA BBBBB CCCCC \u2026)']]],
          ['', 'New: X Z . <BK> <SK> — every character is in',
           [['#', 'cch|Copy the characters in the [Morse Code Trainer](mct) (Copying, Session 10)', 'cwd|Copy the words in the [Morse Code Trainer](mct) (Copying, Session 10)', 'cab|Copy the CW abbreviations in the [Morse Code Trainer](mct) (Copying, Session 10)', 'cnu|Copy the numbers in the [Morse Code Trainer](mct) (Copying, Session 10)', 'ccs|Copy the call signs in the [Morse Code Trainer](mct) (Copying, Session 10)', 'cph|Copy the phrases in the [Morse Code Trainer](mct) (Copying, Session 10)', 'sch|Send the characters in the [Morse Code Trainer](mct) (Sending, Session 10)', 'swd|Send the words in the [Morse Code Trainer](mct) (Sending, Session 10)', 'sab|Send the CW abbreviations in the [Morse Code Trainer](mct) (Sending, Session 10)', 'snu|Send the numbers in the [Morse Code Trainer](mct) (Sending, Session 10)', 'scs|Send the call signs in the [Morse Code Trainer](mct) (Sending, Session 10)', 'sph|Send the phrases in the [Morse Code Trainer](mct) (Sending, Session 10)', 'drill|Send the Daily Sending Drill: every character so far, five times each (AAAAA BBBBB CCCCC \u2026)', 'icr|Start ICR: [MorseCode.World ICR](mctchar), CW Academy tab, sessions 1\u201310, single characters (or the [ICR](tool:icr) tab here)']]],
          ['25/6', 'Your first QSO scripts; single-character ICR',
           [['#', 'pers|Fill in the Personalization section of the [Morse Code Trainer](mct) (your call, name, QTH and more)', 'copy|Copy the QSO scripts in the [Morse Code Trainer](mct) (Copying, Session 11)', 'send|Send your side of the QSO scripts in the [Morse Code Trainer](mct) (Sending, Session 11)', 'icr|ICR, single characters from sessions 1\u201310: [MorseCode.World ICR](mctchar) (or the [ICR](tool:icr) tab here)']]],
          ['25/6', 'QSO scripts with weather, rig and antenna; ICR',
           [['#', 'copy|Copy the QSO scripts in the [Morse Code Trainer](mct) (Copying, Session 12)', 'send|Send your side of the QSO scripts in the [Morse Code Trainer](mct) (Sending, Session 12)', 'icr|ICR, single characters from sessions 1\u201310: [MorseCode.World ICR](mctchar) (or the [ICR](tool:icr) tab here)']]],
          ['25/6', 'QSO scripts: signing off; ICR',
           [['#', 'copy|Copy the QSO scripts in the [Morse Code Trainer](mct) (Copying, Session 13)', 'send|Send your side of the QSO scripts in the [Morse Code Trainer](mct) (Sending, Session 13)', 'icr|ICR, single characters from sessions 1\u201310: [MorseCode.World ICR](mctchar) (or the [ICR](tool:icr) tab here)']]],
          ['', 'Listen to slower CW on the air; send your call, QTH and name',
           [['#', 'cq|Listen on the HF CW bands: copy the call signs of slower stations calling CQ', 'qso|Listen to slower stations in a QSO and copy what you can', 'send|Practice sending your call sign, QTH and name, over and over']]],
          ['', 'Listen on the air and pick out your own call sign',
           [['#', 'cq|Listen on the HF CW bands: copy the call signs of slower stations calling CQ', 'qso|Listen to slower stations in a QSO and copy what you can', 'call|Practice hearing your call sign in many different ways']]],
          ['', 'Whole exchanges, start to finish, ready for your first contacts',
           [['#', 'cq|Listen on the HF CW bands: copy the call signs of slower stations calling CQ', 'qso|Listen to slower stations in a QSO and copy what you can', 'send|Practice sending first, second and closing exchanges', 'sst|Optional: make a first contact in the [K1USN Slow Speed Test](sst) (Friday afternoons and Sunday evenings)']]]
        ]
      },
      fundamental: {
        about: 'Builds head copy and sending, conversational QSOs, and a first taste of contesting.',
        entry: '6 WPM or more', goal: '10 WPM or more',
        curriculum: 'https://cwops.org/wp-content/uploads/2025/04/CW-Academy-Fundamental-Curriculum-v2.0.htm',
        practice: 'https://cwops.org/fundamental-practice-files/',
        speedNote: 'Speeds are overall (Farnsworth) speeds, with characters at 25 WPM.',
        // From the Fundamental curriculum v2.0, session by session (Tim,
        // 2026-10-30): three practice days of alternating Send and Copy steps,
        // summarized in our own words. Tasks are 'id|text', the id being the
        // curriculum's step (s1 = Send 1, c2 = Copy 2); a day may start with
        // '#Label' (Session 15 is one set for days 1-3). The curriculum has
        // the full settings and the texts to send.
        every: 'Practice on three days before each session. Each day alternates sending and copying: start with the Daily Morse Code Scales Warm Up (tap it to open it in Keyer Practice), then LCWO, the Morse Code Trainer or an audio file as listed. The curriculum has the full settings and the texts to send. Tick each task as you finish it.',
        sessionAnchor: function (n) { return '#_Toc' + [173138629, 173138632, 173138635, 173138638, 173138641, 173138644, 173138647, 173138650, 173138653, 173138657, 173138660, 173138663, 173138666, 173138669, 173138672, 173138673][n - 1]; },
        sessions: [
          ['6', 'The warm-up routine, code groups, and your list of problem characters; send your name and call',
           [['s1|Send the [Warm Up](scale:warmup) at 6 WPM: its repeated-letter groups, starting a group over after a mistake', 'c1|Sign up at [LCWO](lcwo) and set it up as the curriculum describes (characters 25 WPM, effective 6 WPM, groups of 2); do a 1-minute [Code Groups](groups) run of letters and note the characters you miss', 's2|Send your first name five times, slowly and deliberately', 'c2|Two more 1-minute Code Groups runs', 's3|Send your call sign five times', 'c3|A fourth 1-minute run; combine your lists of missed characters and practice them'], ['s1|Send the [Warm Up](scale:warmup) at 6 WPM: the alphabet and numbers in groups of five or six', 'c1|Two 1-minute [Code Groups](groups) runs; keep refining your list of missed characters', 's2|Send each character on your list, saying it aloud as you send it; go through the list twice', 'c2|Set LCWO to custom characters with your most-missed letters; three 1-minute runs', 's3|Send your name five times, minding spacing and character formation', 'c3|Two more 1-minute runs on the characters you still miss'], ['s1|Send the [Warm Up](scale:warmup) at 6 WPM: the pangram line', 'c1|Two 1-minute [Code Groups](groups) runs with only the characters you still miss', 's2|Send \u201c(your name) DE (your call)\u201d five times', 'c2|Back to Day 1\u2019s LCWO settings: three 1-minute runs; refine your list', 's3|Record yourself sending \u201c(name) DE (call)\u201d five times; play it back and check your characters and spacing']]],
          ['6', 'Problem characters, word lists, the whole alphabet and numbers',
           [['s1|Send the [Warm Up](scale:warmup) at 6 WPM: the repeated-letter groups', 'c1|Two 1-minute [Code Groups](groups) runs on your difficult letters plus 3\u20135 common ones', 's2|Send your difficult letters at 6 WPM, saying each one aloud', 'c2|LCWO back to all letters: three 1-minute runs; start a new list of misses', 's3|Send your call sign five times in a row without a mistake (stop after four tries)', 'c3|[Morse Code Trainer](p21c3) word list: say each two-letter word before the computer does'], ['s1|Send the [Warm Up](scale:warmup) at 6 WPM: the alphabet and numbers', 'c1|Three 1-minute [Code Groups](groups) runs of letters; start a new list', 's2|[Morse Code Trainer](p22s2), Words: listen to each word, then send it back with your key', 'c2|Two more 1-minute runs; compare your list with the last one', 's3|Send your name and QTH five times, each twice (JOHN JOHN QTH IS \u2026)'], ['s1|From the [Warm Up](scale:warmup), send AAA BBB CCC \u2026 to ZZZ, noting the letters you stumble on', 'c1|Three 1-minute [Code Groups](groups) runs of letters; combine with yesterday\u2019s list', 's2|Send your call sign five times in a row without a mistake', 'c2|Three more 1-minute runs; combine with Copy 1\u2019s list', 's3|Send your name five times in a row without a mistake', 'c3|Several 1-minute custom-character runs on the letters you\u2019ve missed more than once in the past two days']]],
          ['7', 'Three-letter groups; QSO 101 — who called, who answered',
           [['s1|Send the [Warm Up](scale:warmup) at 7 WPM: the repeated-letter groups', 'c1|Two 1-minute [Code Groups](groups) runs on your difficult letters plus 3\u20135 common ones', 's2|Send your difficult letters, saying each one aloud', 'c2|LCWO back to all letters: three 1-minute runs; start a new list of misses', 's3|Send your name five times in a row without a mistake', 'c3|Listen to [QSO 101 at 7 WPM](qso101_7) and note each station\u2019s call, name, RST and QTH'], ['s1|Send the [Warm Up](scale:warmup) at 7 WPM: the alphabet and numbers', 'c1|Three 1-minute custom-character [Code Groups](groups) runs: yesterday\u2019s missed letters plus three more', 's2|The [Warm Up](scale:warmup) again, with good 7 WPM spacing', 'c2|Three 1-minute custom runs on four of your difficult letters', 's3|Send your call sign five times in a row without a mistake', 'c3|Three 1-minute custom runs on four other difficult letters'], ['s1|Send the [Warm Up](scale:warmup) at 7 WPM: the alphabet and numbers', 'c1|Three 1-minute custom [Code Groups](groups) runs on four difficult letters', 's2|The [Warm Up](scale:warmup), then the first two lines of the [Drill](scale:drill)', 'c2|Any other difficult letters the same way, or three 1-minute runs of all letters', 's3|[Morse Code Trainer](p33s3), Words: send back each word you hear', 'c3|Two more 1-minute runs of letters; update your list']]],
          ['7', 'Pangrams and code groups; QSO 102',
           [['s1|Send the [Warm Up](scale:warmup) at 7 WPM: a pangram, twice', 'c1|A 2-minute [Code Groups](groups) run of 3-letter groups; revise your list', 's2|Send a second pangram twice, starting a word over after a mistake', 'c2|Another 2-minute run; keep a second column of missed characters', 's3|Send your call sign five times in a row correctly', 'c3|Two more 2-minute runs; add to your list'], ['s1|Send the [Warm Up](scale:warmup) at 7 WPM: the alphabet and numbers, twice', 'c1|Custom-character [Code Groups](groups): your Day 1 letters plus five more; two 2-minute runs', 's2|The [Warm Up](scale:warmup), then BENS BEST BENT WIRE six times', 'c2|Two more 2-minute runs; mark which letters are still a problem', 's3|Send your call sign five times in a row correctly', 'c3|One more 2-minute run; update your list'], ['s1|Send a pangram twice at 7 WPM', 'c1|A 2-minute custom [Code Groups](groups) run of your difficult letters in groups of 3', 's2|Send another pangram twice', 'c2|Another 2-minute custom run; update your list', 's3|Send your call sign five times in a row correctly', 'c3|Listen to [QSO 102 at 7 WPM](qso102_7) and note each station\u2019s details']]],
          ['7', 'Name and RST, name and QTH exchanges; record and critique your sending',
           [['s1|Send the [Warm Up](scale:warmup) at 7 WPM', 'c1|A 3-minute [Code Groups](groups) run of letters in groups of 3; start a new list', 's2|Send \u201cNAME IS (your name) UR RST 5NN <BK>\u201d until you get it right three times in a row', 'c2|Another 3-minute run; revise your list', 's3|Send \u201cNAME IS (your name) ES QTH IS (your QTH)\u201d until you get it right three times in a row', 'c3|A 3-minute run of figures only; note the ones you miss'], ['s1|Send the [Warm Up](scale:warmup) at 7 WPM', 'c1|Two sentences of LCWO [Plain Text Training](plain); drop to 6 WPM if it\u2019s hard', 's2|Make a QSO \u201chelp sheet\u201d (name, RST, QTH, rig, antenna, ham since) and send it twice', 'c2|Two more Plain Text sentences; aim for 80%', 's3|Send two pangrams from the [Fundamental practice files](fpf) page; record yourself and critique', 'c3|Two 1-minute [Code Groups](groups) runs of figures'], ['s1|Send the [Warm Up](scale:warmup) at 7 WPM: a pangram line', 'c1|A 2-minute custom [Code Groups](groups) run of your difficult letters; list the misses', 's2|Send the \u201cquick brown fox\u201d pangram line twice', 'c2|Another 2-minute custom run; update your list', 's3|[Morse Code Trainer](p53s3), Words: send back each word you hear', 'c3|Repeat Copy 2']]],
          ['8', 'Repeated-letter drills; abbreviations and Q-codes',
           [['s1|Send the [Warm Up](scale:warmup) at 8 WPM: the first two lines', 'c1|A 2-minute [Code Groups](groups) run of letters in groups of 4 (extra word spacing 2); start a new list', 's2|The first two lines of the [Warm Up](scale:warmup) again', 'c2|Two more 2-minute runs; update your list', 's3|Send a pangram five times with good 8 WPM pacing', 's4|Send your name and QTH five times (NAME IS \u2026 <BT> QTH HR \u2026)', 'c3|Two 2-minute custom runs: your missed characters plus five more letters and figures'], ['s1|Send the [Warm Up](scale:warmup) at 8 WPM: the first two lines', 'c1|A 2-minute [Code Groups](groups) run of figures; list the ones you miss', 's2|The [Warm Up](scale:warmup), then the alphabet with each letter three times', 'c2|Two more 2-minute figures runs', 's3|Send the short paragraph in the curriculum with good 8 WPM pacing', 'c3|A 2-minute custom run of your difficult figures plus two more'], ['s1|Send the [Warm Up](scale:warmup) at 6 WPM: the first two lines', 'c1|A 2-minute custom [Code Groups](groups) run of your difficult characters, groups of 4', 's2|The [Warm Up](scale:warmup), then the alphabet with each letter three times', 'c2|Two 2-minute custom runs: earlier misses plus five more letters and figures', 's3|Send your name and QTH five times at 6 WPM', 'c3|LCWO [Word Training](words), CW abbreviations at 8 WPM: run the Q codes', 's4|Send a pangram three times, then BENS BEST BENT WIRE three times']]],
          ['8', 'Send one side of a QSO; start call sign training',
           [['s1|Send the [Warm Up](scale:warmup) at 8 WPM: the whole thing', 'c1|Four 1-minute [Code Groups](groups) runs of letters, groups of 4', 's2|The [Warm Up](scale:warmup): the last two lines, prosigns included', 'c2|Four 1-minute runs of figures', 's3|Send your side of a QSO (signal report, name, QTH, rig, power, 73), with clear spaces between words', 'c3|LCWO [Call Sign Training](calls) from 8 WPM (max 10), long calls filtered out'], ['s1|Send the [Warm Up](scale:warmup) at 8 WPM: the whole thing', 'c1|Two LCWO [Word Training](words) runs of CW abbreviations', 's2|The [Warm Up](scale:warmup), then each letter and number three times', 'c2|Two more Word Training runs of abbreviations', 's3|Send a few sentences from a magazine or newspaper; record, play back and note what to improve', 'c3|Word Training of abbreviations with fixed speed off; note the speed you end at'], ['s1|Send the [Warm Up](scale:warmup) at 8 WPM', 'c1|Four 1-minute [Code Groups](groups) runs of letters, groups of 4', 's2|The [Warm Up](scale:warmup) again', 'c2|Repeat Copy 1', 's3|[Morse Code Trainer](p73s3), Words: send each word back, twice', 'c3|LCWO [Call Sign Training](calls) at 8 WPM']]],
          ['8', 'Send from memory; two-letter words; call signs',
           [['s1|Send the [Warm Up](scale:warmup) at 8 WPM', 'c1|Four 1-minute [Code Groups](groups) runs of letters, groups of 4', 's2|Head to key: send a favorite song, poem or rhyme from memory, eyes closed, no corrections', 'c2|Three more 1-minute runs, as in Copy 1', 's3|Send 2 again, this time correcting mistakes', 'c3|A 3-minute Code Groups run of letters, groups of 4, at 8 WPM or more', 's4|Send 2 again with corrections; record it, play it back and check your pacing', 'c4|LCWO [Call Sign Training](calls) from 8 WPM (max 10\u201312), long and slashed calls filtered'], ['s1|Send the [Warm Up](scale:warmup) at 8 WPM', 'c1|Four 1-minute [Code Groups](groups) runs of letters', 's2|Send the names of at least 15 things around you, without writing them first', 'c2|LCWO [Word Training](words), English words up to 3 letters, fixed 8 WPM', 's3|Send the common two-letter words in the curriculum: once straight through, then again with corrections', 'c3|Word Training as in Copy 2, with fixed speed off'], ['s1|Send the [Warm Up](scale:warmup) at 8 WPM', 'c1|Three 1-minute [Code Groups](groups) runs of figures, groups of 4', 's2|Send your call sign and name ten times in a row, correcting mistakes', 'c2|A 2-minute run of figures', 's3|Send the two-letter words: once straight through, then again with corrections', 'c3|A 2-minute run of figures, groups of 5, at 8 WPM or more']]],
          ['9', 'Phrases and pangrams; correcting your sending mistakes',
           [['s1|Send the [Warm Up](scale:warmup) at 9 WPM', 'c1|1-minute [Code Groups](groups) runs of letters, groups of 5, until you score 80% (up to five)', 's2|[Morse Code Trainer](p91s2), Phrases: send back each of the six phrases'], ['s1|Send the [Warm Up](scale:warmup) at 9 WPM', 'c1|Four 1-minute [Code Groups](groups) runs of letters', 's2|Send the names of at least 15 things around you at 9 WPM or more', 'c2|LCWO [Plain Text Training](plain), English proverbs: five sentences', 's3|Send the three pangrams in the curriculum; record, play back and critique', 'c3|LCWO [Word Training](words), English up to 3 letters, fixed speed off; note your score and top speed'], ['s1|Send the [Warm Up](scale:warmup) at 9 WPM', 'c1|Three 1-minute [Code Groups](groups) runs of mixed characters', 's2|Send the two-letter words: once straight through, then again with corrections', 'c2|[Morse Code Trainer](p93c2) words: say each 1\u20133 letter word before it\u2019s shown']]],
          ['9', 'QSO phrases; more call sign training',
           [['s1|Send the [Warm Up](scale:warmup) at 9 WPM', 'c1|1-minute [Code Groups](groups) runs of letters until you score 80% (up to five)', 's2|The [Morse Code Trainer](p101s2) exercise set up in the curriculum (enter your call and details; stopwatch off)', 'c2|If you reached 80%, a session of LCWO [Call Sign Training](calls); if not, repeat Copy 1', 's3|Send 2 again'], ['s1|Send the [Warm Up](scale:warmup) at 9 WPM', 'c1|Four 1-minute [Code Groups](groups) runs of figures', 's2|Have an imaginary QSO, sending both sides', 'c2|LCWO [Plain Text Training](plain), proverbs: five sentences', 's3|Send the three pangrams in the curriculum; record, play back and critique', 'c3|LCWO [Word Training](words), English up to 4 letters, fixed 9 WPM; note your score'], ['s1|Send the [Warm Up](scale:warmup) at 9 WPM', 'c1|Three 1-minute [Code Groups](groups) runs of letters', 's2|Send the two-letter words; then again, recorded, and critique', 'c2|[Morse Code Trainer](p103c2) words: say each word before it\u2019s shown']]],
          ['9', 'Short jokes, country codes and news headlines; Short Story 111',
           [['s1|Send the [Warm Up](scale:warmup) at 9 WPM', 'c1|1-minute [Code Groups](groups) runs of letters until you score 80% (up to five)', 's2|Send the three jokes in the curriculum', 'c2|If you reached 80%, LCWO [Call Sign Training](calls); if not, repeat Copy 1', 's3|Send the three more jokes in the curriculum', 'c3|Listen to [Short Story 111 at 9 WPM](ss111) for about half an hour, taking notes'], ['s1|Send the [Warm Up](scale:warmup) at 9 WPM', 'c1|Four 1-minute [Code Groups](groups) runs of figures', 's2|Send the EU country codes in the curriculum, twice, naming each country', 'c3|[Morse Code News](news) at 25/9 WPM: copy a couple of headlines', 's3|Send the common words in the curriculum twice, starting a word over after a mistake'], ['s1|Send the [Warm Up](scale:warmup) at 9 WPM', 'c1|Three 1-minute [Code Groups](groups) runs of letters', 's2|Send the common words, with clear spaces between them; then again, recorded, and critique', 'c2|[Morse Code News](news) at 25/9 WPM: copy a couple of headlines', 's3|Send headlines from the BBC or CNN news site', 'c3|Listen to [QSO 101 at 9 WPM](qso101_9) twice and note each station\u2019s details']]],
          ['10', 'QSO phrases and jokes; a POTA QSO',
           [['s1|Send the [Warm Up](scale:warmup) at 10 WPM', 'c1|1-minute [Code Groups](groups) runs of letters until you score 80% (up to five)', 's2|Send the three jokes in the curriculum', 'c2|If you reached 80%, LCWO [Call Sign Training](calls); if not, repeat Copy 1', 's3|Send the three more jokes in the curriculum', 'c3|Listen to [Short Story 112](ss112) twice (about half an hour), taking notes'], ['s1|Send the [Warm Up](scale:warmup) at 10 WPM', 'c1|Four 1-minute [Code Groups](groups) runs of figures', 's2|Send the QSO phrases in the curriculum precisely, three times', 'c2|[Morse Code News](news) at 25/10 WPM: copy a couple of headlines', 's3|Send the phrases again, recorded; critique and send them once more'], ['s1|Send the [Warm Up](scale:warmup) at 10 WPM', 'c1|Three 1-minute [Code Groups](groups) runs of mixed characters', 's2|Send the common words; then again, recorded, and critique', 'c2|[Morse Code News](news) at 25/10 WPM: copy a couple of headlines', 's3|Send headlines from the BBC or CNN news site', 'c3|Listen to [POTA 203 at 10 WPM](pota203_10) twice and note each station\u2019s details']]],
          ['10', 'A full practice QSO',
           [['s1|Send the [Warm Up](scale:warmup) at 10 WPM', 'c1|1-minute [Code Groups](groups) runs of letters until you score 80% (up to five)', 's2|Read the practice QSO with K6RB in the curriculum, then send it', 'c2|If you reached 80%, LCWO [Call Sign Training](calls); if not, repeat Copy 1', 's3|Send the QSO again, recorded; critique and send it once more', 'c3|Listen to [Short Phrases PR205 at 10 WPM](pr205_10) (almost 10 minutes) and write down what you can'], ['s1|Send the [Warm Up](scale:warmup) at 10 WPM', 'c1|Two 1-minute [Code Groups](groups) runs of figures (extra word spacing 3)', 's2|Send your call sign and name five times in a row without a mistake', 'c2|[Morse Code News](news) at 25/10 WPM: copy a couple of headlines', 's3|Send 2 again, recorded; play it back and critique'], ['s1|Send the [Warm Up](scale:warmup) at 10 WPM', 'c1|Two 1-minute [Code Groups](groups) runs of letters (extra word spacing 3)', 's2|Send your call sign, name and QTH five times in a row without an error', 'c3|Listen to [QSO 104 at 10 WPM](qso104_10) twice and note each station\u2019s details', 's3|Send 2 again, recorded; critique and send it once more']]],
          ['10', 'A second practice QSO; Short Story 114',
           [['s1|Send the [Warm Up](scale:warmup) at 10 WPM', 'c1|1-minute [Code Groups](groups) runs of letters until you score 80% (up to five)', 's2|Read the practice QSO with AC4BT in the curriculum, then send it', 'c2|If you reached 80%, LCWO [Call Sign Training](calls); if not, repeat Copy 1', 's3|Send the QSO again, recorded; critique and send it once more', 'c3|Listen to [Short Story 114 at 10 WPM](ss114) (up to 20 minutes), taking notes'], ['s1|Send the [Warm Up](scale:warmup) at 10 WPM', 'c1|Two 1-minute [Code Groups](groups) runs of figures', 's2|Send your call sign and name five times in a row without a mistake', 'c2|[Morse Code News](news) at 25/10 WPM: copy a couple of headlines', 's3|Send 2 again, recorded; play it back and critique'], ['s1|Send the [Warm Up](scale:warmup) at 10 WPM', 'c1|Two 1-minute [Code Groups](groups) runs of mixed characters', 's2|Send your call sign, name and QTH five times in a row without an error', 'c3|Listen to [POTA 203 at 12 WPM](pota203_12) twice and note each station\u2019s details', 's3|Send 2 again, recorded; critique and send it once more']]],
          ['11', 'Letter groups at 80% copy; make three QSOs on the air',
           [['#Days 1\u20133', 's1|Send the [Warm Up](scale:warmup) at 11 WPM', 'c1|1-minute [Code Groups](groups) runs of letters at 11 WPM or more, until you score 80% (up to five)', 'air|Get on the air: make at least three QSOs before the next class']]],
          ['', 'Wrap-up: keep practicing every day and get on the air',
           [['#Wrap-up', 'daily|Keep up your daily practice habit', 'air|Get on the air; set goals and track your progress']]]
        ]
      },
      intermediate: {
        about: 'For contests, DX and ragchews: more time on the air and copying whole words.',
        entry: '10 WPM or more', goal: '20 WPM or more',
        curriculum: 'https://cwa.cwops.org/wp-content/uploads/Practice-Instructions-Intermediate-ver.2.3.htm',
        practice: 'https://cwops.org/intermediate-practice-files/',
        speedNote: '',
        // From the Intermediate curriculum v2.3 (July 2026), session by session
        // (Tim, 2026-10-30). Each session row: [speed, summary, [day 1, day 2,
        // day 3]]. The curriculum gives three practice days before each
        // session, and each day is a list of tasks in the curriculum's order
        // (Tim, 2026-10-30, second pass), written as tokens:
        //   warmup, drill, exercise   send that Daily Morse Code Scale
        //   WD101-10*2                copy that CWops audio file 2 times (the
        //                             curriculum's name; *1-2 once or twice,
        //                             *n several times; no * when the
        //                             curriculum gives no count)
        //   icr:10                    LCWO (or MorseCode.World) ICR at 10 WPM
        //   mr:10                     Morse Runner single calls, 10 WPM, 15 minutes
        //   wpx:18:1                  Morse Runner WPX contest, 18 WPM, activity 1
        //   cwt:copy5, cwt:work5      a live CWT: copy, or work, 5 stations
        every: 'Practice on three days before each session. Each day is a list of tasks: send a Daily Morse Code Scale (tap it to open it in Keyer Practice), copy the audio files (tap one to play it, or pick another speed), then finish on LCWO or Morse Runner. Tick each task as you finish it.',
        // Each session's place in the curriculum (its table of contents
        // links): session n is #_Toc(172984023 + n).
        sessionAnchor: function (n) { return '#_Toc' + (172984023 + n); },
        sessions: [
          ['10', 'Words and phrases 101; sounds -ING -ES IR- RE-; QSO 101, POTA 102; Morse Runner single calls',
           ['warmup WD101-10*2 PR101-10*3 icr:10', 'warmup drill ING4-10*2 ES4-10*2 IR4-10*2 RE4-10*2 mr:10', 'warmup QSO101-10*2 POTA102-10*3 icr:10']],
          ['10', 'Words and phrases 102; sounds -ED -LY IM- UN-; QSO 103, POTA 104',
           ['warmup WD102-10*2 PR102-10*3 mr:10', 'warmup drill ED4-10*2 LY4-10*2 IM4-10*2 UN4-10*2 icr:10', 'warmup exercise QSO103-10*2 POTA104-10*3 mr:10']],
          ['13', 'Words and phrases 103; sounds -ING -ES IN-; QSO 105, POTA 106',
           ['warmup WD103-13*2 PR103-13*3 icr:13', 'warmup drill ING5-13*2 ES5-13*2 IN4-13*2 mr:13', 'warmup exercise QSO105-13*2 POTA106-13*3 icr:13']],
          ['13', 'Words and phrases 202; sounds -ED -LY IR-; QSO 107, POTA 108',
           ['warmup WD202-13*2 PR202-13*3 mr:13', 'warmup drill ED5-13*2 LY5-13*2 IR5-13*2 icr:13', 'warmup exercise QSO107-13*2 POTA108-13*3 mr:13']],
          ['13', 'Words and phrases 203; sounds -ING DIS- IM-; QSO 201, POTA 110',
           ['warmup WD203-13*2 PR203-13*3 icr:13', 'warmup drill ING6-13*2 DIS4-13*2 IM5-13*2 mr:13', 'warmup exercise QSO201-13*2 POTA110-13*3 icr:13']],
          ['13', 'Words and phrases 205; sounds -ES RE- IN-; QSO 203, POTA 202',
           ['warmup WD205-13*2 PR205-13*3 mr:13', 'warmup drill ES6-13*2 RE5-13*2 IN5-13*2 icr:13', 'warmup exercise QSO203-13*2 POTA202-13*3 mr:13']],
          ['15', 'Words and phrases 301; sounds -ED -LY IR-; QSO 205, POTA 204',
           ['warmup WD301-15*2 PR301-15*3 icr:15', 'warmup drill ED6-15*2 LY6-15*2 IR6-15*2 mr:15', 'warmup exercise QSO205-15*2 POTA204-15*3 icr:15']],
          ['15', 'Words and phrases 302; sounds -ING DIS- IM-; QSO 207, POTA 206',
           ['warmup WD302-15*2 PR302-15*3 mr:15', 'warmup drill ING7-15*2 DIS5-15*2 IM6-15*2 icr:15', 'warmup exercise QSO207-15*2 POTA206-15*3 mr:15']],
          ['15', 'Words and phrases 303; sounds -ES UN- IN-; QSO 301, POTA 208',
           ['warmup WD303-15*2 PR303-15*3 icr:15', 'warmup drill ES7-15*2 UN5-15*2 IN6-15*2 mr:15', 'warmup exercise QSO301-15*2 POTA208-15*3 icr:15']],
          ['15', 'Words and phrases 304; sounds -ED RE- IR-; QSO 303, POTA 210',
           ['warmup WD304-15*2 PR304-15*3 mr:15', 'warmup drill ED7-15*2 RE6-15*2 IR7-15*2 icr:15', 'warmup exercise QSO303-15*2 POTA210-15*3 mr:15']],
          ['18', 'Words and phrases 305; sounds -LY DIS- IM-; QSO 305, POTA 301; first short story for head copy (SS 101)',
           ['warmup WD305-18*2 PR305-18*3 icr:18', 'warmup drill LY7-18*2 DIS6-18*2 IM7-18*2 icr:18 SS101-18*1-2', 'warmup exercise QSO305-18*2 POTA301-18*3 mr:15']],
          ['18', 'Words and phrases 401; sounds -ING UN- IN-; QSO 307, POTA 302; short story SS 103; Morse Runner in WPX contest mode',
           ['warmup WD401-18*2 PR401-18*3 mr:18', 'warmup drill ING8-18*2 UN6-18*2 IN7-18*2 SS103-18*1', 'warmup exercise QSO307-18*2 POTA302-18*3 wpx:18:1']],
          ['18', 'Words and phrases 402; sounds -ES RE- IR-; QSO 401, POTA 304; first CWT practice file (CWT 201)',
           ['warmup WD402-18*2 PR402-18*3 icr:18', 'warmup drill ES8-18*2 RE7-18*2 IR8-18*2 CWT201-20*n mr:18', 'warmup exercise QSO401-18*2 POTA304-18*3 icr:15']],
          ['20', 'Words and phrases 403; sounds -ES DIS- IM-; QSO 403, POTA 306; CWT 202; copy five stations in a live CWT',
           ['warmup WD403-20*2 PR403-20*3 CWT202-20*n', 'warmup drill ES8-20*2 DIS7-20*2 IM8-20*2 cwt:copy5', 'warmup exercise QSO403-20*2 POTA306-20*3 mr:20']],
          ['20', 'Words and phrases 404; sounds -LY UN- IN-; QSO 405, POTA 308; CWT 208; Morse Runner in WPX contest mode',
           ['warmup WD404-20*2 PR404-20*3 CWT208-20*n', 'warmup drill LY8-20*2 UN7-20*2 IN8-20*2 wpx:20:2', 'warmup exercise QSO405-20*2 POTA308-20*3 icr:20']],
          ['25', 'A taste of 25 WPM: words and phrases 405; sounds UN- DIS- RE-; QSO 407, POTA 310; CWT 212; work five stations in a live CWT',
           ['warmup WD405-25*2 PR405-25*3 mr:25 CWT212-25*n', 'warmup drill UN8-25*2 DIS8-25*2 RE8-25*2 cwt:work5', 'warmup exercise QSO407-25*2 POTA310-25*3 mr:25']]
        ]
      },
      advanced: {
        about: 'For high-speed operating: copying phrases, copying behind, and contesting.',
        entry: '20 WPM or more', goal: '30 WPM or more',
        curriculum: 'https://cwops.org/wp-content/uploads/2025/05/CW-Academy-Advanced-Curriculum-v2.1.htm',
        practice: 'https://cwops.org/advanced-practice-files/',
        speedNote: '',
        // From the Advanced curriculum v2.1 (May 2025), session by session
        // (Tim, 2026-10-30), in the same task tokens as Intermediate (see
        // there). Advanced lists no LCWO or Morse Runner work for the days;
        // its Morse Runner, RufzXP and CWT are optional extras the advisor
        // sets. Files with no count in the curriculum have none here.
        every: 'Practice on three days before each session. Each day is a list of tasks: send a Daily Morse Code Scale (tap it to open it in Keyer Practice), then head copy the audio files (tap one to play it, or pick another speed). Don\u2019t write anything down, except notes on the QSO and POTA files. Tick each task as you finish it. Morse Runner, RufzXP and the weekly CWT are optional extras your advisor may give you.',
        // Each session's place in the curriculum: session n is #_Toc(197333290 + n).
        sessionAnchor: function (n) { return '#_Toc' + (197333290 + n); },
        sessions: [
          ['20', 'Words and phrases 101; sounds -ING -ED -ES -LY; QSO 101, POTA 101',
           ['warmup PR101-20*2 WD101-20*2', 'warmup QSO101-20 ING4-20 ED4-20', 'warmup exercise POTA101-20 ES4-20 LY4-20']],
          ['20', 'Words and phrases 102; sounds -ING -ED -ES -LY; QSO 102, POTA 102',
           ['warmup PR102-20*2 WD102-20*2', 'warmup QSO102-20 ING5-20 ED5-20', 'warmup exercise POTA102-20 ES5-20 LY5-20']],
          ['20', 'Words and phrases 103; sounds -ING -ED -ES -LY; QSO 103, POTA 103',
           ['warmup PR103-20*2 WD103-20*2', 'warmup QSO103-20 ING6-20 ED6-20', 'warmup exercise POTA103-20 ES6-20 LY6-20']],
          ['20', 'Words and phrases 104; sounds -ING -ED -ES -LY; QSO 104, POTA 104',
           ['warmup PR104-20*2 WD104-20*2', 'warmup QSO104-20 ING7-20 ED7-20', 'warmup exercise POTA104-20 ES7-20 LY7-20']],
          ['20', 'Words and phrases 105; sounds -ING -ED -ES -LY; QSO 105, POTA 105',
           ['warmup PR105-20*2 WD105-20*2', 'warmup QSO105-20 ING8-20 ED8-20', 'warmup exercise POTA105-20 ES8-20 LY8-20']],
          ['20', 'Words and phrases 201; sounds IN- RE- IM- DIS-; QSO 106, POTA 106',
           ['warmup PR201-20*2 WD201-20*2', 'warmup QSO106-20 IN4-20 RE4-20', 'warmup exercise POTA106-20 IM4-20 DIS4-20']],
          ['20', 'Words and phrases 202; sounds IN- RE- IM- DIS-; QSO 107, POTA 107',
           ['warmup PR202-20*2 WD202-20*2', 'warmup QSO107-20 IN5-20 RE5-20', 'warmup exercise POTA107-20 IM5-20 DIS5-20']],
          ['20', 'Words and phrases 203; sounds IN- RE- IM- DIS-; QSO 108, POTA 108',
           ['warmup PR203-20*2 WD203-20*2', 'warmup QSO108-20 IN6-20 RE6-20', 'warmup exercise POTA108-20 IM6-20 DIS6-20']],
          ['25', 'Words and phrases 204; sounds IN- RE- IM- DIS-; QSO 109, POTA 109',
           ['warmup PR204-25*2 WD204-25*2', 'warmup QSO109-25 IN7-25 RE7-25', 'warmup exercise POTA109-25 IM7-25 DIS7-25']],
          ['25', 'Words and phrases 205; sounds IN- RE- IM- DIS-; QSO 110, POTA 110',
           ['warmup PR205-25*2 WD205-25*2', 'warmup QSO110-25 IN8-25 RE8-25', 'warmup exercise POTA110-25 IM8-25 DIS8-25']],
          ['25', 'Words and phrases 301; sounds IR- UN-; QSO 201, POTA 201',
           ['warmup PR301-25*2 WD301-25*2', 'warmup QSO201-25 IR4-25', 'warmup exercise POTA201-25 UN4-25']],
          ['25', 'Words and phrases 302; sounds IR- UN-; QSO 202, POTA 202',
           ['warmup PR302-25*2 WD302-25*2', 'warmup QSO202-25 IR5-25', 'warmup exercise POTA202-25 UN5-25']],
          ['30', 'Words and phrases 303; sounds IR- UN-; QSO 203, POTA 203',
           ['warmup PR303-30*2 WD303-30*2', 'warmup QSO203-30 IR6-30', 'warmup exercise POTA203-30 UN6-30']],
          ['30', 'Words and phrases 304; sounds IR- UN-; QSO 204, POTA 204',
           ['warmup PR304-30*2 WD304-30*2', 'warmup QSO204-30 IR7-30', 'warmup exercise POTA204-30 UN7-30']],
          ['35', 'Words and phrases 305; sounds IR- UN-; QSO 205, POTA 205',
           ['warmup PR305-35*2 WD305-35*2', 'warmup QSO205-35 IR8-35', 'warmup exercise POTA205-35 UN8-35']],
          ['35', 'Words and phrases 401; QSO 206, POTA 206',
           ['warmup PR401-35*2 WD401-35*2', 'warmup QSO206-35', 'warmup exercise POTA206-35']]
        ]
      }
    }
  };

  /* CW Academy audio files, by the curriculum's names (Tim, 2026-10-30):
     'QSO101-10' -> QSO_101_10.mp3, 'WD101-10' -> WD101_10.mp3, the short
     stories ('SS101-18') on cwops.org, and the CWT files by their own
     addresses. All from the level's practice files page (checked
     2026-10-30: every Intermediate file plays). Most come at six speeds;
     fileSpeeds() says which. */
  var CWA_FILES = 'https://cwa.cwops.org/wp-content/uploads/';
  var CWA_OLDER = {
    'CWT201-20': 'https://cwops.org/wp-content/uploads/2020/06/CWT-201-20.mp3',
    'CWT202-20': 'https://cwops.org/wp-content/uploads/2018/12/CWT-202-20.mp3',
    'CWT208-20': 'https://cwops.org/wp-content/uploads/2018/12/CWT-208-20.mp3',
    'CWT212-25': 'https://cwops.org/wp-content/uploads/2018/12/CWT-212-25.mp3'
  };
  function fileUrl(code) {
    if (CWA_OLDER[code]) return CWA_OLDER[code];
    var m = /^(QSO|WD|PR|POTA|ING|ES|ED|LY|IR|RE|IM|UN|IN|DIS|SS)(\d+)-(\d+)$/.exec(code);
    if (!m || fileSpeeds(m[1] + m[2]).indexOf(Number(m[3])) < 0) return '';
    if (m[1] === 'SS') return 'https://cwops.org/wp-content/uploads/2022/11/SS' + m[2] + '_' + m[3] + '.mp3';
    return CWA_FILES + (m[1] === 'QSO' ? 'QSO_' + m[2] + '_' + m[3] : m[1] + m[2] + '_' + m[3]) + '.mp3';
  }
  // The speeds a file comes at ('WD101' -> [10, 13, 15, 18, 20, 25, 30,
  // 35]): every speed on the Intermediate and Advanced practice files
  // pages, which share the files (checked 2026-10-30). A few stop short
  // (CWA_TOP); the short stories stop at 25; the CWT files come at one speed.
  var CWA_SPEEDS = [10, 13, 15, 18, 20, 25, 30, 35];
  var CWA_TOP = { POTA107: 30, PR205: 30, QSO107: 30, WD205: 30, QSO405: 25 };
  function fileSpeeds(base) {
    var one = Object.keys(CWA_OLDER).filter(function (k) { return k.slice(0, k.indexOf('-')) === base; });
    if (one.length) return one.map(function (k) { return Number(k.slice(k.indexOf('-') + 1)); });
    var top = /^SS/.test(base) ? 25 : CWA_TOP[base] || 35;
    return CWA_SPEEDS.filter(function (v) { return v <= top; });
  }

  /* Links in the Beginner and Fundamental tasks, written [label](key) in the
     task text (Tim, 2026-10-30). The p... keys are the Morse Code Trainer
     links from the Fundamental curriculum (pNdTn: session, day, step), which
     open the trainer with CWops' settings. [label](scale:drill) opens a Daily
     Scale and [label](tool:icr) a tool of this app; the course page does those. */
  var LINKS = {
    lcwo: 'https://lcwo.net/',
    groups: 'https://lcwo.net/groups',
    words: 'https://lcwo.net/wordtraining',
    calls: 'https://lcwo.net/callsigns',
    plain: 'https://lcwo.net/plaintext',
    news: 'https://morse.mdp.im/news/',
    fpf: 'https://cwops.org/fundamental-practice-files/',
    mct: 'https://morsecode.world/international/trainer/trainer.html',
    mctchar: 'https://morsecode.world/international/trainer/character.html',
    sst: 'http://www.k1usn.com/sst.html',
    qso101_7: 'https://cwa.cwops.org/wp-content/uploads/QSO101_07.mp3',
    qso102_7: 'https://cwa.cwops.org/wp-content/uploads/QSO102_07.mp3',
    qso101_9: 'https://cwops.org/wp-content/uploads/2022/07/qso-09.101.mp3',
    qso104_10: 'https://cwops.org/wp-content/uploads/2022/07/qso-10.104.mp3',
    ss111: 'https://cwops.org/wp-content/uploads/2022/07/ss-09.111.mp3',
    ss112: 'https://cwops.org/wp-content/uploads/2022/07/ss-10.112.mp3',
    ss114: 'https://cwops.org/wp-content/uploads/2022/07/ss-10.114.mp3',
    pota203_10: 'https://cwa.cwops.org/wp-content/uploads/POTA203_10.mp3',
    pota203_12: 'https://cwa.cwops.org/wp-content/uploads/POTA203_12.mp3',
    pr205_10: 'https://cwa.cwops.org/wp-content/uploads/PR205_10.mp3',
    p21c3: 'https://morsecode.world/international/trainer/words.html?settings=eyJiZWxsIjrEgG5hbWXEhsSBxINsMyIsInBhdXPEjDoyMDDEk3ZvbHXEi8SGODB9xJNtb3LEmENvbnRyxKBzxIbEgGFkdmFuY2VkU3BlxLxNb2TEmWZhbMSYxJNkb3dubG%252FEtkVuZFDEtmRpbmfEhjHEnMSdIsWGcm5zd8SqdGjEhjbEk2tlecSNY29tcHV0ZXLEkiJsaWdodMSGxYbFiGXEk3BpdGPFpzo1NcWecGxhecWCxYTEjXPFmMSMxJNzb3XFk8SGxLB1xoEic3RhcnTFlWTFl8WZxIbFnnZpYnJhxbTFvsWHxYkixJ%252FEocSjOsSlxJN3cG3EhjI1xKfGn2Vxxp3EumVQxo15xbXEtMSOxITGscaAxJNidWlsZFVwx4%252FGs8WExqHHlMS8Vmlld8eZxp5leMSwYUdhx5g6xZ5mxo1zaGPGomRBZsW0xbY6xb%252FGs8euYcewx7JyZEJlZsSqxYXGssaex7zHvsezVGnGt8WcxJzEk2bGu23EvsWAyIFvb8agx6PEk8WPb8erMcicyJhwxK3GmcW9OsigIm1pY8SxcGjErsiGx5DIqcSqxJhSZcS%252Fxq%252FImyJyZcWvZ27GhGnErsiMyI7FncaWxL%252FIvWjHtce3xptyxp3Jh8WAxobIgsiEyLzIunPJiGRSYcS7x7jHusaedMiNxbXFkmFibMS8yY3JjyLJoMSLclbFh8adxIYzyJAiyJPIlcS8QsiYyJo6xpxlx4HJl8mRxofEiMSKxJkiR8iYZ8mmIFVLIMWSyohpx7AgTcWHZSAoZW4tR0IpxbfGg8aFxofGi8aZY3R1xq%252FJgm7JqMaexq7GsMinxZ7Jv8mJx6nHq8aqxKDEosSZxKXHgcWkyIBUxq7GlMe4xLXEhMWMxLxMZXTHt8SzOiLFt2LFkMiAx5%252FGk2LHlMaExa3HuciHxYrGmMmlZcuEy4bFtcuIyZ7InMqQdFPGmHLEu8aSxqHJoGPFt23EuWTGr8Sqecuby4fEjcurYXjLssudy7TEqGVzc2FnZcuPxqzLknTLlMm8xKjFmMu4xKvFm8STxK7Eu0XJm8aHy5%252FIu8utxbDKqsSTyLzEtsaPxLZly6N1y6XEmcSAY3dpyLrMo8iey4jMh8W4yKvHosuVyLLJgG5qYci6b8Wmx4vMrsSYx4HMmWTMm8WEVHnEv8eMyaTGrWXGq8qnxK7LnsuWIseyxITGk8i%252FzYnIssaGxqLJm8uzzLjGnsWvxK%252FLvMimzJNuxKLEgsyLzZbGgmjGrsSYzZDGs3HGl8mWypjFtMeGzabGnsq6ZMypyY7JvcyYZcSpdmVCVMyXyLvIt8uFyYHErsmWxozGhFTHpXRCy5QixJZ0b8W3zbBMy6HFrsWkcHMvzKfOlELHvcirMi5qxpfKqX19Cg%253D%253D',
    p22s2: 'https://morsecode.world/international/trainer/trainer.html?settings=eyJiZWxsIjrEgG5hbWXEhsSBxINsMyIsInBhdXPEjDoyMDDEk3ZvbHXEi8SGODB9xJNjd29wc8SGxIBjxKt5aW5nSW5kZXjEhjHEqMSxxLNnU2V0dMS%252FxK3EhyJtb3LEmENvbnRyxKDFhsSAYWR2YW5jZWRTcGXFm01vxLjEhmZhbMSYxJNkb3dubG%252FFlUXEt1DFlWTEv8S7xJzEnSLFpXJuc8SqcnRoxIY2xJNrZXnEjcSwbXB1dGVyxJIibGlnaHTFpMWmxajElGl0Y8aCOjU1xblwbGF5xaHFozoic8SzxIzEk3NvdcS3xIbFkHVlxq90YcaAxbNkxbXEtMSGxbl2aWJyYcaOxpjFp8a3IsSfxKHEozrEpcSTd3BtxIYyNcSnxqtlcca2xZllUMalecaPxK7EjsSExrRyxrbEk2J1aWxkVXDHiMaaxLjGucesxZtWaWV3x6bHqCLEucWQYUdhx7A6xblmxqVzaGPGumRBZsaOxpA6xaXHicSTyIZhyIjIinJkQmVmxYrEmciSxprIlciXyItUaceOyIXHkm3FncWfyJpvb3PGl8iRxpnHisWuxKvEu8STyLVwxY3GssixNcSTbWljxZFwaMWOyJ%252FIs8i%252FxYrEmFJlxZ7Hhsexx4pyZcSwZ27GnGnFjsilyKfGr8WeyZNoyI3Ij8mQyZzFn8aeyJvIncmSx7vHinPJnWRSYcWayJDIoMeKxYTEi3LFsWFibMWbyanEk8m0xo9WxabGtseVNMW5yKnIq8WbQsiuyLDJqX3HmGlzxY1wxLLGv8iyyJPFiGVzc2FnZVR5xZ7EjcW%252FZMStyL%252FKmMqaypzHt8asYsesxpzGiDrGtcmqZcS3xL%252FEtsS4xLo6xLzHmcqzxLTFgcWDxYXHo8WJxYtlxY3Fj8WRxafHo8WVxZfHncWcyazGqMmHypbFqsWsxa7FsMWyxbTFtsq4xbjIlMa6xb3Fv8aBxoPGhcaHxolvxovGjceiyLjGlMaWyaLGm8adxp%252FGocajx6DLjsSNxqxuxq7Gq8axxrPKr8enyarGuca7y5bKlMeBx4PHhceHypXGmseMxKLEmceQIsipxLvHl8avx5rHnMWax5%252FGpseixYfEgselzITHiseqx6zHrsiDybLFqcWCYce1ZMe3x7nLqse%252Bx4XIgciDyIXIh8iJyIvJoMyUzJ7FusysyJjImsicyJ7JvMyyyJbMrciZyZrEmTHLmcW6yobJrMqJyK%252FIscyxyLnIt8aSyK7Iusu3yLHKucmAyYLEq8mFy7TLqsuByYvJjWXJj8yYxJPJksmUyZbFhMmZyKbEmTPNgMmryaTJn8iOzJTKsMmjyZ7Jpsy3zZvGq8msya7JsMuqyb7JtsSJybnJu8u5x7zNtsqAxKHEmTLKhMeRx5PKh8itzYXKjMeYxJjKmcmYbsq1xLnEhjfKjsS4xY%252FKrcuIypzEjcaRxZjGjm7Eic6YxKjFpsWnxpRuzp4ixInHjiLGkXDFq8yUzqjGuMeGxJnOqM6JyZ3GnsejzqbOsEfIrmfJuiBVSyDFsc66yo9oIE3FpmUgKMqyLUdCKc6pxpzOtMiExJPGjMWZdHXHhs6MzLjMgsy%252BxbnNpsmezKnHgMSexKDMh8SkxKZ9Cg%253D%253D',
    p33s3: 'https://morsecode.world/international/trainer/trainer.html?settings=eyJiZWxsIjrEgG5hbWXEhsSBxINsMyIsInBhdXPEjDoyMDDEk3ZvbHXEi8SGODB9xJNjd29wc8SGxIBjxKt5aW5nSW5kZXjEhjTEqMSxxLNnU2V0dMS%252FxK3EhyJtb3LEmENvbnRyxKDFhsSAYWR2YW5jZWRTcGXFm01vxLjEhmZhbMSYxJNkb3dubG%252FFlUXEt1DFlWTEv8SGMcScxJ0ixaVybnPEqnJ0aMSGNsSTa2V5xI3EsG1wdXRlcsSSImxpZ2h0xaTFpsWoxJRpdGPGgzo1NcW6cGxhecWhxaM6InPEs8SMxJNzb3XEt8SGxZB1ZcawdGHGgcWzZMW1xLTEhsW6dmlicmHGj8aZxafGuCLEn8ShxKM6xKXEk3dwbcSGMjXEp8asZXHGt8WZZVDGpnnGkMSuxI7EhMa1csa3xJNidWlsZFVwx4nGm8S4xrrHrcWbVmlld8eyx4vEucWQYUdhx7E6xbpmxqZzaGPGu2RBZsaPxpE6xrbHi8iGYciIyIpyZEJlZsWKxJnFpceKxJPIlMiWyItUacePyIXHk23FncWfyJlvb3PGmDrIn8abxa7Eq8W3xJPItXDFjcazyLE1xJNtaWPFkXBoxY7Insaax4vFicWLZVJlxZ7Hh8e8xJNyZcSwZ27GnWnFjsilyKfGsMWeyZRoyI3Ij8mRxqzJnsafyJrInMmTyaNzyZ5kUmHFmsiQyLPHi8ipyKvFm0LIrsiwx6fGt33HmWlzxY1wxLLHgMiyyYjIv2Vzc2FnZVR5xZ7EjcaAZMStyobKiMqKZce4xq1ix63GncaJyJHHqMeLxJjEt8S%252FxLbEuMS6OjHGsGXKosS0xYHFg8WFx6TJisWMxY7FkMWSx6TFlcWXx57FnMmsxqnJh8igIsWqxazFrsWwxbLFtMW2yqfFucihxrvFvsaAxoLGhMaGxojGim%252FGjMaOx6PIuMaVxpfJo3DGncafxIbGosakx6HKvMSNxq1uxq%252FGrMayxrTKnsepxqzGusa8y4XKg8eCx4THhseIyoTKvseNxKLEmceRIsipxbfHmMqpx5zKqsWax6DGp8ejxYfEgsemy7TGm8erx63Hr8iDybLFqcWCYce2ZMe4x7rJo8e%252Bx4bIgciDM8uIxbvIh8iJyIvJocyEzI7MnciVzJ%252FImMmnyJ3JusiTzJ7Il2TJm8SZxbjEnMihybTJrMm3yK%252FIscyjyLnIt8aTyK7IusunyLHKqMWIyYHJg8mFy6TJo8qxyYzJjmXJkMyIx4vJk8mVyZfFhMmayKbEmcybzLLJpMWfxp%252FMociQyJLJnc2ZaMyoyanNjc2exZvJrsmwyaPFhMSLcsWxYWJsxZvMqsSTzanGkFbFpsa3x5Y0xbrMtMiszLbJucupZcm8yqnKiMmZbsqkxLnEpMm9xLjFj8qcyrbKi8SNxpLFmMaPbsSJzo%252FEqMWmxafGlW7OlSLEicePIsaScMWrzITOn8a5x4fEmc6fx5nJq82fx6TOnc6nR8iuZ82vIFVLIMWxzrHJvmggTcWmZSAoyqotR0IpzqDLm8agxqTGs2N0dceHzoTNsSLLssywxbrOqsmfzJnHgcSexKDLt8SkxKZ9Cg%253D%253D',
    p53s3: 'https://morsecode.world/international/trainer/trainer.html?settings=eyJiZWxsIjrEgG5hbWXEhsSBxINsMyIsInBhdXPEjDoyMDDEk3ZvbHXEi8SGODB9xJNjd29wc8SGxIBjxKt5aW5nSW5kZXjEhjHEqMSxxLNnU2V0dMS%252FxK3EhyJtb3LEmENvbnRyxKDFhsSAYWR2YW5jZWRTcGXFm01vxLjEhmZhbMSYxJNkb3dubG%252FFlUXEt1DFlWTEv8S7xJzEnSLFpXJuc8SqcnRoxIY2xJNrZXnEjcSwbXB1dGVyxJIibGlnaHTFpMWmxajElGl0Y8aCOjU1xblwbGF5xaHFozoic8SzxIzEk3NvdcS3xIbFkHVlxq90YcaAxbNkxbXEtMSGxbl2aWJyYcaOxpjFp8a3IsSfxKHEozrEpcSTd3BtxIYyNcSnxqtlcca2xZllUMalecaPxK7EjsSExrRyxrbEk2J1aWxkVXDHiMaaxLjGucesxZtWaWV3x7HHisS5xZBhR2HHsDrFuWbGpXNoY8a6ZEFmxo7GkDrGtceKyIVhyIfIiXJkQmVmxYrEmcWlx4nEk8iTyJXIilRpx47IhMeSbcWdxZ%252FImG9vc8aXOsiexprFrsSrxLvEk8i0cMWNxrLIsDXEk21pY8WRcGjFjsidxpnHisWJxYtlUmXFnseGx7vEk3JlxLBnbsacacWOyKTIpsavxZ7Jk2jIjMiOyZDGq8mdxp7ImcibyZLJonPJnWRSYcWayI%252FIsseKyKjIqsWbQsityK%252FHpsa2fceYaXPFjXDEssa%252FyLHJh8i%252BZXNzYWdlVHnFnsSNxb9kxK3KhcqHyollx7fGrGLHrMacxojIkMenx4rEmMS3xL%252FEtsS4xLo6xLzHmcqhxLTFgcWDxYXHo8mJxYzFjsWQxZLHo8WVxZfHncWcyavGqMmGyJ8ixarFrMWuxbDFssW0xbbKpsW4yKDGusW9xb%252FGgcaDxoXGh8aJb8aLxo3Hosi3xpTGlsmicMacxp7EhsahxqPHoMq6xI3GrG7GrsarxrHGs8qdx6jGq8a5xrvLg8qCx4HHg8eFx4fKg8q8x4zEosSZx5AiyKjEu8eXxq%252FHmsecxZrHn8amx6LFh8SCx6XLssaax6rHrMeuyILJscWpxYJhx7Vkx7fHucmix73HhciAyIIzy4bFusiGyIjIismgzILMjMybyJTMnciXyabInMm5yJLMnMiWZMmaxJkxzJpmybPJq8m2yK7IsMyhyLjItsaSyK3IuculyLDKp8i%252FyYHEq8mEy6LJosqvyYvJjWXJj8yGx4rJksmUyZbFhMmZyKXEmcyZxJzJnMWfxp7Mn8iPyJHNlsmezKbJqM2LzZzJrMmuzKDKhCLFhMSLcsWxYWJsxZvMqMSTzafGj1bFpsa2x5U0xbnMssirzLTJuMunZcm7y7zKh8mYbsqjxLnEhjnJvMS4xY%252FKm8q0yorEjcaRxZjGjm7Eic6OxKjFpsWnxpRuzpQixInHjiLGkXDFq8yCzp7GuMeGxJnOnseYyarNl8afxIjEis6mR8itZ82tIFVLIMWxzrHJvWggTcWmZSAoZW4tR0Ipzp%252FLmcafxqPGsmN0dceGzoLNryLLsMyuxbnOqcmezJfHgMSexKDLtcSkxKZ9Cg%253D%253D',
    p73s3: 'https://morsecode.world/international/trainer/trainer.html?settings=eyJiZWxsIjrEgG5hbWXEhsSBxINsMyIsInBhdXPEjDoyMDDEk3ZvbHXEi8SGODB9xJNjd29wc8SGxIBjxKt5aW5nSW5kZXjEhjHEqMSxxLNnU2V0dMS%252FxK3EhyJtb3LEmENvbnRyxKDFhsSAYWR2YW5jZWRTcGXFm01vxLjEhmZhbMSYxJNkb3dubG%252FFlUXEt1DFlWTEv8S7xJzEnSLFpXJuc8SqcnRoxKTEk2xpZ2h0xaTFpsWoxJRpdGPGgjo1NcW5cGxhecWhxaM6InPEs8SMxJNzb3XEt8SGxZB1ZcahdGHGgMWzZMW1xLTEhsW5dmlicmF0xJnFpcWnxqkixJ%252FEocSjOsSlxJN3cG3EhjI1xKfGnWVxxqjFmWVQxpd5ZXLErsSOxITGisa8xJNidWlsZFVwx5rGjMS4xqvHn8WbVmlld8amcsaoxJPEucWQYUdhx6M6xblmxpdzaGPGrGRBZsa5x5Y6xrvGjMe6Yce8x75yZEJlZsWKxJnGp8a9yIjIise%252FVGnHgce5x4VtxZ3Fn8iNb29zxonIhcaLxr3FrsSrxLvGhMihcMWNxqTIpDLEk21pY8WRcGjFjsa6yKbIssWKxJhSZcWexrjHrsewInJlxLBnbsaOacWOyJjImsahxZ7Jh2jIgciDx6TGvXPJkcaQyI7IkMmGyZbJkMifUmHFmsiEyIbGvcWExItyxbFhYmzFm8mDyabImceVVsWmxqjHiDTFucicyJ7Fm0LIocijya99x4tpc8WNcMSyxrHIpcebxYhlc3NhZ2VUecWexI3Fv2TErciyyovKjcqPx6rGnmLHn8aOecmvxJPGt8S3b8eHOsiTxqFlxLfEv8S2xLjEujrEvMeMyqzEtMWBxYPFhceXxYnFi2XFjcWPxZHFp8eXxZXFl8eQxZzJkWTGmsi6yonFqsWsxa7FsMWyxbTFtsqxxbjEk8W7xb3Fv8aBxIY2xJNrZcqhxpzEsG1wdcmVxoTGhsaIyZ7GjcaPxpHGk8aVx5PLiMSNxp5uxqDGncajxqXKqMevyZfGq8aty5DKh8azxrXGt8a5y6jGv8SixJnHgyLInMS7x4rKqseOyqvFmseSxpjHlceXxILHmcu3yYTHncefx6HHt8mlxanFgmHHqGTHqsesy6jHssa3x7XHtzPLk8W6x7vHvce%252FyZTMkcqIyIfMq8iLyI3Ij8iRyqLMqsiJzKzIjMmOxJkxzKlmybnLhsm8yKLIpMybIsiox7fKss2IyK7Fj8eIyLLItMi2yLjLssuoyrrIvsmAZcmCzLDGvcmGyYjJisWEyY3JscSGzKjEnMmfyZLMrsmkyLvGncmZaMmbzLbNms2lZMmhyaPLqM2ByJ%252FNg8m%252BzJVlyoDKqsqMyYxuyq7EucW3yoHEuMWPyqDLgcqPxI3EkiLFmMa5bsSJzonEqMWmxafGhm7OkCLEiceBIs6KcMWrzK%252FOmsaqxrjEmc6ax4vJmMWfxpDHl86YzqJHyKFnya0gVUsgxbHOrcqCaCBNxaZlICjKqy1HQinOm8aOzqfHuMSTy6LFmXR1xrjNvsy3zIDMvcW5zqXJksymxrLEnsSgzITEpMSmfQo%253D',
    p91s2: 'https://morsecode.world/international/trainer/trainer.html?settings=eyJiZWxsIjrEgG5hbWXEhsSBxINsMyIsInBhdXPEjDoyMDDEk3ZvbHXEi8SGODB9xJNjd29wc8SGxIBjxKt5aW5nSW5kZXjEhjHEqMSxxLNnU2V0dMS%252FxK3EhyJtb3LEmENvbnRyxKDFhsSAYWR2YW5jZWRTcGXFm01vxLjEhmZhbMSYxJNkb3dubG%252FFlUXEt1DFlWTEv8S7xJzEnSLFpXJuc8SqcnRoxKTEk2tlecSNxLBtcHV0ZXLEkiJsaWdodMWkxabFqMSUaXRjxoI6NTXFuXBsYXnFocWjOiJzxLPEjMSTc291xLfEhsWQdWXGrnRhxoDFs2TFtcS0xIbFuXZpYnJhxo3Gl8WnxrYixJ%252FEocSjOsSlxJN3cG3EhjI1xKfGqmVxxrXFmWVQxqR5xo7ErsSOxITHh8aZYnVpbGRVcMelx4nEuMa4x6nFm1ZpZXfGs3LGtcSTxLnFkGFHYcetOsW5Zsakc2hjxrlkQWbGjcaPOsWlx4jEk8iEYciGyIhyZEJlZsWKxJnGtMeJyJPIlciJVGnHjciDx5FtxZ3Fn8iYb29zxpbIj8aYx4nFrsSrxLvEk8izcMWNxrHIrzLEk21pY8WRcGjFjsSZyJDGmcWJxYtlUmXFnseFx7jHuiJyZcSwZ27Gm2nFjsijyKXGrsWeyZNoyIvIjceuyZzFn8adyJnIm8mSyaLGqsmdZFJhxZrIjsmGx4nFhMSLcsWxYWJsxZvJj8myyKTGjlbFpsa1x5Q0xbnIp8ipxZtCyKzIrsm7fceXaXPFjXDEssa%252ByLDIkcWIZXNzYWdlVHnFnsSNyYLHhMSYxK3IvcqXypnKm8e0xqtix6nGm8aHOsiexJPHhMS3b8eTyq%252FHuceJxJjEt8S%252FxLbEuMS6OsS8x5jKusS0xYHFg8WFx6LJiMWMxY7FkMWSx6LFlcWXx5zFnMmrxqfJhcixxanFq8Wtxa9kxbFkxrvGvWfFt8ScyJLGucW9xb%252FGgcSGOci2xpPGlcmpcMabxp3EhsagxqLHn8uTxI3Gq27GrcaqxrDGssq2yZDIrsa5dMudxbbIgsSex4LHhMeGypTGmceLxKLEmcePIsinxLvHlsaux5nHm8Wax57GpcehxYfEgseky7zHicenx6nHq8iBybHFqcWCYceyZMe0x7bJqce8x4THv8iBM8W4yJLIhciHyInJoMyYzKLFusyyyJbImMiayJzJu8yxyJTMs8iXyZrEmTHMsMW6yoXJq8qIyK3Ir8y3yLfItcaRyKzIuMu6yK%252FLgMi%252ByYDEq8mDy7fJqcuIyYrJjGXJjsyIx4nJksmUyZbFhMmZyb3MkMW4xblzyZ3Gncy1ybDLlcmqyaRoyabMvc2hyaPFm8mtya%252FJqcmzxo7Jtsm4ybrMnMSTzb1yyb%252FEocSZzK%252FKhMeSyobIq82LyovHl8qjxqvFjsq8xLnFt8qNxLjFj8qty43Km8SNxpDFmMaNbsSJzp3EqMWmxafGk27OoyLEiceNIsaQcMWrzJjOrca3x4XEmc6tzpDNrcaexIjEis61R8isZ8m5IFVLIMWxzr%252FKjmggTcWmZSAoZW4tR0Ipzq7LrsaexqLGsWN0dceFyZjOqM6CyZHOtMW3zbjGncytxr%252FEnsSgzIvEpMSmfQo%253D',
    p93c2: 'https://morsecode.world/international/trainer/words.html?settings=eyJiZWxsIjrEgG5hbWXEhsSBxINsMyIsInBhdXPEjDoyMDDEk3ZvbHXEi8SGODB9xJNtb3LEmENvbnRyxKBzxIbEgGFkdmFuY2VkU3BlxLxNb2TEmWZhbMSYxJNkb3dubG%252FEtkVuZFDEtmRpbmfEhjHEnMSdIsWGcm5zd8SqdGjEhjnEk2tlecSNY29tcHV0ZXLEkiJsaWdodMSGxYbFiGXEk3BpdGPFpzo1NcWecGxhecWCxYTEjXPFmMSMxJNzb3XFk8SGxLB1xoEic3RhcnTFlWTFl8WZxIbFnnZpYnJhxbTFvsWHxYkixJ%252FEocSjOsSlxJN3cG3EhjI1xKfGn2Vxxp3EumVQxo15xbXEtMSOxITGscaAxJNidWlsZFVwx4%252FGs8WExqHHlMS8Vmlld8eZxp5leMSwYUdhx5g6xZ5mxo1zaGPGomRBZsW0xbY6xpzGnseuYcewx7JyZEJlZsSqxYXGsse7x6%252FHscezVGnGt8WcxJzEk2bGu23EvsWAyIFvb8agx6PEk8WPb8erxZ7InXDErcaZxb06McSoaWPEsXBoxK7IhseQIsSpxKtlUmXEv8avyJsicmXFr2duxoRpxK7IjMa3xJvIkMafxL%252FIvGjHtce3yLlzyYjGhsiCyITIu8mNyYhkUmHEu8e4xb%252FGs3TIjcW1xZJhYmzEvMabcsadxJPJncSLclbFh8adxIYzyYbIk8iVxLxCyJjImse5yaZlx4HJjsWAxobHjMSJxrciR8iYZ8mjIFVLIMWSyoVpx7AgTcWHZSAoZW4tR0IpxbfGg8aFxofGi8aZY3R1xq%252FJgW7JpcmnyLrGr8SZxZzGlsmPaMepyJ%252FEnsSgxKLEmcSlx4HFpMiAVMauxpTHuMS1xITFjMS8TGV0x7fEszoixbdixZDIgMefxpNix5TGhMWtOsmbxp7Fi3XJomXLgsuExbXLhsuUyJzKjXRTxphyxLvGksahyZ1jxbdtxLlkxq%252FEqnnLmsuFxI3LqmF4y7HLnMuzxKhlc3NhZ2XLjcasy5B0y5LHusiobsu3xKvFm8STxK7Eu0XJmMaHzIbKqcWTxbDKp8aeyLvEtsaPxLZly6J1y6TEmcSAY3dpyLnMosiey4bMksW5zKLIuci%252FbmphyLlvxabHi8uTyIfHgcyYZMyaxYRUecS%252Fx4zJocatZcaryqTErsudyIfEk8eyxITGk8i%252BzYbIsMaGxqLJmMuyzLXNjsSuxbTJt8ueIm7EosSCzIrNk8azyKzGrsSYzY3Gs3HGl8mNypXFtMeGzaPGnsq4ZMyoybnMt2XEqXZlQlTMlsSTyLvEv8mdyZ3ErsmUxbl0VMeldELLkiLElnRvxbfNrUzLoMWuxaRwcy%252FMps6RQse9yKkxzokzLmrGl8qmfX0K',
    p101s2: 'https://morsecode.world/international/trainer/trainer.html?settings=eyJiZWxsIjrEgG5hbWXEhsSBxINsMyIsInBhdXPEjDoyMDDEk3ZvbHXEi8SGODB9xJNjd29wc8SGxIBjxKt5aW5nSW5kZXjEhjHEqMSxxLNnU2V0dMS%252FxK3EhyJtb3LEmENvbnRyxKDFhsSAYWR2YW5jZWRTcGXFm01vxLjEhmZhbMSYxJNkb3dubG%252FFlUXEt1DFlWTEv8S7xJzEnSLFpXJuc8SqcnRoxKTEk2tlecSNxLBtcHV0ZXLEkiJsaWdodMWkxabFqMSUaXRjxoI6NTXFuXBsYXnFocWjOiJzxLPEjMSTc291xLfEhsWQdWXGrnRhxoDFs2TFtcS0xIbFuXZpYnJhxo3Gl8WnxrYixJ%252FEocSjOsSlxJN3cG3EhjI1xKfGqmVxxrXFmWVQxqR5xo7ErsSOxITHh8aZYnVpbGRVcMelx4nEuMa4x6nFm1ZpZXfGs3LGtcSTxLnFkGFHYcetOsW5Zsakc2hjxrlkQWbGjcaPOsWlx4jEk8iEYciGyIhyZEJlZsWKxJnGtMeJyJPIlciJVGnHjciDx5FtxZ3Fn8iYb29zxpbIj8aYx4nFrsSrxLvEk8izcMWNxrHIrzLEk21pY8WRcGjFjsSZyJDGmcWJxYtlUmXFnseFx7jHuiJyZcSwZ27Gm2nFjsijyKXGrsWeyZNoyIvIjceuyZzFn8adyJnIm8mSyaLGqsmdZFJhxZrIjsmGx4nFhMSLcsWxYWJsxZvJj8myyKTGjlbFpsa1x5Q0xbnIp8ipxZtCyKzIrsm7fceXaXPFjXDEssa%252ByLDIkcWIZXNzYWdlVHnFnsSNyYLHhMSYxK3IvcqXypnKm8e0xqtix6nGm8aHypTGmceExLdvx5M6yJ7GrmXEt8S%252FxLbEuMS6OsS8x5jKucS0xYHFg8WFx6LJiMWMxY7FkMWSx6LFlcWXx5zFnMmrxqfJhcixxanFq8Wtxa9kxbFkxrvGvWfFt8ScyJLGucW9xb%252FGgcS7M8aExobGiMqzxovJoci2xpPGlcmpcMabxp3EhsagxqLHn8uSxI3Gq27GrcaqxrDGssq1x7nHiciuxrl0y5zFtsiCxJ7HgseEx4bKr8eJx4vEosSZx48iyKfEu8eWyrfHmsq4xZrHnsalx6HFh8SCx6TMgcmQx6fHqceryIHJscWpxYJhx7Jkx7THtsmpx7zHhMe%252FyIExxqHFuMiSyIXIh8iJyaDMnsyoxbrMuciWyJjImsicybvMuMiUzLrIl8maxJkxzLfFusqFyavKiMityK%252FMvsi3x5TItsisyLjLv8ivyr%252FIvsmAxKvJg8u8yanLh8mKyYxlyY7MjsSTyZLJlMmWxYTJmcm9zJbNjXPJncadzLzJsMuUyarJpGjJps2EzajNuMWbya3Jr8mpybPGjsm2ybjJus29zoNyyb%252FEoc2LNzXHkMeSyobIq82SyovHl8qjxqvFjsq7xLnEuzHKjcS4xY%252FKrcuMypvEjcaQxZjGjW7Eic6kxKjFpsWnxpNuzqoixInHjSLGkHDFq8yezrTGt8eFxJnOtM6WzbPGnsSIxIrOvEfIrGfJuSBVSyDFsc%252BGyo5oIE3FpmUgKMq4LUdCKc61y7PGnsaixrFjdHXHhcmYzq%252FMoseJzIzNi8W5zbLNucyzxr%252FEnsSgzJHEpMSmfQo%253D',
    p103c2: 'https://morsecode.world/international/trainer/words.html?settings=eyJiZWxsIjrEgG5hbWXEhsSBxINsMyIsInBhdXPEjDoyMDDEk3ZvbHXEi8SGODB9xJNtb3LEmENvbnRyxKBzxIbEgGFkdmFuY2VkU3BlxLxNb2TEmWZhbMSYxJNkb3dubG%252FEtkVuZFDEtmRpbmfEhjHEnMSdIsWGcm5zd8SqdGjEhjnEk2tlecSNY29tcHV0ZXLEkiJsaWdodMSGxYbFiGXEk3BpdGPFpzo1NcWecGxhecWCxYTEjXPFmMSMxJNzb3XFk8SGxLB1xoEic3RhcnTFlWTFl8WZxIbFnnZpYnJhxbTFvsWHxYkixJ%252FEocSjOsSlxJN3cG3EhjI1xKfGn2Vxxp3EumVQxo15xbXEtMSOxITGscaAxJNidWlsZFVwx4%252FGs8WExqHHlMS8Vmlld8eZxp5leMSwYUdhx5g6xZ5mxo1zaGPGomRBZsW0xbY6xpzGnseuYcewx7JyZEJlZsSqxYXGsse7x6%252FHscezVGnGt8WcxJzEk2bGu23EvsWAyIFvb8agx6PEk8WPb8erMcicyJhwxK3GmcW9OsigIm1pY8SxcGjErsiGx5DIqcSqxJhSZcS%252Fxq%252FImyJyZcWvZ27GhGnErsiMyI7FncaWxL%252FIvWjHtce3yLpzyYjGhsiCyITIvMmNyYhkUmHEu8e4xb%252FGs3TIjcW1xZJhYmzEvMabcsadxJPJncSLclbFh8adxIYzyJAiyJPIlcS8QsiYyJrHucmmZceByY7FgMaGx4zEica3IkfImGfJoyBVSyDFksqGacewIE3Fh2UgKGVuLUdCKcW3xoPGhcaHxovGmWN0dcavyYJuyaXJp8i7xq%252FEmcWcyYfJvmjHqcerxqrEoMSixJnEpceBxaTIgFTGrsaUx7jEtcSExYzEvExldMe3xLM6IsW3YsWQyIDHn8aTYseUxoTFrTrJm8aexYt1yaJly4PLhcW1y4fLlcicyo50U8aYcsS7xpLGocmdY8W3bcS5ZMavxKp5y5vLhsSNy6theMuyy53LtMSoZXNzYWdly47GrMuRdMuTx7rEqMWYy7jEq8WbxJPErsS7RcmYxofLn8qqxZPFsMqoxp7IvMS2xo%252FEtmXLo3XLpcSZxIBjd2nIusyjyJ7Lh8yHxbjIq8eiy5TIh8STyYBuamHIum%252FFpseLzK7GgMeBzJlkzJvFhFR5xL%252FHjMmhxq1lxqvKpcSuy57MryLHssSExpPIv82KyLLGhsaiyZjLs8y5xrPFr8Svy7zIpsyTbsSixILMi82Xxp7IrsauxJjNkcazccaXyY3KlsW0x4bNp8aeyrlkzKnJusy7ZcSpdmVCVMyXxJPIvMS%252FyZ3JncSuyZTFuXRUx6V0QsuTIsSWdG%252FFt82xTMuhxa7FpHBzL8ynzpVCx73IqzHOjTMuasaXyqd9fQo%253D'
  };

  /* The order courses teach characters, class by class (Tim, 2026-10-29).
     ICR and Code Groups practice "through class N" (the CW Academy Beginners group). */
  var ORDERS = {
    cwaBeginner: {
      name: 'CW Academy Beginner',
      classes: [
        ['A', 'E', 'N', 'T'],
        ['S', 'I', 'O', '1', '4'],
        ['D', 'H', 'L', 'R', '2', '5'],
        ['C', 'U'],
        ['M', 'W', '3', '6', '?'],
        ['F', 'Y', ','],
        ['G', 'P', 'Q', '7', '9', '/'],
        ['B', 'V', '<AR>'],
        ['J', 'K', '0', '8', '<BT>'],
        ['X', 'Z', '.', '<BK>', '<SK>']
      ]
    }
  };

  /* ---------------------------------------------------------------------
     CLASS PROGRESS (Tim, 2026-10-30): the date each task (or class) was
     ticked Done, how many times it was redone, and for an audio file the
     speed picked. Kept per course level ('cwa:intermediate'), so switching
     levels and back loses nothing. Keys: '3.1.WD103' = session 3, day 1,
     that task (courses that list the days: the scale, the file without its
     speed, or icr, mr, wpx, cwt), '3' = class 3.
       HST.course.progress.get(courseKey)  { '3.1.WD103': { done: 'YYYY-MM-DD', redo: 2, sp: 15, plays: ['YYYY-MM-DD', ''], hw: [uid, ''] }, ... }
       HST.course.progress.set(courseKey, key, patch)
       HST.course.progress.onChange(fn)    fn() -- also when another window changes it
     --------------------------------------------------------------------- */
  var PKEY = 'hct-cw-course-progress-v1';
  function cleanEntry(e) {
    e = e || {};
    var out = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.done || '')) out.done = e.done;
    var r = Math.floor(Number(e.redo) || 0);
    if (r > 0) out.redo = Math.min(r, 999);
    var sp = Math.floor(Number(e.sp) || 0);
    if (sp >= 5 && sp <= 40) out.sp = sp;
    // Homework plays (Tim, 2026-10-31): plays[i] = the date the i-th play
    // was ticked ('' = not), hw[i] = the uid of its Homework session.
    if (Array.isArray(e.plays) && e.plays.some(Boolean)) out.plays = e.plays.slice(0, 3).map(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : ''; });
    if (Array.isArray(e.hw) && e.hw.some(Boolean)) out.hw = e.hw.slice(0, 3).map(function (u) { return typeof u === 'string' && /^[\w-]{8,64}$/.test(u) ? u : ''; });
    return out;
  }
  function loadProgress() {
    try { var o = JSON.parse(localStorage.getItem(PKEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  }
  var progListeners = [];
  window.addEventListener('storage', function (e) {
    if (e.key !== PKEY) return;
    progListeners.forEach(function (fn) { try { fn(); } catch (err) { console.error(err); } });
  });
  var progress = {
    get: function (courseKey) {
      var all = loadProgress(), mine = all[courseKey] || {}, out = {};
      Object.keys(mine).forEach(function (n) { var e = cleanEntry(mine[n]); if (Object.keys(e).length) out[n] = e; });
      return out;
    },
    set: function (courseKey, n, patch) {
      var all = loadProgress(), mine = all[courseKey] || {}, e = mine[n] || {};
      Object.keys(patch).forEach(function (k) { e[k] = patch[k]; });
      e = cleanEntry(e);
      if (Object.keys(e).length) mine[n] = e; else delete mine[n];
      all[courseKey] = mine;
      try { localStorage.setItem(PKEY, JSON.stringify(all)); } catch (err) {}
      progListeners.forEach(function (fn) { try { fn(); } catch (err) { console.error(err); } });
    },
    onChange: function (fn) { progListeners.push(fn); }
  };

  HST.course = {
    PROGRAMS: PROGRAMS,
    ORDERS: ORDERS,
    charsThrough: function (order, n) {
      var o = ORDERS[order], out = [];
      if (!o) return out;
      o.classes.slice(0, n).forEach(function (c) { out = out.concat(c); });
      return out;
    },
    progress: progress,
    fileUrl: fileUrl,
    fileSpeeds: fileSpeeds,
    link: function (key) { return LINKS[key] || ''; },
    get: copy,
    set: function (patch) {
      var next = copy();
      Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
      cur = clean(next);
      try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {}
      notify();
    },
    onChange: function (fn) { listeners.push(fn); },
    info: function (program, level) {
      if (program === 'cwa' && CWA.levels[level]) {
        var l = CWA.levels[level], out = {};
        Object.keys(l).forEach(function (k) { out[k] = l[k]; });
        ['semesters', 'meets', 'resources', 'register'].forEach(function (k) { out[k] = CWA[k]; });
        return out;
      }
      return null;
    },
    // Homework done for each session (Progress, Tim 2026-11-01):
    // [{ done, total }], a task counted done like My Course does (its
    // keys: '3.1.WD103', '3.1.c2'; a course without days: the class, '3').
    sessionTally: function (info, prog) {
      return info.sessions.map(function (s, i) {
        var n = i + 1;
        if (!s[2]) return { done: prog[n] && prog[n].done ? 1 : 0, total: 1 };
        var done = 0, total = 0;
        s[2].forEach(function (day, j) {
          var list = typeof day === 'string' ? day.split(' ') : day.filter(function (x) { return x.charAt(0) !== '#'; });
          list.forEach(function (tok) {
            var bar = tok.indexOf('|');
            var key = n + '.' + (j + 1) + '.' + (bar > 0 ? tok.slice(0, bar) : tok.replace(/[-*:].*$/, ''));
            total++;
            if (prog[key] && prog[key].done) done++;
          });
        });
        return { done: done, total: total };
      });
    },
    levelName: function (program, level) {
      var p = PROGRAMS[program];
      var l = p && p.levels.filter(function (x) { return x.key === level; })[0];
      return l ? l.name : '';
    }
  };
})();
