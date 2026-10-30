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
 *   HST.course.progress         each practice day's (or class's) Done date and redo count (see CLASS PROGRESS)
 *   HST.course.fileUrl(code)    a CW Academy audio file's address, from its curriculum name ('QSO101-10')
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
        sessions: [
          ['18/4', 'New characters: A E N T'],
          ['', 'New: S I O 1 4'],
          ['', 'New: D H L R 2 5'],
          ['', 'New: C U'],
          ['', 'New: M W 3 6 ?'],
          ['', 'New: F Y and the comma'],
          ['25/6', 'New: G P Q 7 9 /'],
          ['', 'New: B V and <AR>'],
          ['', 'New: J K 0 8 and <BT>'],
          ['', 'New: X Z . <BK> <SK> — every character is in'],
          ['25/6', 'Your first QSO scripts; single-character ICR'],
          ['25/6', 'QSO scripts with weather, rig and antenna; ICR'],
          ['25/6', 'QSO scripts: signing off; ICR'],
          ['', 'Listen to slower CW on the air; send your call, QTH and name'],
          ['', 'Listen on the air and pick out your own call sign'],
          ['', 'Whole exchanges, start to finish, ready for your first contacts']
        ]
      },
      fundamental: {
        about: 'Builds head copy and sending, conversational QSOs, and a first taste of contesting.',
        entry: '6 WPM or more', goal: '10 WPM or more',
        curriculum: 'https://cwops.org/wp-content/uploads/2025/04/CW-Academy-Fundamental-Curriculum-v2.0.htm',
        practice: 'https://cwops.org/fundamental-practice-files/',
        speedNote: 'Speeds are overall (Farnsworth) speeds, with characters at 25 WPM.',
        sessions: [
          ['6', 'The warm-up routine, code groups, and your list of problem characters; send your name and call'],
          ['6', 'Problem characters, word lists, the whole alphabet and numbers'],
          ['7', 'Three-letter groups; QSO 101 — who called, who answered'],
          ['7', 'Pangrams and code groups; QSO 102'],
          ['7', 'Name and RST, name and QTH exchanges; record and critique your sending'],
          ['8', 'Repeated-letter drills; abbreviations and Q-codes'],
          ['8', 'Send one side of a QSO; start call sign training'],
          ['8', 'Send from memory; two-letter words; call signs'],
          ['9', 'Phrases and pangrams; correcting your sending mistakes'],
          ['9', 'QSO phrases; more call sign training'],
          ['9', 'Short jokes, country codes and news headlines; Short Story 111'],
          ['10', 'QSO phrases and jokes; a POTA QSO'],
          ['10', 'A full practice QSO'],
          ['10', 'A second practice QSO; Short Story 114'],
          ['11', 'Letter groups at 80% copy; make three QSOs on the air'],
          ['', 'Wrap-up: keep practicing every day and get on the air']
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
        // session; a day is 'FILE FILE | other practice', where each FILE is
        // the curriculum's name for a CWops audio file (fileUrl() links it).
        // Every day also has the routine in `every`.
        every: 'Practice on three days before each session. Each day starts with the sending warm-up from the Daily Morse Code Scales, adding the drill on day 2 and the exercise on day 3. Tap a file to play it (copy each one two or three times). ICR is on LCWO or MorseCode.World, and Morse Runner is 15 minutes.',
        // Each session's place in the curriculum (its table of contents
        // links): session n is #_Toc(172984023 + n).
        sessionAnchor: function (n) { return '#_Toc' + (172984023 + n); },
        sessions: [
          ['10', 'Words and phrases 101; sounds -ING -ES IR- RE-; QSO 101, POTA 102; Morse Runner single calls',
           ['WD101-10 PR101-10 | ICR 10 WPM', 'ING4-10 ES4-10 IR4-10 RE4-10 | Morse Runner 10 WPM', 'QSO101-10 POTA102-10 | ICR 10 WPM']],
          ['10', 'Words and phrases 102; sounds -ED -LY IM- UN-; QSO 103, POTA 104',
           ['WD102-10 PR102-10 | Morse Runner 10 WPM', 'ED4-10 LY4-10 IM4-10 UN4-10 | ICR 10 WPM', 'QSO103-10 POTA104-10 | Morse Runner 10 WPM']],
          ['13', 'Words and phrases 103; sounds -ING -ES IN-; QSO 105, POTA 106',
           ['WD103-13 PR103-13 | ICR 13 WPM', 'ING5-13 ES5-13 IN4-13 | Morse Runner 13 WPM', 'QSO105-13 POTA106-13 | ICR 13 WPM']],
          ['13', 'Words and phrases 202; sounds -ED -LY IR-; QSO 107, POTA 108',
           ['WD202-13 PR202-13 | Morse Runner 13 WPM', 'ED5-13 LY5-13 IR5-13 | ICR 13 WPM', 'QSO107-13 POTA108-13 | Morse Runner 13 WPM']],
          ['13', 'Words and phrases 203; sounds -ING DIS- IM-; QSO 201, POTA 110',
           ['WD203-13 PR203-13 | ICR 13 WPM', 'ING6-13 DIS4-13 IM5-13 | Morse Runner 13 WPM', 'QSO201-13 POTA110-13 | ICR 13 WPM']],
          ['13', 'Words and phrases 205; sounds -ES RE- IN-; QSO 203, POTA 202',
           ['WD205-13 PR205-13 | Morse Runner 13 WPM', 'ES6-13 RE5-13 IN5-13 | ICR 13 WPM', 'QSO203-13 POTA202-13 | Morse Runner 13 WPM']],
          ['15', 'Words and phrases 301; sounds -ED -LY IR-; QSO 205, POTA 204',
           ['WD301-15 PR301-15 | ICR 15 WPM', 'ED6-15 LY6-15 IR6-15 | Morse Runner 15 WPM', 'QSO205-15 POTA204-15 | ICR 15 WPM']],
          ['15', 'Words and phrases 302; sounds -ING DIS- IM-; QSO 207, POTA 206',
           ['WD302-15 PR302-15 | Morse Runner 15 WPM', 'ING7-15 DIS5-15 IM6-15 | ICR 15 WPM', 'QSO207-15 POTA206-15 | Morse Runner 15 WPM']],
          ['15', 'Words and phrases 303; sounds -ES UN- IN-; QSO 301, POTA 208',
           ['WD303-15 PR303-15 | ICR 15 WPM', 'ES7-15 UN5-15 IN6-15 | Morse Runner 15 WPM', 'QSO301-15 POTA208-15 | ICR 15 WPM']],
          ['15', 'Words and phrases 304; sounds -ED RE- IR-; QSO 303, POTA 210',
           ['WD304-15 PR304-15 | Morse Runner 15 WPM', 'ED7-15 RE6-15 IR7-15 | ICR 15 WPM', 'QSO303-15 POTA210-15 | Morse Runner 15 WPM']],
          ['18', 'Words and phrases 305; sounds -LY DIS- IM-; QSO 305, POTA 301; first short story for head copy (SS 101)',
           ['WD305-18 PR305-18 | ICR 18 WPM', 'LY7-18 DIS6-18 IM7-18 SS101-18 | ICR 18 WPM', 'QSO305-18 POTA301-18 | Morse Runner 15 WPM']],
          ['18', 'Words and phrases 401; sounds -ING UN- IN-; QSO 307, POTA 302; short story SS 103; Morse Runner in WPX contest mode',
           ['WD401-18 PR401-18 | Morse Runner 18 WPM', 'ING8-18 UN6-18 IN7-18 SS103-18', 'QSO307-18 POTA302-18 | Morse Runner WPX contest 18 WPM']],
          ['18', 'Words and phrases 402; sounds -ES RE- IR-; QSO 401, POTA 304; first CWT practice file (CWT 201)',
           ['WD402-18 PR402-18 | ICR 18 WPM', 'ES8-18 RE7-18 IR8-18 CWT201-20 | Morse Runner 18 WPM', 'QSO401-18 POTA304-18 | ICR 15 WPM']],
          ['20', 'Words and phrases 403; sounds -ES DIS- IM-; QSO 403, POTA 306; CWT 202; copy five stations in a live CWT',
           ['WD403-20 PR403-20 CWT202-20', 'ES8-20 DIS7-20 IM8-20 | Live CWT: copy 5 stations', 'QSO403-20 POTA306-20 | Morse Runner 20 WPM']],
          ['20', 'Words and phrases 404; sounds -LY UN- IN-; QSO 405, POTA 308; CWT 208; Morse Runner in WPX contest mode',
           ['WD404-20 PR404-20 CWT208-20', 'LY8-20 UN7-20 IN8-20 | Morse Runner WPX contest 20 WPM', 'QSO405-20 POTA308-20 | ICR 20 WPM']],
          ['25', 'A taste of 25 WPM: words and phrases 405; sounds UN- DIS- RE-; QSO 407, POTA 310; CWT 212; work five stations in a live CWT',
           ['WD405-25 PR405-25 CWT212-25 | Morse Runner 25 WPM', 'UN8-25 DIS8-25 RE8-25 | Live CWT: work 5', 'QSO407-25 POTA310-25 | Morse Runner 25 WPM']]
        ]
      },
      advanced: {
        about: 'For high-speed operating: copying phrases, copying behind, and contesting.',
        entry: '20 WPM or more', goal: '30 WPM or more',
        curriculum: 'https://cwops.org/wp-content/uploads/2025/05/CW-Academy-Advanced-Curriculum-v2.1.htm',
        practice: 'https://cwops.org/advanced-practice-files/',
        speedNote: '',
        sessions: [
          ['20', 'Sending warm-up; phrases, words and a QSO; -ING -ED -ES -LY sounds; POTA'],
          ['20', 'Phrases, words and a QSO; -ING -ED -ES -LY sounds; POTA'],
          ['20', 'Phrases, words and a QSO; -ING -ED -ES -LY sounds; POTA'],
          ['20', 'Phrases, words and a QSO; -ING -ED -ES -LY sounds; POTA'],
          ['20', 'Phrases, words and a QSO; the last -ING -ED -ES -LY set; POTA'],
          ['20', 'Phrases, words and a QSO; IN- RE- IM- DIS- sounds; POTA'],
          ['20', 'Phrases, words and a QSO; IN- RE- IM- DIS- sounds; POTA'],
          ['20', 'Phrases, words and a QSO; IN- RE- IM- DIS- sounds; POTA'],
          ['25', 'Phrases, words and a QSO; IN- RE- IM- DIS- sounds; POTA'],
          ['25', 'Phrases, words and a QSO; IN- RE- IM- DIS- sounds; POTA'],
          ['25', 'Phrases, words and a QSO; IR- and UN- sounds; POTA'],
          ['25', 'Phrases, words and a QSO; IR- and UN- sounds; POTA'],
          ['30', 'Phrases, words and a QSO; IR- and UN- sounds; POTA'],
          ['30', 'Phrases, words and a QSO; IR- and UN- sounds; POTA'],
          ['35', 'Phrases, words and a QSO; IR- and UN- sounds; POTA'],
          ['35', 'Phrases, words, a QSO and POTA']
        ]
      }
    }
  };

  /* CW Academy audio files, by the curriculum's names (Tim, 2026-10-30):
     'QSO101-10' -> QSO_101_10.mp3, 'WD101-10' -> WD101_10.mp3, and the few
     older short-story and CWT files by their own addresses. All from the
     level's practice files page (checked 2026-10-30: every Intermediate
     file plays). */
  var CWA_FILES = 'https://cwa.cwops.org/wp-content/uploads/';
  var CWA_OLDER = {
    'SS101-18': 'https://cwops.org/wp-content/uploads/2022/11/SS101_18.mp3',
    'SS103-18': 'https://cwops.org/wp-content/uploads/2022/11/SS103_18.mp3',
    'CWT201-20': 'https://cwops.org/wp-content/uploads/2020/06/CWT-201-20.mp3',
    'CWT202-20': 'https://cwops.org/wp-content/uploads/2018/12/CWT-202-20.mp3',
    'CWT208-20': 'https://cwops.org/wp-content/uploads/2018/12/CWT-208-20.mp3',
    'CWT212-25': 'https://cwops.org/wp-content/uploads/2018/12/CWT-212-25.mp3'
  };
  function fileUrl(code) {
    if (CWA_OLDER[code]) return CWA_OLDER[code];
    var m = /^(QSO|WD|PR|POTA|ING|ES|ED|LY|IR|RE|IM|UN|IN|DIS)(\d+)-(\d+)$/.exec(code);
    if (!m) return '';
    return CWA_FILES + (m[1] === 'QSO' ? 'QSO_' + m[2] + '_' + m[3] : m[1] + m[2] + '_' + m[3]) + '.mp3';
  }

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
     CLASS PROGRESS (Tim, 2026-10-30): the date each practice day (or class)
     was ticked Done, and how many times it was redone. Kept per course level
     ('cwa:intermediate'), so switching levels and back loses nothing. Keys:
     '3.1' = session 3, day 1 (courses that list the days), '3' = class 3.
       HST.course.progress.get(courseKey)  { '3.1': { done: 'YYYY-MM-DD', redo: 2 }, ... }
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
    levelName: function (program, level) {
      var p = PROGRAMS[program];
      var l = p && p.levels.filter(function (x) { return x.key === level; })[0];
      return l ? l.name : '';
    }
  };
})();
