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
        sessions: [
          ['10', 'Word files and prefix sounds; QSO and POTA exchanges; ICR; Morse Runner'],
          ['10', 'Word files and suffix sounds; QSO and POTA exchanges; Morse Runner'],
          ['13', 'Word files, prefix and suffix sounds; QSO and POTA exchanges; ICR'],
          ['13', 'Word files, prefix and suffix sounds; QSO and POTA exchanges; Morse Runner'],
          ['13', 'Word files, prefix and suffix sounds; QSO and POTA exchanges'],
          ['13', 'Word files, prefix and suffix sounds; QSO and POTA exchanges'],
          ['15', 'Word files, prefix and suffix sounds; QSO and POTA exchanges'],
          ['15', 'Word files, prefix and suffix sounds; QSO and POTA exchanges'],
          ['15', 'Word files, prefix and suffix sounds; QSO and POTA exchanges'],
          ['15', 'Word files, prefix and suffix sounds; QSO and POTA exchanges'],
          ['18', 'Head copy of a short story (SS 101); QSO and POTA exchanges'],
          ['18', 'A short story (SS 103); Morse Runner in WPX contest mode'],
          ['18', 'CWT contest practice (CWT 201)'],
          ['20', 'CWT practice; listen to a live CWT'],
          ['20', 'CWT practice; Morse Runner in WPX contest mode'],
          ['25', 'CWT practice at 25 WPM; work a live CWT']
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

  HST.course = {
    PROGRAMS: PROGRAMS,
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
