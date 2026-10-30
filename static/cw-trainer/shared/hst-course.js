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
 *   HST.course.fileSpeeds(base) the speeds that file comes at ('QSO101' -> [10, 13, 15, 18, 20, 25])
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
        // session, and each day is a list of tasks in the curriculum's order
        // (Tim, 2026-10-30, second pass), written as tokens:
        //   warmup, drill, exercise   send that Daily Morse Code Scale
        //   WD101-10*2                copy that CWops audio file 2 times (the
        //                             curriculum's name; *1-2 once or twice,
        //                             *n several times)
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
  // The speeds a file comes at ('WD101' -> [10, 13, 15, 18, 20, 25]). The
  // CWT files come at one speed; QSO 107 has no 25 WPM file.
  var CWA_SPEEDS = [10, 13, 15, 18, 20, 25];
  function fileSpeeds(base) {
    var one = Object.keys(CWA_OLDER).filter(function (k) { return k.slice(0, k.indexOf('-')) === base; });
    if (one.length) return one.map(function (k) { return Number(k.slice(k.indexOf('-') + 1)); });
    return base === 'QSO107' ? CWA_SPEEDS.slice(0, 5) : CWA_SPEEDS;
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
     CLASS PROGRESS (Tim, 2026-10-30): the date each task (or class) was
     ticked Done, how many times it was redone, and for an audio file the
     speed picked. Kept per course level ('cwa:intermediate'), so switching
     levels and back loses nothing. Keys: '3.1.WD103' = session 3, day 1,
     that task (courses that list the days: the scale, the file without its
     speed, or icr, mr, wpx, cwt), '3' = class 3.
       HST.course.progress.get(courseKey)  { '3.1.WD103': { done: 'YYYY-MM-DD', redo: 2, sp: 15 }, ... }
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
