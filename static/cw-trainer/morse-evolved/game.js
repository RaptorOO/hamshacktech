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
     DIFFICULTY MODES (spec section 4; copy speeds set by Tim 2026-11-06:
     Hiker 20/5, Park Ranger 25/10, SpaceY Scientist 30/20)
     wpm = character speed, fwpm = effective (Farnsworth) copy speed,
     sendWpm = keyer speed for the player's sending.
     --------------------------------------------------------------------- */
  var MODES = {
    hiker:     { label: 'Hiker',            wpm: 20, fwpm: 5,  sendWpm: 8,  noise: 0,  qsb: false },
    ranger:    { label: 'Park Ranger',      wpm: 25, fwpm: 10, sendWpm: 15, noise: 22, qsb: false },
    scientist: { label: 'SpaceY Scientist', wpm: 30, fwpm: 20, sendWpm: 22, noise: 40, qsb: true }
  };
  /* THE STATIONS, worked in order (Tim, 2026-11-06: after a contact,
     go back to the radio for the next one, not to the start screen).
     Each QSO is a little scene (spec section 9: every operator has a
     personality -- Xander a curious kid, Elena a sarcastic explorer,
     Grizz a grumpy salvager -- and Roger reacts with short, funny
     comments). A QSO is a list of steps, per difficulty:
       { rx: text, say: line }   they send; you copy it; Roger reacts
       { tx: text }               you key your reply
       { rx: text, signoff: 1 }  their sign-off; copy it too
     The first copy has to get the station's name. Higher difficulties
     have longer exchanges, as the spec asks. */
  /* QSO FORMAT (Tim, 2026-11-06: "find a good QSO pattern and revise all
     the scripts"). The standard CW contact, as published for new
     operators (morsecode.world/qso-formats.html; LICW CW QSO Protocol):
       1. CQ CQ CQ DE <call> <call> K           they call
       2. <call> DE <us> <us> K                   you answer
       3. <us> DE <call> ... UR RST ... NAME ... QTH ... HW? ... KN
       4. <call> DE <us> R TNX ... UR RST ... NAME ... QTH ... KN
       5. rag chew, turns handed over with <BK>   (the jokes live here)
       6. TNX FER QSO ... 73 <us> DE <call> <SK>  they sign off
       7. 73 <call> DE <us> <SK>                  you sign off
     K = over, KN = over to you only, BK = back to you (quick turn),
     SK = end of contact. Hiker keeps each turn short; Ranger adds the
     labels and repeats; Scientist sends everything twice like a real
     DX exchange. Roger's call sign is TL1R. Each copy step needs its
     'fact' (the call sign, then the name) or 70% to go on. */
  var MYCALL = 'TL1R';
  var CONTACTS = [
    // Xander, KR3X: a three-year-old alien boy on Korr moon base
    { name: 'XANDER', call: 'KR3X', portrait: 'contact-xander-kid', done: 'nicekid', steps: {
      hiker: [
        { rx: 'CQ CQ DE KR3X KR3X K', say: 'cq_answer', fact: 'KR3X' },
        { tx: 'KR3X DE TL1R K' },
        { rx: 'TL1R DE KR3X R UR 579 NAME XANDER QTH KORR <BK>', say: 'xander', fact: 'XANDER' },
        { tx: '<BK> R UR 599 NAME ROGER QTH NM <BK>' },
        { rx: '<BK> ROGER ROGER HI HI I AM 3 <BK>', say: 'x_age', face: 'laugh' },
        { tx: '<BK> FB UR CW IS GUD <BK>' },
        { rx: '<BK> TNX NAP TIME 73 TL1R DE KR3X <SK>', signoff: 1, say: 'x_nap', face: 'laugh' },
        { tx: '73 KR3X DE TL1R <SK>' } ],
      ranger: [
        { rx: 'CQ CQ CQ DE KR3X KR3X K', say: 'cq_answer', fact: 'KR3X' },
        { tx: 'KR3X DE TL1R TL1R K' },
        { rx: 'TL1R DE KR3X GE TNX FER CALL UR RST 579 579 NAME XANDER XANDER QTH KORR MOON BASE HW? TL1R DE KR3X KN', say: 'xander', fact: 'XANDER' },
        { tx: 'KR3X DE TL1R R TNX UR RST 599 NAME ROGER QTH NM HW? KR3X DE TL1R KN' },
        { rx: 'TL1R DE KR3X R FB ROGER NM? IS THAT A MOON? <BK>', say: 'x_r3', face: 'laugh' },
        { tx: '<BK> NO A DESERT <BK>' },
        { rx: '<BK> HI HI I AM 3 AND A HALF <BK>', say: 'x_age2', face: 'amused' },
        { tx: '<BK> FB UR CW IS GUD <BK>' },
        { rx: '<BK> TNX MOM SEZ BED 73 TL1R DE KR3X <SK>', signoff: 1, say: 'x_bed', face: 'laugh' },
        { tx: '73 KR3X DE TL1R <SK>' } ],
      scientist: [
        { rx: 'CQ CQ CQ DE KR3X KR3X KR3X K', say: 'cq_answer', fact: 'KR3X' },
        { tx: 'KR3X DE TL1R TL1R K' },
        { rx: 'TL1R DE KR3X GE OM TNX FER CALL UR RST 569 569 QSB NAME XANDER XANDER QTH KORR MOON BASE KORR MOON BASE HW CPY? TL1R DE KR3X KN', say: 'xander', fact: 'XANDER' },
        { tx: 'KR3X DE TL1R R R TNX XANDER UR RST 599 599 NAME ROGER ROGER QTH CRASHED NM CRASHED NM PSE QSP TELLURA HW? KR3X DE TL1R KN' },
        { rx: 'TL1R DE KR3X R SRI ROGER NEVER HRD OF TELLURA MOM SEZ IM NOT ALLOWED TO WORK DX <BK>', say: 'x_s2', face: 'laugh' },
        { tx: '<BK> HW OLD R U? <BK>' },
        { rx: '<BK> I AM 3 BUT I CAN COPY 40 WPM <BK>', say: 'x_s3', face: 'frustrated' },
        { tx: '<BK> FB TNX FER QSO GL <BK>' },
        { rx: '<BK> GL ROGER HOPE U GET HOME 73 TL1R DE KR3X <SK>', signoff: 1 },
        { tx: '73 KR3X DE TL1R <SK>' } ] } },
    // Elena, SK5E: a sarcastic five-year-old alien girl explorer
    { name: 'ELENA', call: 'SK5E', portrait: 'contact-elena-kid', done: 'keepscan', steps: {
      hiker: [
        { rx: 'CQ CQ DE SK5E SK5E K', say: 'cq_answer', fact: 'SK5E' },
        { tx: 'SK5E DE TL1R K' },
        { rx: 'TL1R DE SK5E R UR 449 NAME ELENA QTH SKARR <BK>', say: 'e_found', fact: 'ELENA' },
        { tx: '<BK> R UR 599 NAME ROGER QTH NM <BK>' },
        { rx: '<BK> 599? UR SLOW <BK>', say: 'e_h2', face: 'frustrated' },
        { tx: '<BK> SRI <BK>' },
        { rx: '<BK> I AM 5 <BK>', say: 'e_age', face: 'amused' },
        { tx: '<BK> WOW FB <BK>' },
        { rx: '<BK> BYE 73 TL1R DE SK5E <SK>', signoff: 1, say: 'e_bye', face: 'laugh' },
        { tx: '73 SK5E DE TL1R <SK>' } ],
      ranger: [
        { rx: 'CQ CQ CQ DE SK5E SK5E K', say: 'cq_answer', fact: 'SK5E' },
        { tx: 'SK5E DE TL1R TL1R K' },
        { rx: 'TL1R DE SK5E GE UR RST 459 459 NAME ELENA ELENA QTH SKARR CAVES HW? TL1R DE SK5E KN', say: 'e_found', fact: 'ELENA' },
        { tx: 'SK5E DE TL1R R TNX UR RST 579 NAME ROGER QTH NM HW? SK5E DE TL1R KN' },
        { rx: 'TL1R DE SK5E R ROGER? THATS A NAME? <BK>', say: 'e_r2', face: 'amused' },
        { tx: '<BK> YES IT IS <BK>' },
        { rx: '<BK> OK I AM 5 AND I EXPLORE CAVES <BK>', say: 'e_r3', face: 'laugh' },
        { tx: '<BK> FB ELENA TNX FER QSO <BK>' },
        { rx: '<BK> OK ROGER 73 TL1R DE SK5E <SK>', signoff: 1 },
        { tx: '73 SK5E DE TL1R <SK>' } ],
      scientist: [
        { rx: 'CQ CQ CQ DE SK5E SK5E SK5E K', say: 'cq_answer', fact: 'SK5E' },
        { tx: 'SK5E DE TL1R TL1R K' },
        { rx: 'TL1R DE SK5E GE UR RST 459 459 NAME ELENA ELENA QTH SKARR STATION SKARR STATION HW? TL1R DE SK5E KN', say: 'e_found', fact: 'ELENA' },
        { tx: 'SK5E DE TL1R R TNX ELENA UR RST 579 579 NAME ROGER ROGER QTH CRASHED NM PSE QSP TELLURA HW? SK5E DE TL1R KN' },
        { rx: 'TL1R DE SK5E CRASHED AGN? THATS UR 3RD THIS YR ROGER <BK>', say: 'e_s2', face: 'laugh' },
        { tx: '<BK> NOT MY FAULT <BK>' },
        { rx: '<BK> MY DAD SEZ ONLY BAD PILOTS CRASH <BK>', say: 'e_s3', face: 'frustrated' },
        { tx: '<BK> TNX FER QSO ELENA <BK>' },
        { rx: '<BK> SURE ROGER NO TELLURA HR GL 73 TL1R DE SK5E <SK>', signoff: 1 },
        { tx: '73 SK5E DE TL1R <SK>' } ] } },
    // Grizz, RB9G: a grumpy salvage operator who uses heavy abbreviations
    { name: 'GRIZZ', call: 'RB9G', portrait: 'contact-grizz', done: 'keepscan', steps: {
      hiker: [
        { rx: 'CQ CQ DE RB9G RB9G K', say: 'cq_answer', fact: 'RB9G' },
        { tx: 'RB9G DE TL1R K' },
        { rx: 'TL1R DE RB9G UR 339 NAME GRIZZ QTH RUST BELT <BK>', say: 'g_found', fact: 'GRIZZ' },
        { tx: '<BK> R UR 599 NAME ROGER QTH NM <BK>' },
        { rx: '<BK> QRL <BK>', say: 'g_h2', face: 'amused' },
        { tx: '<BK> SRI <BK>' },
        { rx: '<BK> U HV SCRAP? <BK>', say: 'g_h3', face: 'laugh' },
        { tx: '<BK> NO <BK>' },
        { rx: '<BK> CUL 73 TL1R DE RB9G <SK>', signoff: 1 },
        { tx: '73 RB9G DE TL1R <SK>' } ],
      ranger: [
        { rx: 'CQ CQ CQ DE RB9G RB9G K', say: 'cq_answer', fact: 'RB9G' },
        { tx: 'RB9G DE TL1R TL1R K' },
        { rx: 'TL1R DE RB9G UR RST 339 339 NAME GRIZZ GRIZZ QTH RUST BELT MINE HW? TL1R DE RB9G KN', say: 'g_found', fact: 'GRIZZ' },
        { tx: 'RB9G DE TL1R R TNX UR RST 579 NAME ROGER QTH NM HW? RB9G DE TL1R KN' },
        { rx: 'TL1R DE RB9G R WAT U WANT <BK>', say: 'g_r2', face: 'amused' },
        { tx: '<BK> SHIP CRASHED <BK>' },
        { rx: '<BK> SHIP? I BUY SCRAP <BK>', say: 'g_r3', face: 'laugh' },
        { tx: '<BK> NO TNX <BK>' },
        { rx: '<BK> LAST OFFER 10 CR <BK>', say: 'g_r4', face: 'frustrated' },
        { tx: '<BK> NO <BK>' },
        { rx: '<BK> UR LOSS 73 TL1R DE RB9G <SK>', signoff: 1 },
        { tx: '73 RB9G DE TL1R <SK>' } ],
      scientist: [
        { rx: 'CQ CQ CQ DE RB9G RB9G RB9G K', say: 'cq_answer', fact: 'RB9G' },
        { tx: 'RB9G DE TL1R TL1R K' },
        { rx: 'TL1R DE RB9G UR RST 339 339 NAME GRIZZ GRIZZ QTH RUST BELT MINE RUST BELT MINE HW? TL1R DE RB9G KN', say: 'g_found', fact: 'GRIZZ' },
        { tx: 'RB9G DE TL1R R TNX GRIZZ UR RST 579 579 NAME ROGER ROGER QTH CRASHED NM PSE QSP TELLURA HW? RB9G DE TL1R KN' },
        { rx: 'TL1R DE RB9G NO TELLURA HR WL BUY UR WRECK 5 CR <BK>', say: 'g_s2', face: 'laugh' },
        { tx: '<BK> NO DEAL <BK>' },
        { rx: '<BK> OK 10 CR AND A SANDWICH <BK>', say: 'g_s3', face: 'amused' },
        { tx: '<BK> STILL NO <BK>' },
        { rx: '<BK> UR LOSS 73 TL1R DE RB9G <SK>', signoff: 1 },
        { tx: '73 RB9G DE TL1R <SK>' } ] } }
  ];
  var BANDS = { '40m': [7.000, 7.060], '20m': [14.000, 14.070], '10m': [28.000, 28.070] };

  var mode = null, modeKey = 'hiker', band = '20m';
  var phase = 'start';               // start | intro | ready | scanning | rx | copy | tx | signoff | logged
  var ci = 0, contact = null, steps = null, si = 0, txText = '';   // the station, its QSO steps, the step now
  var copyStage = 'rx', copyText = '', copyStart = 0;   // what's being copied, and where it starts on the page
  var stats = null;
  function newStats() { return { t0: Date.now(), firstAcc: null, bestAcc: 0, decoded: false, sends: 0, sendAcc: null, signoffAcc: null, copies: {} }; }
  var copyFails = 0, quipped = false;

  /* ---------------------------------------------------------------------
     ROGER'S TRANSLATOR (scripted lines, typed out; spec section 11)
     --------------------------------------------------------------------- */
  // Roger in the background: one scene picture per pose, faded in.
  /* ROGER'S REACTIONS (Tim, 2026-11-06: not arms-in-the-air every time;
     small nods and gestures for everyday moments, a laugh at punchlines,
     the big cheer saved for truly dramatic moments). Each "face" is a
     pose picture or a short sequence of them; 'react' picks one at random
     from the everyday set. After he finishes talking he settles back. */
  var SEQ = {
    nod:   [['nod', 320], ['neutral', 220], ['nod', 420], ['neutral', 0]],
    laugh: [['laugh', 520], ['amused', 160], ['laugh', 0]],
    talk:  [['talk', 0]], amused: [['amused', 0]], frustrated: [['frustrated', 0]],
    excited: [['excited', 0]], neutral: [['neutral', 0]]
  };
  var REACT = ['nod', 'talk', 'amused', 'nod', 'talk'];
  var poseTimer = null, lastReact = '';
  function pick(list) {
    var c = list.filter(function (x) { return x !== lastReact; });
    lastReact = c[Math.floor(Math.random() * c.length)];
    return lastReact;
  }
  function showPose(p) {
    document.querySelectorAll('.pose').forEach(function (im) { im.classList.toggle('on', im.dataset.pose === p); });
  }
  function pose(face) {
    if (face === 'react') face = pick(REACT);
    if (face === 'celebrating') face = 'excited';
    var seq = SEQ[face] || SEQ.neutral, i = 0;
    clearTimeout(poseTimer);
    (function step() {
      showPose(seq[i][0]);
      if (seq[i][1] && i < seq.length - 1) { poseTimer = setTimeout(function () { i++; step(); }, seq[i][1]); }
    })();
  }
  function settle(ms) { clearTimeout(poseTimer); poseTimer = setTimeout(function () { showPose('neutral'); }, ms || 1200); }

  /* ---------------------------------------------------------------------
     THE AI VOICE DECODER (Tim, 2026-11-06: "decode alien speech from Roger
     and speak it in an English voice"). Each line: Roger's alien speech,
     then the decoder's English voice (ElevenLabs, voice "Vector"). The
     clips are in audio/; the text below is only for captions (CC).
     --------------------------------------------------------------------- */
  var LINES = {
    online:  { file: 'line01', text: 'Translator… online.', device: true },
    hello:   { file: 'line02', text: 'Human! Over here. My ship came down hard, and my fingers are wrecked. I can’t work the key.' },
    scan:    { file: 'line03', text: 'This radio can reach my home world, Tellura. Pick a band, and hit SCAN.' },
    signal:  { file: 'line04', text: 'Signal! Copy it into the notebook. Type what you hear.' },
    noshame: { file: 'line05', text: 'Hey, no shame. That’s what the button’s for.' },
    xander:  { file: 'line06', text: 'Xander. Not Tellura… but he sounds friendly.' },
    quip:    { file: 'line07', text: 'You know, we do have the technology to perfectly decode CW. Just saying.' },
    answer:  { file: 'line08', text: 'Answer him. Key the reply on the transmit panel.' },
    close:   { file: 'line09', text: 'Close. Try that again.' },
    clean:   { file: 'line10', text: 'Clean sending! Well… your sending. My hands are in bandages.' },
    nicekid: { file: 'line11', text: 'Nice kid. Not Tellura, though. We’ll keep scanning.' },
    signoffcopy: { file: 'line12', text: 'They’re signing off. Copy that too.' },
    friendly: { file: 'line13', text: 'Not Tellura… but they sound friendly.' },
    keepscan: { file: 'line14', text: 'Good contact. Still not home. Let’s keep scanning.' },
    rescan:   { file: 'line15', text: 'Back to the radio. Pick a band, and scan again.' },
    allheard: { file: 'line16', text: 'That’s everyone on the bands tonight. Tellura is out there somewhere… we’ll find it.' },
    // Roger's reactions inside the QSOs (one clip each, file = key)
    x_h2:    { file: 'x_h2', text: 'He wants my name. Tell him it’s Roger. Obviously.' },
    x_h3:    { file: 'x_h3', text: 'Every human thinks that’s hilarious. Apparently so does every alien kid.' },
    x_r2:    { file: 'x_r2', text: 'His first contact? Great. We’re both new at this.' },
    x_r3:    { file: 'x_r3', text: 'Is New Mexico a moon… Honestly, some days it feels like one.' },
    x_s2:    { file: 'x_s2', text: 'His mom says he’s not allowed to work DX. …I respect that.' },
    e_found: { file: 'e_found', text: 'Elena. Not Tellura… and she’s already judging us.' },
    e_h2:    { file: 'e_h2', text: 'Ouch. She says we’re slow. In fairness… my fingers are in bandages.' },
    e_r2:    { file: 'e_r2', text: 'She’s making fun of my name. Rude… but fair.' },
    e_s2:    { file: 'e_s2', text: 'Third this year? That was ONE time! …Okay. Three times.' },
    g_found: { file: 'g_found', text: 'Grizz. Salvage operator. Grumpiest signal on the bands.' },
    g_h2:    { file: 'g_h2', text: 'QRL. He’s busy. Doing what? Counting rust?' },
    g_r2:    { file: 'g_r2', text: 'Charming. Tell him we crashed. He’ll love that.' },
    g_r3:    { file: 'g_r3', text: 'He wants to buy my ship for scrap. Absolutely not. …How much, though?' },
    g_s2:    { file: 'g_s2', text: 'Five credits for my ship? FIVE?! The cup holder alone is worth ten.' },
    cq_answer: { file: 'cq_answer', text: 'A CQ! Someone’s calling. Answer them: their call sign, then DE, then ours.' },
    callsign: { file: 'callsign', text: 'Oh, and on the air, my call sign is TL1R. Tango Lima One Romeo.' },
    x_age:   { file: 'x_age', text: 'He’s three. THREE! And his fist is better than mine.' },
    x_nap:   { file: 'x_nap', text: 'Nap time. Honestly… same.' },
    x_age2:  { file: 'x_age2', text: 'Three and a half. The half is very important at that age.' },
    x_bed:   { file: 'x_bed', text: 'His mom says it’s bedtime. Mine would too, if she saw what I did to the ship.' },
    x_s3:    { file: 'x_s3', text: 'Three years old, and he copies forty words a minute. I need to lie down.' },
    e_age:   { file: 'e_age', text: 'She’s five. Five years old… and still faster than us.' },
    e_bye:   { file: 'e_bye', text: 'Bye? That’s it? …Kids.' },
    e_r3:    { file: 'e_r3', text: 'She’s five, and she explores caves. At five, I was scared of my own antennae.' },
    e_s3:    { file: 'e_s3', text: 'Her dad says only bad pilots crash. Tell her dad… actually, don’t tell her dad anything.' },
    g_h3:    { file: 'g_h3', text: 'He wants to know if we have scrap. Look around, Grizz. We ARE scrap.' },
    g_r4:    { file: 'g_r4', text: 'Ten credits. He doubled it. …No. Stay strong, Roger.' },
    g_s3:    { file: 'g_s3', text: 'Ten credits AND a sandwich. …What kind of sandwich?' }
  };
  var ALIEN = { excited: 'alien-excited', celebrating: 'alien-excited', laugh: 'alien-excited', frustrated: 'alien-frustrated' };
  var clips = {};
  function clip(name) {
    if (!clips[name]) { clips[name] = new Audio('audio/' + name + '.mp3'); clips[name].preload = 'auto'; }
    return clips[name];
  }
  function preloadVoice() {
    Object.keys(LINES).forEach(function (k) { clip(LINES[k].file); });
    ['alien-neutral', 'alien-excited', 'alien-frustrated'].forEach(clip);
  }
  var VOICE_KEY = 'morse-evolved-voice', CC_KEY = 'morse-evolved-cc';
  var voiceVol = (function () { var v = null; try { v = localStorage.getItem(VOICE_KEY); } catch (e) {} v = v == null ? 85 : +v; return v >= 0 && v <= 100 ? v : 85; })();
  var ccOn = (function () { try { return localStorage.getItem(CC_KEY) === '1'; } catch (e) { return false; } })();

  var speechQ = [], speaking = false, current = null, speechToken = 0;
  function say(id, face, then) {
    speechQ.push({ line: LINES[id], face: face, then: then });
    if (!speaking) nextLine();
  }
  // Play one clip; resolves when it ends (or fails, so the game never stalls).
  function playClip(name, token) {
    return new Promise(function (resolve) {
      if (token !== speechToken) return resolve();
      var a = clip(name), done = false;
      function fin() { if (done) return; done = true; a.onended = a.onerror = null; current = null; resolve(); }
      current = a;
      a.volume = voiceVol / 100;
      try { a.currentTime = 0; } catch (e) {}
      a.onended = fin; a.onerror = fin;
      var p = a.play();
      if (p && p.catch) p.catch(fin);
      setTimeout(fin, 12000);              // safety net
    });
  }
  function decoderState(cls, label) {
    $('decoder').className = 'decoder' + (cls ? ' ' + cls : '');
    $('decoderState').textContent = label;
  }
  function nextLine() {
    var item = speechQ.shift();
    if (!item) { speaking = false; decoderState('', 'AI VOICE DECODER'); $('caption').textContent = ''; settle(1400); return; }
    speaking = true;
    var token = speechToken;
    if (item.face) pose(item.face);
    var first = item.line.device ? Promise.resolve()
      : (decoderState('alien', 'ROGER · DECODING'), playClip(ALIEN[item.face] || 'alien-neutral', token));
    first.then(function () {
      if (token !== speechToken) return;
      decoderState('english', 'ROGER · ENGLISH');
      $('caption').textContent = item.line.text;
      $('caption').hidden = !ccOn;
      return playClip(item.line.file, token);
    }).then(function () {
      if (token !== speechToken) return;
      setTimeout(function () {
        if (token !== speechToken) return;
        if (item.then) item.then();
        nextLine();
      }, 250);
    });
  }
  // Stop Roger mid-line (replaying the signal, quitting). Queued lines
  // are dropped; their follow-ups don't run.
  function hush() {
    speechToken++; speechQ = []; speaking = false;
    if (current) { try { current.pause(); } catch (e) {} current = null; }
    decoderState('', 'AI VOICE DECODER'); $('caption').textContent = '';
  }

  /* ---------------------------------------------------------------------
     SIGNAL DISPLAY: key-down intervals drawn as a scrolling trace that
     follows the actual keying (never shows decoded text).
     --------------------------------------------------------------------- */
  var marks = [];                    // { s, e } in performance.now() ms; e null while held
  var noisy = false;
  var canvas = $('wave'), g2 = canvas.getContext('2d');
  var WINDOW_MS = 4000;
  /* THE RADIO'S SMALL SCREEN: a spectrum waterfall (Tim, 2026-11-06: the
     contact's face moved to the big monitor). Each frame scrolls the
     picture down a line and paints the band across the top: noise, more
     of it on a noisy band, and a bright trace at the centre while a
     signal is keyed. */
  var fall = $('fall'), fg = fall.getContext('2d');
  function drawFall(on, now) {
    var W = fall.width, H = fall.height;
    fg.drawImage(fall, 0, 0, W, H - 1, 0, 1, W, H - 1);
    var row = fg.createImageData(W, 1), d = row.data, lvl = noisy ? 0.55 : 0.25;
    for (var x = 0; x < W; x++) {
      var v = Math.random() * lvl;
      var dist = Math.abs(x - W / 2);
      if (on && dist < 4) v = 0.9 + Math.random() * 0.1;
      else if (on && dist < 9) v = Math.max(v, 0.45);
      if (phase === 'scanning' && Math.random() < 0.03) v = 0.7;        // stations flashing past while scanning
      var i = x * 4;
      d[i] = 30 * v; d[i + 1] = 60 + 195 * v; d[i + 2] = 80 + 100 * v; d[i + 3] = 255;
    }
    fg.putImageData(row, 0, 0);
  }
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
    var onNow = false;
    for (var q = marks.length - 1; q >= 0; q--) { var mk = marks[q]; if (mk.s <= now && (mk.e == null || now < mk.e)) { onNow = true; break; } }
    drawFall(onNow, now);
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
    var p = HST.audio.playMorse(chars, { wpm: copyWpm, fwpm: fwpm, toneHz: sh.toneHz, volume: sh.volume });
    var t = HST.timing(copyWpm, fwpm), cursor = 50, t0 = performance.now();
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
  // Same marks, laid over your own text so your spaces stay where you put
  // them (the grading itself ignores spaces).
  function proHtml(text) {
    return text.split(/(<[A-Z]+>)/).map(function (part) {
      var m = /^<([A-Z]+)>$/.exec(part);
      return m ? '<span class="pro" title="prosign: send as one character">' + m[1] + '</span>' : part.replace(/[&<>]/g, function (x) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]; });
    }).join('');
  }
  function diffSpaced(ops, got) {
    var out = '', k = 0;
    function spaces() { while (k < got.length && got[k] === ' ') { out += '&nbsp;'; k++; } }
    ops.forEach(function (o) {
      if (o.op === 'del') { out += '<span class="miss">_</span>'; return; }
      spaces();
      out += '<span class="' + (o.op === 'ok' ? 'ok' : 'bad') + '">' + esc(got[k] || o.g) + '</span>';
      k++;
    });
    spaces();
    return out;
  }
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
  /* COPYING SPEED (Tim, 2026-11-06: changeable in Settings). Picking a
     player sets it to that player's defaults; Settings can change it. */
  var COPY_KEY = 'morse-evolved-copy';
  var copyWpm = 20, copyFwpm = 5;
  (function () { try { var c = JSON.parse(localStorage.getItem(COPY_KEY) || 'null'); if (c && c.wpm) { copyWpm = c.wpm; copyFwpm = c.fwpm; } } catch (e) {} })();
  function setCopy(w, f) {
    copyWpm = Math.max(5, Math.min(40, Math.round(w)));
    copyFwpm = Math.max(3, Math.min(copyWpm, Math.round(f)));
    try { localStorage.setItem(COPY_KEY, JSON.stringify({ wpm: copyWpm, fwpm: copyFwpm })); } catch (e) {}
    if (mode) $('modeLabel').textContent = mode.label + ' · ' + copyWpm + '/' + copyFwpm + ' wpm';
  }
  function unitMs() { return following() ? HST.adapterKeying.get().unitMs : 1200 / sendWpm; }

  var txFailed = false, live = '', txMarks = [], downAt = null, lastUp = 0, detachKeys = null, autoTimer = null;
  var keyer = HST.createKeyer({ key: onKey, wpm: function () { return sendWpm; }, adapterKeying: function () { decoder.reset(); testDecoder.reset(); renderTestNote(); } });
  var decoder = HST.createDecoder({
    unitMs: unitMs,
    adaptive: adaptive,
    spaceRatio: function () { return 0.85; },   // a pause of ~4.25 dits starts a new word in the live readout
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
    if (phase !== 'tx') { if (down) notYourTurn(); return; }
    if (down) {
      // Roger never talks over your keying (Tim, 2026-11-06), and keying
      // again after a miss starts a fresh attempt.
      if (speaking) hush();
      if (txFailed) { txFailed = false; clearSend(); $('txResult').innerHTML = ''; }
      clearTimeout(autoTimer);
      downAt = t; decoder.down(t);
      marks.push({ s: t, e: null });
    } else if (downAt != null) {
      txMarks.push({ s: downAt, e: t }); downAt = null; lastUp = t;
      decoder.up(t);
      for (var i = marks.length - 1; i >= 0; i--) if (marks[i].e == null) { marks[i].e = t; break; }
    }
  }
  // Keying when it isn't your turn: a gentle note after a few presses.
  var offTurn = 0, toastTimer = null;
  function notYourTurn() {
    if (++offTurn < 3) return;
    offTurn = 0;
    var msg = phase === 'rx' ? 'Listen first — ' + (contact ? contact.name.charAt(0) + contact.name.slice(1).toLowerCase() : 'they') + ' is sending.'
      : phase === 'copy' ? 'Copy what you heard into the notebook first. You’ll send after that.'
      : 'Not your turn to transmit yet.';
    $('toast').textContent = msg; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('toast').hidden = true; }, 3500);
  }
  /* WHAT YOU SENT, WITH YOUR SPACING (Tim, 2026-11-06: careful word
     spacing still came out run together). Re-read the attempt's marks:
     the analyzer gives every gap between letters in dit lengths; a word
     break is a pause clearly longer than this sender's own letter gaps
     (at least 3.6 dits and 1.35 x their typical letter gap), and the
     biggest of those, as many as the message has word breaks, win. */
  function spacedText(target) {
    if (txMarks.length < 1) return live;
    var a = HST.analyzeSending(txMarks, { unitMs: unitMs(), automatic: HST.keyerAutomatic(), expectWords: 1 });
    if (!a || !a.chars || !a.chars.length) return live;
    var gaps = (a.gaps || []).map(function (g) { return { after: g.after, units: g.units }; });
    var sorted = gaps.map(function (g) { return g.units; }).sort(function (x, y) { return x - y; });
    var want = Math.max(0, plain(target).trim().split(/\s+/).length - 1);
    // This sender's typical letter gap: the middle of the gaps that aren't
    // the (want) biggest ones -- those are probably the word breaks.
    var letters = sorted.slice(0, Math.max(1, sorted.length - want));
    var median = letters.length ? letters[Math.floor((letters.length - 1) / 2)] : 3;
    var cand = gaps.filter(function (g) { return g.units >= 3.6 && g.units >= 1.35 * median; })
      .sort(function (x, y) { return y.units - x.units; });
    var breaks = {};
    cand.forEach(function (g, i) { if (i < want || g.units >= 6.5) breaks[g.after] = true; });
    return a.chars.map(function (c, i) { return c.text + (breaks[i] ? ' ' : ''); }).join('');
  }
  function showLive() { $('txLive').textContent = live || ' '; }
  function scheduleAutoCheck() {
    // Check by itself once they've sent as many characters as the target.
    var want = plain(txText).replace(/\s/g, '').length;
    if (live.replace(/\s/g, '').length >= want) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(checkSend, unitMs() * 8);
    }
  }
  // (No on-screen DIT/DAH keys: Tim, 2026-11-06 -- nobody can really key
  // on them, and they took up room. Keys, paddles and adapters only.)
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
  function seg(setting, value) {
    document.querySelectorAll('.seg[data-setting="' + setting + '"] button').forEach(function (b) {
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', b.dataset.v === value ? 'true' : 'false');
    });
  }
  function renderSetup() {
    var s = HST.keyerSettings.get();
    seg('keyType', s.keyType);
    seg('adapter', s.adapter);
    ['swapIn', 'swap2In'].forEach(function (id) { $(id).checked = !!s.reversed; $(id).disabled = s.keyType === 'straight'; });
    ['sendWpmIn', 'sendWpm2In'].forEach(function (id) { $(id).value = sendWpm; $(id).disabled = following(); });
    $('sendWpmVal').textContent = $('sendWpm2Val').textContent = sendWpm + ' wpm';
    $('testHow').textContent = s.keyType === 'straight' ? 'Left Ctrl or [ is the key'
      : 'Left Ctrl or [ = ' + (s.reversed ? 'dah' : 'dit') + ', Right Ctrl or ] = ' + (s.reversed ? 'dit' : 'dah');
    renderTestNote();
  }
  function renderTestNote() {
    var s = HST.keyerSettings.get(), n = '';
    if (following()) n = 'Your adapter is doing the keying itself, at about <b>' + Math.round(1200 / HST.adapterKeying.get().unitMs) +
      ' wpm</b>, so the speed slider doesn’t apply. Change its speed in Vail Zoomer.';
    else if (s.keyType === 'straight') n = 'Straight key: send at your own pace; the game learns your speed. The slider is just its first guess.';
    else if (s.keyType === 'bug') n = 'Bug: the dit side makes dits at the slider’s speed; dahs are yours.';
    $('testNote').innerHTML = n;
    $('settingsKeyNote').innerHTML = n;
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
  document.querySelectorAll('.seg[data-setting] button').forEach(function (b) {
    b.addEventListener('click', function () {
      var o = {}; o[b.parentNode.dataset.setting] = b.dataset.v; HST.keyerSettings.set(o);
    });
  });
  ['swapIn', 'swap2In'].forEach(function (id) {
    $(id).addEventListener('change', function () { HST.keyerSettings.set({ reversed: this.checked }); });
  });
  ['sendWpmIn', 'sendWpm2In'].forEach(function (id) {
    $(id).addEventListener('input', function () { setSendWpm(+this.value); keyer.reset(); renderSetup(); refreshTx(); });
  });
  $('testClear').addEventListener('click', clearTest);
  function refreshTx() { if (phase === 'tx') $('txHelp').textContent = keyHelp(); }
  HST.keyerSettings.onChange(function () { keyer.reset(); decoder.reset(); clearTest(); renderSetup(); refreshTx(); });
  HST.adapterKeying.onChange(function () { decoder.reset(); testDecoder.reset(); renderSetup(); refreshTx(); });

  /* ---------------------------------------------------------------------
     MISSION FLOW
     --------------------------------------------------------------------- */
  function startMission() {
    HST.audio.unlock();
    preloadVoice();
    mode = MODES[modeKey];
    $('modeLabel').textContent = mode.label + ' · ' + copyWpm + '/' + copyFwpm + ' wpm';
    $('startCard').hidden = true;
    keyer.reset();
    ci = 0;
    phase = 'intro';
    lockRadio(true);
    say('online', 'neutral');
    say('hello', 'frustrated');
    say('scan', 'talk');
    say('callsign', 'talk', readyToScan);
  }
  function readyToScan() {
    phase = 'ready'; lockRadio(false);
    $('replayBtn').disabled = $('slowBtn').disabled = $('decodeBtn').disabled = true;
    $('scanBtn').focus();
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
    contact = CONTACTS[ci]; steps = contact.steps[modeKey]; si = 0; stats = newStats();
    copyFails = 0; quipped = false; reacted = -1;
    bandNoise(mode.noise, mode.qsb);
    setStatus('SIGNAL');
    var mon = $('monImg');                                  // the big contact monitor
    mon.style.backgroundImage = 'url(art/' + contact.portrait + '.webp)'; mon.hidden = false; $('monStatic').hidden = true;
    $('monName').textContent = '';
    mon.classList.remove('flicker'); void mon.offsetWidth; mon.classList.add('flicker');
    $('copyIn').value = ''; $('copyMsg').innerHTML = '';     // a fresh page for a new station
    phase = 'rx';
    // The CW starts once Roger has finished talking, so the two never overlap.
    say('signal', 'talk', function () { setTimeout(runStep, 500); });
  }

  // Copy a transmission: their call ('rx') or their sign-off ('signoff').
  // The notebook opens the moment the signal starts, so you can write the
  // letters down as you hear them (Tim, 2026-11-06). The sign-off goes on
  // the next line of the same page, and only that part is graded.
  // Run the QSO step si: copy what they send, or key your reply.
  function runStep() {
    var st = steps[si];
    if (!st) { contactDone(); return; }
    if (st.tx) enterSend(st.tx);
    else if (st.signoff) say('signoffcopy', 'talk', function () { setTimeout(function () { startCopy(st); }, 300); });
    else startCopy(st);
  }
  // Copy one of their transmissions. The notebook opens the moment the
  // signal starts, so you can write as you hear (Tim, 2026-11-06). Each
  // transmission goes on a new line; only that part is graded. A nearly
  // full page is turned to a fresh one first.
  function startCopy(st) {
    copyStage = st.signoff ? 'signoff' : si === 0 ? 'rx' : 'mid';
    copyText = st.rx;
    var ta = $('copyIn');
    if (pageFull()) ta.value = '';
    if (ta.value && !/\n$/.test(ta.value)) ta.value += '\n';
    copyStart = ta.value.length;
    phase = 'rx';
    $('submitBtn').disabled = true; $('nextBtn').hidden = true; $('copyMsg').innerHTML = '';
    copyFails = 0;
    openNotebook();
    setStatus('RECEIVING');
    playCW(copyText, copyFwpm).then(function () { if (phase === 'rx') enterCopy(); });
  }
  function pageFull() {          // the writing already reaches past ~60% of the page
    var w = $('writing'), probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:1em';
    w.appendChild(probe);
    var bottom = probe.offsetTop + probe.offsetHeight;
    w.removeChild(probe);
    return bottom > w.clientHeight * 0.6;
  }
  function openNotebook() {
    var ta = $('copyIn');
    ta.disabled = false; ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    renderWriting();
  }
  function enterCopy() {
    phase = 'copy';
    var ta = $('copyIn');
    if (ta.disabled) { ta.disabled = false; ta.focus(); }
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
    $('hintLine').hidden = !!v || (phase !== 'copy' && phase !== 'rx');
    $('paper').classList.toggle('focus', caretAt >= 0);
  }
  // Rule the page to match the writing: line spacing = the writing's line
  // height, and a line under each baseline (Tim, 2026-11-06: the pencil
  // has to sit on the lines). Measured with a probe at the first baseline.
  function ruleLines() {
    var w = $('writing'), paper = $('paper');
    var probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    var holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:0;right:0;top:0;visibility:hidden';
    holder.appendChild(document.createTextNode('X')); holder.appendChild(probe);
    w.appendChild(holder);
    var baseline = w.offsetTop + probe.offsetTop + 1;          // first baseline, in the paper's own pixels
    var lh = parseFloat(getComputedStyle(w).lineHeight);
    w.removeChild(holder);
    if (!lh || !isFinite(baseline)) return;
    paper.style.setProperty('--lineH', lh + 'px');
    paper.style.setProperty('--lineY', (baseline + 2) + 'px');   // the line just under the letters
  }
  window.addEventListener('resize', ruleLines);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ruleLines);
  ruleLines();
  ['input', 'keyup', 'click', 'select', 'focus', 'blur'].forEach(function (ev) { $('copyIn').addEventListener(ev, renderWriting); });
  document.addEventListener('selectionchange', function () { if (document.activeElement === $('copyIn')) renderWriting(); });
  $('paper').addEventListener('pointerdown', function (e) { if (e.target === $('paper') && !$('copyIn').disabled) { e.preventDefault(); $('copyIn').focus(); } });

  function replay(slow) {
    if (phase !== 'copy' && phase !== 'rx') return;
    // Slower keeps each letter at full speed and adds space between them (Farnsworth).
    var f = slow ? Math.max(3, Math.round(copyFwpm * 0.6)) : copyFwpm;
    hush();                              // the signal, not Roger, while you listen
    playCW(copyText, f);
    $('copyIn').focus();
  }

  function decodeReveal() {
    if (phase !== 'copy') return;
    stats.decoded = true;
    $('copyMsg').innerHTML = '<div class="r-head">DECODER</div><div class="diff"><span class="ok">' +
      esc(plain(copyText)).replace(/ /g, '&nbsp;') + '</span></div><div class="r-note">Free to use — no penalty.</div>';
    $('monName').textContent = contact.name;
    if (copyStage === 'rx') say('noshame', 'amused');
    afterCopy(true);
  }
  function showNext() {
    $('nextBtn').textContent = steps[si + 1] ? 'CONTINUE' : 'LOG CONTACT';
    $('nextBtn').hidden = false;
    $('nextBtn').focus();
  }
  // Copied: Roger reacts (once per step), and CONTINUE appears when he's done.
  // Copied well enough: Roger reacts, then the game moves on by itself
  // when your reply is next (Tim, 2026-11-06: after "UR NAME?" the reply
  // never came -- the CONTINUE button waited on Roger's line, and if his
  // line was cut short it never appeared). A safety timer makes sure it
  // always moves on; before a sign-off or the logbook, CONTINUE / LOG
  // CONTACT appears instead.
  var reacted = -1;
  function afterCopy(viaDecoder) {
    $('monName').textContent = contact.name;
    var line = steps[si].say, step = si, done = false;
    function proceed() {
      if (done || step !== si || phase !== 'copy') return;
      done = true;
      var nxt = steps[si + 1];
      if (nxt && nxt.tx) setTimeout(function () { if (step === si && phase === 'copy') next(); }, 500);
      else showNext();
    }
    if (line && reacted !== si && !viaDecoder) {
      reacted = si;
      $('nextBtn').hidden = true;
      say(line, steps[si].face || 'react', proceed);
      setTimeout(proceed, 15000);          // never stall, whatever happens to Roger's line
    } else proceed();
  }
  function checkCopy() {
    if (phase !== 'copy') return;
    var exp = norm(plain(copyText)), got = norm(plain($('copyIn').value.slice(copyStart).replace(/[<>]/g, '')));
    if (!got) { $('copyIn').focus(); return; }
    // Spaces don't count: TU73 is as good as TU 73 (Tim, 2026-11-06).
    var r = align(exp.replace(/ /g, ''), got.replace(/ /g, ''));
    if (copyStage === 'signoff') stats.signoffAcc = Math.max(stats.signoffAcc || 0, r.acc);
    else {
      stats.copies[si] = stats.copies[si] == null ? r.acc : stats.copies[si];
      if (stats.firstAcc == null) stats.firstAcc = r.acc;
      stats.bestAcc = Math.max(stats.bestAcc, r.acc);
    }
    var pct = Math.round(r.acc * 100);
    // Good enough: the station's name in their call, the 73 in a sign-off.
    // Good enough to go on: the station's name in their first call, the
    // 73 in a sign-off, and most of it (70%) anywhere else.
    var fact = steps[si].fact;
    var gotFact = fact ? got.replace(/ /g, '').indexOf(fact) >= 0
      : copyStage === 'signoff' ? (got.indexOf('73') >= 0 || r.acc >= 0.7) : r.acc >= 0.7;
    var what = fact === contact.call ? 'you have the call sign' : fact ? 'you have the name'
      : copyStage === 'signoff' ? 'you have the sign-off' : 'you have the gist';
    $('copyMsg').innerHTML = '<div class="r-head">' + (copyStage === 'signoff' ? 'SIGN-OFF' : 'COPY') + ' ACCURACY <b class="' + (r.acc === 1 ? 'good' : gotFact ? 'ok' : 'low') + '">' + pct + '%</b></div>' +
      '<div class="diff">' + diffSpaced(r.ops, got) + '</div>' +
      '<div class="r-note">' + (r.acc === 1 ? 'Perfect copy.'
        : gotFact ? 'Good enough — ' + what + '. Fix it up or continue.'
        : '<span class="warn">Red is wrong, _ is missing. Try REPLAY or SLOWER.</span>') + '</div>';
    if (gotFact || r.acc === 1) {
      afterCopy(false);
    } else {
      copyFails++;
      if (copyFails >= 2 && !quipped) {
        quipped = true;
        say('quip', 'frustrated');
      }
    }
  }
  function next() {
    if (phase !== 'copy') return;
    hush();
    si++;
    runStep();
  }

  function enterSend(text) {
    txText = text;
    phase = 'tx';
    HST.audio.stop();
    $('copyIn').disabled = true;
    renderWriting();
    $('submitBtn').disabled = true;
    $('nextBtn').hidden = true;
    $('copyMsg').textContent = '';
    lockRadio(true);
    $('txPanel').hidden = false;
    $('txTarget').innerHTML = proHtml(txText);   // prosigns drawn with a bar over them: send them run together
    $('txResult').innerHTML = '';
    $('txHelp').textContent = keyHelp();
    txFailed = false;
    clearSend();
    setStatus('TRANSMIT');
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
    var want = norm(plain(txText));
    live = spacedText(txText); showLive();         // your own spacing, read back accurately
    var sent = norm(plain(live));
    if (!sent) { $('txResult').innerHTML = '<span class="warn">Nothing heard yet — key the message.</span>'; return; }
    stats.sends++;
    // Content: compare without spaces (word spacing is reported, not failed).
    var r = align(want.replace(/ /g, ''), sent.replace(/ /g, ''));
    stats.sendAcc = r.acc;
    var html = '<div class="score">SENDING ACCURACY <b>' + Math.round(r.acc * 100) + '%</b></div>' + timingReport();
    // Short replies must be exact; a long exchange passes at 90% (a slip in
    // a long over is fine on the air -- the other op asks if they need to).
    var need = want.replace(/ /g, '').length > 20 ? 0.9 : 1;
    if (r.acc >= need) {
      if (r.acc < 1) html += '<div class="diff">' + diffHtml(align(want, sent).ops) + '</div><div class="muted">Close enough — they copied you.</div>';
      $('txResult').innerHTML = html;
      finishSend();
    } else {
      // No voice here: Roger stays quiet while you're keying. Just key it
      // again -- the next key-down starts a fresh attempt.
      txFailed = true;
      html += '<div class="diff">' + diffHtml(align(want, sent).ops) + '</div>' +
        '<div class="warn">Not quite. Just key it again — they’re still listening.</div>';
      $('txResult').innerHTML = html;
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

  // Sent correctly: on to their answer. Roger cheers on your last reply.
  function finishSend() {
    phase = 'signoff';
    keyer.reset();
    setTimeout(function () { $('txPanel').hidden = true; }, 1800);
    var lastTx = !steps.slice(si + 1).some(function (x) { return x.tx; });
    si++;
    if (lastTx) say('clean', 'react', function () { setTimeout(runStep, 300); });
    else setTimeout(runStep, 1500);
  }

  // Contact finished: log it, then back to the radio for the next station.
  function contactDone() {
    phase = 'logged';
    HST.audio.stop(); bandNoise(0);
    $('copyIn').disabled = true; renderWriting();
    $('nextBtn').hidden = true; $('submitBtn').disabled = true; lockRadio(true);
    setStatus('STANDBY');
    var last = ci >= CONTACTS.length - 1;
    var mins = Math.max(1, Math.round((Date.now() - stats.t0) / 60000));
    $('endTitle').innerHTML = 'CONTACT <span>LOGGED</span>';
    $('endStats').innerHTML =
      'Station: ' + contact.name + ' &middot; ' + mode.label + '<br>' +
      'Copy: ' + Math.round((stats.firstAcc || 0) * 100) + '% first try, ' + Math.round(stats.bestAcc * 100) + '% best' +
      (stats.decoded ? ' (decoder used)' : '') + '<br>' +
      'Sending: ' + (stats.sendAcc != null ? Math.round(stats.sendAcc * 100) + '%' : '–') +
      ' in ' + stats.sends + (stats.sends === 1 ? ' try' : ' tries') + '<br>' +
      'Sign-off copy: ' + (stats.signoffAcc != null ? Math.round(stats.signoffAcc * 100) + '%' : '–') + '<br>' +
      'Time: about ' + mins + ' min';
    $('endLede').textContent = last
      ? 'That’s every station on the bands for now. The Tellura rescue comes next.'
      : 'Contact ' + (ci + 1) + ' of ' + CONTACTS.length + '. Tellura is still out there.';
    $('againBtn').textContent = last ? 'PLAY AGAIN' : 'BACK TO THE RADIO';
    say(last ? 'allheard' : contact.done, last ? 'talk' : 'react');
    setTimeout(function () { $('endCard').hidden = false; $('againBtn').focus(); }, 600);
  }
  function backToRadio() {
    $('endCard').hidden = true;
    if (ci >= CONTACTS.length - 1) { location.reload(); return; }
    ci++;
    hush();
    $('monImg').hidden = true; $('monStatic').hidden = false; $('monName').textContent = '';
    $('copyMsg').innerHTML = ''; $('freqNum').textContent = '--.----';
    phase = 'intro';
    say('rescan', 'talk', readyToScan);
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
    b.addEventListener('click', function () { var m = MODES[b.dataset.mode]; pickMode(b.dataset.mode); setSendWpm(m.sendWpm); setCopy(m.wpm, m.fwpm); renderSetup(); });
  });
  document.querySelectorAll('.band-btn').forEach(function (b) {
    b.setAttribute('role', 'radio');
    b.addEventListener('click', function () { if (phase === 'ready' || phase === 'start' || phase === 'intro') pickBand(b.dataset.band); });
  });
  var saved = null;
  try { saved = localStorage.getItem('morse-evolved-mode'); } catch (e) {}
  pickMode(MODES[saved] ? saved : 'hiker');
  (function () { var has = null; try { has = localStorage.getItem(COPY_KEY); } catch (e) {} if (!has) setCopy(MODES[modeKey].wpm, MODES[modeKey].fwpm); })();
  pickBand('20m');

  /* SETTINGS PANEL (Tim, 2026-11-06): copying and sending speeds, tone,
     CW and voice volume, captions, and the key -- in place of the sliders
     that used to sit in the top bar. Changes apply straight away. */
  function renderSettings() {
    var sh = HST.shared.get();
    $('copyWpmIn').value = copyWpm; $('copyWpmVal').textContent = copyWpm + ' wpm';
    $('copyFwpmIn').max = copyWpm; $('copyFwpmIn').value = copyFwpm; $('copyFwpmVal').textContent = copyFwpm + ' wpm';
    $('toneIn').value = sh.toneHz; $('toneVal').textContent = sh.toneHz + ' Hz';
    $('volIn').value = sh.volume; $('volVal').textContent = sh.volume + '%';
    $('voiceIn').value = voiceVol; $('voiceVal').textContent = voiceVol + '%';
    $('ccIn').checked = ccOn;
    renderSetup();
  }
  $('copyWpmIn').addEventListener('input', function () { setCopy(+this.value, Math.min(copyFwpm, +this.value)); renderSettings(); });
  $('copyFwpmIn').addEventListener('input', function () { setCopy(copyWpm, +this.value); renderSettings(); });
  $('toneIn').addEventListener('input', function () { HST.shared.set({ toneHz: +this.value }); if (noisy) bandNoise(mode.noise, mode.qsb); renderSettings(); });
  $('volIn').addEventListener('input', function () { HST.shared.set({ volume: +this.value }); if (noisy) bandNoise(mode.noise, mode.qsb); renderSettings(); });
  $('voiceIn').addEventListener('input', function () {
    voiceVol = +this.value; if (current) current.volume = voiceVol / 100;
    try { localStorage.setItem(VOICE_KEY, String(voiceVol)); } catch (e) {}
    renderSettings();
  });
  $('ccIn').addEventListener('change', function () {
    ccOn = this.checked; $('caption').hidden = !ccOn;
    try { localStorage.setItem(CC_KEY, ccOn ? '1' : '0'); } catch (e) {}
  });
  $('caption').hidden = !ccOn;
  $('settingsBtn').addEventListener('click', function () { renderSettings(); $('settingsCard').hidden = false; $('settingsDone').focus(); });
  $('settingsDone').addEventListener('click', function () { $('settingsCard').hidden = true; });

  $('startBtn').addEventListener('click', startMission);
  $('scanBtn').addEventListener('click', scan);
  $('replayBtn').addEventListener('click', function () { replay(false); });
  $('slowBtn').addEventListener('click', function () { replay(true); });
  $('decodeBtn').addEventListener('click', decodeReveal);
  $('submitBtn').addEventListener('click', checkCopy);
  $('nextBtn').addEventListener('click', next);
  $('txDone').addEventListener('click', checkSend);
  $('txClear').addEventListener('click', function () { clearSend(); $('txResult').innerHTML = ''; });
  $('againBtn').addEventListener('click', backToRadio);
  // Quit (Tim, 2026-11-06): confirm, then back to the start screen.
  $('quitBtn').addEventListener('click', function () {
    if (phase === 'start') return;
    if (phase === 'logged') { location.reload(); return; }
    $('quitCard').hidden = false; $('quitNo').focus();
  });
  $('quitNo').addEventListener('click', function () { $('quitCard').hidden = true; });
  $('quitYes').addEventListener('click', function () {
    hush(); keyer.reset(); HST.audio.stop(); HST.audio.conditions(null);
    location.reload();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { $('quitCard').hidden = true; $('settingsCard').hidden = true; }
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
  /* The key is live the whole time (Tim, 2026-11-06: touching a paddle
     after the key test "glitched" and sending never worked again -- the
     game had stopped listening to the key the moment the mission started,
     until the transmit turn). Now your sidetone always answers the
     paddles; only the transmit turn is graded. */
  detachKeys = keyer.attachKeyboard(window);
  // A button clicked with the mouse doesn't keep keyboard focus, so a key
  // or adapter press can never "press" it again by accident.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (b && e.detail > 0) b.blur();
  });

  /* ---------------------------------------------------------------------
     SPARKS: a few embers dripping from the cut cables in the scene
     (the emitters sit on the sparking cables painted in the art).
     --------------------------------------------------------------------- */
  var sc = $('sparks'), sg = sc.getContext('2d'), embers = [];
  var EMITTERS = [[478, 18], [505, 8], [540, 30], [575, 12], [612, 40]];   // the cut cables over Roger in bridge-*.webp
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
    drawArcs(performance.now());
    requestAnimationFrame(sparkFrame);
  }
  /* ELECTRICAL ARCS (Tim, 2026-11-06): random crackling sparks up in the
     hanging wiring -- a jagged blue-white arc, a flash, a spray of hot
     sparks -- every second or few, somewhere across the top of the ship. */
  var arcs = [], nextArc = performance.now() + 1500;
  function arcPath(x, y, len) {
    var pts = [[x, y]], n = 6 + Math.floor(Math.random() * 5), dx = (Math.random() - 0.5) * len, dy = len * (0.5 + Math.random() * 0.5);
    for (var i = 1; i <= n; i++) pts.push([x + dx * i / n + (Math.random() - 0.5) * 14, y + dy * i / n + (Math.random() - 0.5) * 10]);
    return pts;
  }
  function drawArcs(now) {
    if (now > nextArc) {
      nextArc = now + 700 + Math.random() * 3200;
      var x = 120 + Math.random() * 1000, y = 10 + Math.random() * 150;
      arcs.push({ pts: arcPath(x, y, 30 + Math.random() * 50), t0: now, x: x, y: y });
      for (var k = 0; k < 14; k++) embers.push({ x: x, y: y + 10, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 2.5, life: 0.8 + Math.random() * 0.3 });
    }
    arcs = arcs.filter(function (a) {
      var age = now - a.t0;
      if (age > 260) return false;
      var flick = age < 60 || (age > 110 && age < 170) ? 1 : 0.35;
      sg.globalCompositeOperation = 'lighter';
      var glow = sg.createRadialGradient(a.x, a.y, 0, a.x, a.y, 70);
      glow.addColorStop(0, 'rgba(170,220,255,' + (0.35 * flick) + ')'); glow.addColorStop(1, 'rgba(120,180,255,0)');
      sg.fillStyle = glow; sg.fillRect(a.x - 70, a.y - 70, 140, 140);
      [[5, 'rgba(120,190,255,' + (0.35 * flick) + ')'], [1.6, 'rgba(235,245,255,' + flick + ')']].forEach(function (w) {
        sg.lineWidth = w[0]; sg.strokeStyle = w[1]; sg.beginPath();
        a.pts.forEach(function (p, i) { if (i) sg.lineTo(p[0], p[1]); else sg.moveTo(p[0], p[1]); });
        sg.stroke();
      });
      if (Math.random() < 0.5) a.pts = arcPath(a.x, a.y, 30 + Math.random() * 50);   // it crackles
      sg.globalCompositeOperation = 'source-over';
      return true;
    });
  }
  if (!calm) requestAnimationFrame(sparkFrame);
})();
