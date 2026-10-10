/* =====================================================================
   Morse Code Jeopardy -- online rooms (Milestone 9a)

   Up to 20 people, each on their own device, play one board together.
   A "room" on the server (functions/rooms + workers/rooms) is the
   referee; this file is everything a player's app does:

     * Host Online Game / Join Online Game (by code or by link)
     * the invitation with Copy / Share
     * the players panel (join order, whose turn, who has answered)
     * the "It's your turn" card, with your call sign in Morse
     * playing each clue AT YOUR OWN SPEED, started at the same moment
       on every device (no audio is sent over the internet)
     * keying your answer, the 60-second countdown, and the reveal

   It reuses the single-device game's board, tiles and zoom card from
   index.html (renderBoard, openClue, closeClue...) and the CW Trainer's
   shared keyer, decoder and Morse audio (../shared/hst-*.js).
   ===================================================================== */
(function () {
  'use strict';

  const ROOM_KEY = 'mcj-room';        // the room this device is in: { code, pid, name, key }
  const PREFS_KEY = 'mcj-online';     // this player's choices: { name, charWpm, fwpm, step }
  const PREAMBLE = 'VVV';

  const O = window.Online = {
    active: false,     // true while this device is in an online room
    ws: null,
    room: null,        // { code, pid, name, key }
    st: null,          // the room's latest 'state' message
    offset: 0,         // server clock minus ours (ms)
    clue: null,        // the clue in play on this device: { c, r, dd, text, startAt, deadline, ... }
    lastTurnId: null,
    retry: 0,
    closedForGood: false
  };

  /* ---------------- small helpers ---------------- */
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function load(key, dflt) { try { return JSON.parse(localStorage.getItem(key) || 'null') || dflt; } catch (e) { return dflt; } }
  function save(key, val) { try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function serverNow() { return Date.now() + O.offset; }
  function newPid() {
    const b = new Uint8Array(12); crypto.getRandomValues(b);
    return Array.from(b, (x) => (x % 36).toString(36)).join('');
  }
  function me() { return O.st && O.st.players.find((p) => p.id === O.room.pid); }
  function isHost() { return O.st && O.room && O.st.hostId === O.room.pid; }

  /* ---------------- this player's speeds ----------------
     Each player copies at their own speed. A dollar row plays faster
     than the one above it by the host's "step" (e.g. +2 WPM per row). */
  function prefs() {
    const p = load(PREFS_KEY, {});
    let call = '';
    try { call = (JSON.parse(localStorage.getItem('hct-cw-qso-v1') || '{}').call || ''); } catch (e) {}
    const shared = window.HST && HST.shared ? HST.shared.get().wpm : 18;
    return {
      name: p.name || call || '',
      charWpm: Math.min(40, Math.max(5, Number(p.charWpm) || shared || 18)),
      fwpm: Math.max(0, Number(p.fwpm) || 0),
      step: p.step == null ? 2 : Math.max(0, Math.min(5, Number(p.step)))
    };
  }
  // Character and Farnsworth (overall) speed for a dollar row (0 = top row).
  function rowSpeeds(row) {
    const p = prefs(), step = O.st ? O.st.step : p.step;
    const wpm = Math.min(50, p.charWpm + row * step);
    const fw = p.fwpm ? Math.min(wpm, p.fwpm + row * step) : 0;
    return { wpm, fwpm: fw && fw < wpm ? fw : undefined, label: (fw && fw < wpm ? fw : wpm) + ' WPM' };
  }
  // How long HST.audio.playMorse will take for this text (same arithmetic).
  function morseMs(text, wpm, fwpm) {
    const t = HST.timing(wpm, fwpm), chars = String(text).split('');
    let ms = 50;   // playMorse's lead-in
    chars.forEach((ch, i) => {
      const last = i === chars.length - 1;
      if (ch === ' ') { if (!last) ms += 7 * t.ts; return; }
      const code = HST.MORSE[ch] || '';
      for (let k = 0; k < code.length; k++) { ms += (code[k] === '-' ? 3 : 1) * t.ta; if (k < code.length - 1) ms += t.ta; }
      if (!last && chars[i + 1] !== ' ') ms += 3 * t.ts;
    });
    return ms;
  }
  function audioOpts(sp) {
    return { wpm: sp.wpm, fwpm: sp.fwpm, toneHz: Number(el('tone').value) || 600, volume: Number(el('volume').value) || 80 };
  }
  // Browsers only allow sound after a tap; every button here calls this.
  function unlockAudio() {
    try { HST.audio.unlock(); } catch (e) {}
    try { state.audio.ensure(); } catch (e) {}
    el('soundHint').hidden = true;
  }

  /* =====================================================================
     ENTRY: the Online dialog (Host / Join) and your speeds
     ===================================================================== */
  function openOnlineDialog(mode, code) {
    const p = prefs();
    el('olName').value = p.name;
    el('olChar').value = p.charWpm; el('olCharVal').textContent = p.charWpm + ' WPM';
    fillFarnsworth(p.charWpm, p.fwpm);
    el('olStep').value = String(p.step);
    el('olCode').value = code || '';
    el('olError').textContent = '';
    setMode(mode || 'join');
    renderKeyLine();
    el('launchModal').classList.remove('show');
    el('onlineModal').classList.add('show');
    setTimeout(() => (mode === 'host' ? el('olName') : (code ? el('olName') : el('olCode'))).focus(), 50);
  }
  function setMode(mode) {
    el('onlineModal').dataset.mode = mode;
    el('olTabHost').setAttribute('aria-pressed', String(mode === 'host'));
    el('olTabJoin').setAttribute('aria-pressed', String(mode === 'join'));
  }
  // Fill a Farnsworth dropdown with overall speeds below the character
  // speed. "sel" is the select's id: olFw (entry dialog) or spFw (My speed).
  function fillFarnsworth(charWpm, fw, sel) {
    sel = sel || 'olFw';
    const opts = ['<option value="0">Off</option>'];
    for (let w = 5; w < charWpm; w++) opts.push('<option value="' + w + '">' + w + ' WPM overall</option>');
    el(sel).innerHTML = opts.join('');
    el(sel).value = fw && fw < charWpm ? String(fw) : '0';
  }
  /* My speed (in a room): change character / Farnsworth speed mid-game.
     rowSpeeds() reads the saved prefs fresh for every clue, so saving
     here is all it takes; the next clue plays at the new speed. */
  function openSpeedDialog() {
    const p = prefs();
    el('spChar').value = p.charWpm; el('spCharVal').textContent = p.charWpm + ' WPM';
    fillFarnsworth(p.charWpm, p.fwpm, 'spFw');
    el('speedModal').classList.add('show');
  }
  function saveSpeedDialog() {
    const p = load(PREFS_KEY, {});            // keep name and step as they are
    p.charWpm = Number(el('spChar').value);
    p.fwpm = Number(el('spFw').value);
    save(PREFS_KEY, p);
    el('speedModal').classList.remove('show');
  }
  function readDialog() {
    const name = el('olName').value.trim().toUpperCase().replace(/[^A-Z0-9 ./-]/g, '').slice(0, 16);
    const p = { name, charWpm: Number(el('olChar').value), fwpm: Number(el('olFw').value), step: Number(el('olStep').value) };
    save(PREFS_KEY, p);
    return p;
  }
  // Which key setup this device will answer with, and a way to change it.
  function renderKeyLine() {
    try {
      const k = HST.keyerSettings.get();
      const names = { iambicB: 'Paddles (iambic B)', iambicA: 'Paddles (iambic A)', straight: 'Straight key', bug: 'Bug' };
      const ad = { vail: 'Vail adapter', vband: 'VBand adapter', keyboard: 'No adapter: [ and ] keys or on-screen paddles' };
      el('olKey').textContent = ad[k.adapter] + ' · ' + names[k.keyType] + (k.keyType === 'straight' ? '' : ' · ' + k.wpm + ' WPM');
    } catch (e) { el('olKey').textContent = ''; }
  }

  async function hostRoom() {
    const p = readDialog();
    if (!p.name) { el('olError').textContent = 'Enter your name or call sign first.'; return; }
    unlockAudio();
    el('olError').textContent = 'Making a room…';
    try {
      const r = await fetch('/rooms/new', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Couldn’t make a room.');
      O.room = { code: j.code, pid: newPid(), name: p.name, key: j.hostKey };
      save(ROOM_KEY, O.room);
      el('onlineModal').classList.remove('show');
      connect();
    } catch (e) { el('olError').textContent = e.message || 'Couldn’t reach the server.'; }
  }

  async function joinRoom(codeArg) {
    const p = readDialog();
    const code = String(codeArg || el('olCode').value).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!p.name) { el('olError').textContent = 'Enter your name or call sign first.'; return; }
    if (!/^[A-Z]{3}[0-9]{3}$/.test(code)) { el('olError').textContent = 'A room code is 3 letters and 3 numbers, like QRX472.'; return; }
    unlockAudio();
    el('olError').textContent = 'Looking for room ' + code + '…';
    try {
      const j = await (await fetch('/rooms/info/' + code)).json();
      if (!j.exists) throw new Error('There’s no room ' + code + '. Check the code with your host.');
      if (j.full) throw new Error('Room ' + code + ' is full (20 players).');
      if (j.phase === 'over') throw new Error('That game has ended.');
      const prev = load(ROOM_KEY, null);
      // Rejoining the same room keeps your seat in the turn order.
      O.room = { code, pid: prev && prev.code === code ? prev.pid : newPid(), name: p.name, key: prev && prev.code === code ? prev.key : '' };
      save(ROOM_KEY, O.room);
      el('onlineModal').classList.remove('show');
      connect();
    } catch (e) { el('olError').textContent = e.message || 'Couldn’t reach the server.'; }
  }

  /* =====================================================================
     CONNECTION
     ===================================================================== */
  function connect() {
    enterOnlineMode();
    const r = O.room;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = proto + '//' + location.host + '/rooms/ws/' + r.code +
      '?pid=' + encodeURIComponent(r.pid) + '&name=' + encodeURIComponent(r.name) + (r.key ? '&key=' + encodeURIComponent(r.key) : '');
    setConn('Connecting…');
    let ws;
    try { ws = new WebSocket(url); } catch (e) { reconnectLater(); return; }
    O.ws = ws;
    ws.onopen = () => { O.retry = 0; setConn(''); syncClock(); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMessage(m); };
    ws.onclose = (ev) => {
      if (O.ws !== ws) return;
      O.ws = null;
      if (O.closedForGood) return;
      if (ev.code === 4003) { leave('The host removed you from the room.'); return; }
      if (ev.code === 4001) { setConn('This room is open on another screen.'); return; }
      reconnectLater();
    };
  }
  function reconnectLater() {
    const waits = [1000, 2000, 4000, 8000, 15000];
    const w = waits[Math.min(O.retry, waits.length - 1)];
    O.retry++;
    setConn('Connection lost — reconnecting…');
    clearTimeout(O.retryTimer);
    O.retryTimer = setTimeout(async () => {
      // A room that no longer exists can't be rejoined.
      try {
        const j = await (await fetch('/rooms/info/' + O.room.code)).json();
        if (!j.exists) { leave('That room has closed.'); return; }
      } catch (e) {}
      connect();
    }, w);
  }
  function send(obj) { if (O.ws && O.ws.readyState === 1) O.ws.send(JSON.stringify(obj)); }

  // Work out how far this device's clock is from the room's, so a clue
  // starts at the same moment everywhere. Several pings; the quickest
  // round trip gives the best estimate.
  let pings = [];
  function syncClock() {
    pings = [];
    for (let i = 0; i < 5; i++) setTimeout(() => send({ t: 'ping', c: Date.now() }), i * 250);
  }
  function gotPong(m) {
    const now = Date.now(), rtt = now - m.c;
    pings.push({ rtt, off: m.s - (m.c + rtt / 2) });
    pings.sort((a, b) => a.rtt - b.rtt);
    O.offset = pings[0].off;
  }

  function onMessage(m) {
    switch (m.t) {
      case 'pong': gotPong(m); break;
      case 'state': gotState(m); break;
      case 'clue': gotClue(m); break;
      case 'deadline': if (O.clue) O.clue.deadline = m.at; break;
      case 'reveal': gotReveal(m); break;
      case 'nudge': showTurnCard(true); break;
      case 'kicked': leave('The host removed you from the room.'); break;
    }
  }

  /* =====================================================================
     SCREEN: online mode on/off, the board, players panel, lobby, turn card
     ===================================================================== */
  function enterOnlineMode() {
    O.active = true;
    O.closedForGood = false;
    document.body.classList.add('online');
    el('playersPanel').hidden = false;
    el('launchModal').classList.remove('show');
    el('gameOverModal').classList.remove('show');
    cancelScheduledPlay();
    hideClueNow();
    el('roomCode').textContent = O.room.code;
    if (!O.keyerOn) startKeyer();
  }

  function leave(msg) {
    O.closedForGood = true;
    clearTimeout(O.retryTimer);
    if (O.ws) { try { O.ws.close(); } catch (e) {} }
    O.ws = null;
    save(ROOM_KEY, null);
    stopClue();
    // Back to the single-device game.
    O.active = false; O.st = null; O.room = null; O.clue = null; O.lastTurnId = null;
    document.body.classList.remove('online');
    el('playersPanel').hidden = true;
    el('turnCard').hidden = true; el('lobbyCard').hidden = true;
    el('gameOverModal').classList.remove('show');
    loadPools();
    newGame();
    if (msg) { el('noticeText').textContent = msg; el('noticeModal').classList.add('show'); }
    else el('launchModal').classList.add('show');
  }

  function setConn(text) { el('connNote').textContent = text; el('connNote').hidden = !text; }

  function gotState(m) {
    const prevPhase = O.st && O.st.phase;
    O.st = m;
    el('bankValue').textContent = money(m.bank);
    renderPlayers();
    renderOnlineBoard();
    renderLobby();
    // The clue card closes (shrinks into its tile) when the room moves on.
    if (m.phase === 'pick' || m.phase === 'lobby' || m.phase === 'over') { if (O.clue) stopClue(true); }
    if (m.phase === 'clue' && O.clue) renderAnswerArea();
    if (m.phase === 'pick') {
      if (m.turnId !== O.lastTurnId || prevPhase !== 'pick') { O.lastTurnId = m.turnId; showTurnCard(false); }
    } else el('turnCard').hidden = true;
    if (m.phase === 'over') {
      el('gameOverScore').textContent = money(m.bank);
      el('gameOverModal').classList.add('show');
    } else el('gameOverModal').classList.remove('show');
    el('hostSkip').hidden = !isHost() || m.phase !== 'pick';
    el('hostEnd').hidden = !isHost() || m.phase === 'over' || m.phase === 'lobby';
  }

  // The players panel: join order, host first. Whoever's turn it is is
  // highlighted; a tick shows who has answered the clue in play.
  function renderPlayers() {
    const st = O.st, list = el('playersList');
    el('playersCount').textContent = st.players.length;
    list.innerHTML = st.players.map((p, i) => {
      const cls = ['pl'];
      if (p.id === st.turnId && (st.phase === 'pick' || st.phase === 'clue' || st.phase === 'reveal')) cls.push('turn');
      if (!p.on) cls.push('off');
      if (p.id === O.room.pid) cls.push('me');
      const badges = (p.id === st.hostId ? '<span class="tag">host</span>' : '') +
        (st.phase === 'clue' && p.answered ? '<span class="done" title="Answered">✓</span>' : '') +
        (st.phase === 'clue' && !p.answered && p.inClue && p.on ? '<span class="wait" title="Still sending">…</span>' : '');
      const kick = isHost() && p.id !== O.room.pid ? '<button class="kick" data-kick="' + esc(p.id) + '" title="Remove ' + esc(p.name) + '">✕</button>' : '';
      return '<li class="' + cls.join(' ') + '"><span class="n">' + (i + 1) + '</span><span class="nm">' + esc(p.name) + '</span>' + badges + kick + '</li>';
    }).join('');
  }

  // Build the shared board from the room's state, labeled with THIS
  // player's own speed for each row.
  function renderOnlineBoard() {
    const st = O.st;
    if (!st.cats.length) { state.categories = []; state.board = []; renderBoard(); return; }
    state.categories = st.cats.map((name) => ({ name, lines: '' }));
    const playing = st.clue ? st.clue.c + ':' + st.clue.r : null;
    state.board = st.tiles.map((t) => ({
      cat: t.c, row: t.r, dollars: t.dollars, wpm: rowSpeeds(t.r).label.replace(' WPM', ''),
      answer: t.answer || '', plays: 0, slowUsed: 0, dailyDouble: false,
      status: t.used && (t.c + ':' + t.r) !== playing ? 'revealed' : 'idle',
      awarded: t.used && (t.c + ':' + t.r) !== playing ? t.points : 0,
      onlinePoints: t.points, onlineDd: t.dd, onlineUsed: t.used
    }));
    renderBoard();
    const myTurn = st.phase === 'pick' && st.turnId === O.room.pid;
    el('board').classList.toggle('locked', !myTurn);
  }

  // Called by index.html's tile click handler while online.
  O.tileClicked = function (cell) {
    const st = O.st;
    if (!st || st.phase !== 'pick' || st.turnId !== O.room.pid || cell.onlineUsed) return;
    unlockAudio();
    el('turnCard').hidden = true;
    send({ t: 'pick', c: cell.cat, r: cell.row });
  };

  function renderLobby() {
    const st = O.st, card = el('lobbyCard');
    if (st.phase !== 'lobby') { card.hidden = true; return; }
    card.hidden = false;
    el('lobbyCode').textContent = st.code;
    el('lobbyWho').textContent = st.players.length === 1 ? 'Just you so far.' : st.players.length + ' players here.';
    el('lobbyStart').hidden = !isHost();
    el('lobbyWait').hidden = isHost();
  }

  // "It's your turn" -- a card over the board, plus your call sign in Morse.
  function showTurnCard(nudge) {
    const st = O.st;
    if (!st || st.phase !== 'pick') return;
    const p = st.players.find((x) => x.id === st.turnId);
    if (!p) return;
    const mine = p.id === O.room.pid, card = el('turnCard');
    card.classList.toggle('mine', mine);
    el('turnName').textContent = p.name;
    el('turnMsg').textContent = mine ? 'It’s your turn. Please select a tile.' : 'is choosing a tile.';
    el('turnKicker').textContent = mine ? '' : 'Up next';
    card.hidden = false;
    if (nudge) { card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse'); }
    if (mine) {
      // Your call sign in Morse: the cue a CW operator listens for.
      const call = p.name.replace(/[^A-Z0-9/]/g, '');
      if (call) { try { const sp = rowSpeeds(0); HST.audio.playMorse(call, audioOpts({ wpm: sp.wpm })); } catch (e) {} }
    }
  }

  /* =====================================================================
     THE CLUE: countdown, your-speed playback, keying, 60 s, reveal
     ===================================================================== */
  let clueTimers = [];
  function later(ms, fn) { clueTimers.push(setTimeout(fn, Math.max(0, ms))); }

  function gotClue(m) {
    stopClue(false);
    el('turnCard').hidden = true;
    const sp = rowSpeeds(m.r);
    const text = PREAMBLE + ' ' + m.text;
    const len = morseMs(text, sp.wpm, sp.fwpm);
    O.clue = { c: m.c, r: m.r, dd: m.dd, text: m.text, startAt: m.startAt, deadline: m.deadline, sp, len,
               playEnd: m.startAt + len, sent: null, marks: [], live: '' };
    send({ t: 'len', ms: Math.round(len) });   // the room waits for the slowest player's playback

    const cell = state.board.find((t) => t.cat === m.c && t.row === m.r) || { cat: m.c, row: m.r, dollars: 0 };
    el('clue').classList.add('online');
    el('clue').classList.remove('answering', 'revealed');
    el('clueResult').innerHTML = '';
    const untilStart = m.startAt - serverNow();
    const showCountdown = () => {
      openClue(cell, { wpmText: m.dd ? 'Daily Double · double points · ' + sp.label : sp.label });
      el('clue').classList.remove('dd');
      let left = Math.ceil((m.startAt - serverNow()) / 1000);
      const tick = () => {
        left = Math.ceil((m.startAt - serverNow()) / 1000);
        if (left > 0) { setClueStatus('Stand by · ' + left, false); later(250, tick); }
      };
      tick();
    };
    if (m.dd && untilStart > 3200) {
      // Daily Double: its card and sting first, then the usual countdown.
      try { state.audio.dailyDoubleSting(); } catch (e) {}
      openClue(cell, { dd: true, wpmText: 'Double points' });
      later(untilStart - 3100, () => { hideClueNow(); showCountdown(); });
    } else showCountdown();

    // Start the Morse at the room's moment (if we joined late, start now).
    later(m.startAt - serverNow(), () => {
      unlockAudio();
      try { HST.audio.playMorse(text, audioOpts(sp)); } catch (e) {}
      setClueStatus('Listen', true);
    });
    later(O.clue.playEnd - serverNow() + 150, () => {
      setClueStatus('Send your answer', false);
      el('clue').classList.add('answering');
      renderAnswerArea();
    });
    clueTimers.push(setInterval(renderCountdown, 250));
  }

  // The countdown ring on the tile. The 60 seconds only start dropping
  // once the slowest player's clue has finished, so it reads "60" until then.
  function renderCountdown() {
    const cl = O.clue;
    if (!cl) return;
    if (!cl.deadline) { el('cdNum').textContent = '60'; el('cd').style.setProperty('--p', 1); return; }
    const left = cl.deadline - serverNow();
    const secs = Math.max(0, Math.min(60, Math.ceil(left / 1000)));
    el('cdNum').textContent = secs;
    el('cd').style.setProperty('--p', Math.max(0, Math.min(1, left / 60000)));
    el('cd').classList.toggle('low', secs <= 10);
    el('cdNote').textContent = left > 60500 ? 'waiting for everyone’s clue to finish' : '';
  }

  function canKey() {
    const cl = O.clue;
    return !!(cl && !cl.sent && O.st && O.st.phase === 'clue' && serverNow() >= cl.playEnd &&
              (!cl.deadline || serverNow() < cl.deadline));
  }

  function renderAnswerArea() {
    const cl = O.clue;
    if (!cl) return;
    const answering = serverNow() >= cl.playEnd;
    el('clueOnline').hidden = !answering;
    if (!answering) return;
    if (cl.sent != null) {
      el('sentText').textContent = cl.sent || '(nothing)';
      el('sentLabel').textContent = 'You sent';
      el('ansNote').textContent = 'Waiting for the others…';
      el('ansDone').hidden = true;
      el('opads').hidden = true;
    } else {
      el('sentText').textContent = cl.live || '';
      el('sentLabel').textContent = 'Your answer';
      el('ansNote').textContent = cl.live ? 'Tap Done, press Enter or send AR when you’re finished.' : 'Send your answer with your key.';
      el('ansDone').hidden = false;
      el('opads').hidden = !showPads();
    }
  }
  function showPads() {
    try {
      const k = HST.keyerSettings.get();
      const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      return touch || k.adapter === 'keyboard';
    } catch (e) { return true; }
  }

  function gotReveal(m) {
    const cl = O.clue;
    stopKeyingForClue();
    if (cl) clueTimers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    clueTimers = [];
    el('bankValue').textContent = money(m.bank);
    el('clue').classList.remove('answering', 'listening');
    el('clue').classList.add('revealed');
    el('clueOnline').hidden = true;
    setClueStatus('', false);
    const yours = m.yours && m.yours.text
      ? '<div class="mine ' + (m.yours.ok ? 'ok' : 'no') + '">You sent: <b>' + esc(m.yours.text || '(nothing)') + '</b> ' + (m.yours.ok ? '✓' : '— not quite') + '</div>'
      : '<div class="mine no">You didn’t send an answer this time.</div>';
    el('clueResult').innerHTML =
      '<div class="ans">' + esc(m.answer) + '</div>' +
      '<div class="grp">' + m.correct + ' of ' + m.total + ' copied it · <b>+' + money(m.points) + '</b> for the group' +
      (m.dd ? ' <span class="ddx">(Daily Double, worth ' + money(m.value) + ')</span>' : '') + '</div>' + yours;
    try { state.audio.revealSting(); } catch (e) {}
  }

  function stopClue(animate) {
    clueTimers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    clueTimers = [];
    stopKeyingForClue();
    try { HST.audio.stop(); } catch (e) {}
    O.clue = null;
    el('clue').classList.remove('online', 'answering', 'revealed');
    el('clueOnline').hidden = true;
    el('clueResult').innerHTML = '';
    if (animate) closeClue(); else hideClueNow();
  }

  /* ---------------- keying your answer ----------------
     The same keyer and decoder as the Keyer and QSO tabs: a Vail or VBand
     adapter (Left/Right Ctrl), the [ and ] keys, or the on-screen paddles.
     You hear only your own sidetone. */
  let keyer = null, decoder = null, downAt = null, endTimer = null;
  function kcfg() { return HST.keyerSettings.get(); }
  function automatic() { const k = kcfg().keyType; return k === 'iambicA' || k === 'iambicB'; }
  function unitMs() { return 1200 / kcfg().wpm; }
  function startKeyer() {
    O.keyerOn = true;
    keyer = HST.createKeyer({ key: onKey });
    keyer.attachKeyboard(window);
    decoder = HST.createDecoder({
      unitMs: unitMs,
      adaptive: () => !automatic(),
      onChar: (ch) => {
        const cl = O.clue;
        if (!cl || cl.sent != null) return;
        if (ch === '<AR>') { submitAnswer(); return; }   // AR = "end of message": done
        cl.live += ch; renderAnswerArea();
      },
      onWord: () => { const cl = O.clue; if (cl && cl.live && cl.live.slice(-1) !== ' ') { cl.live += ' '; renderAnswerArea(); } }
    });
    HST.keyerSettings.onChange(() => { keyer.reset(); decoder.reset(); renderKeyLine(); });
  }
  function onKey(down, t) {
    if (!O.active || !canKey()) return;
    const cl = O.clue;
    if (down) { clearTimeout(endTimer); downAt = t; decoder.down(t); }
    else if (downAt != null) { cl.marks.push({ s: downAt, e: t }); downAt = null; decoder.up(t); }
  }
  function stopKeyingForClue() {
    clearTimeout(endTimer);
    if (keyer) keyer.reset();
    if (decoder) decoder.reset();
    downAt = null;
  }
  function submitAnswer() {
    const cl = O.clue;
    if (!cl || cl.sent != null || !(O.st && O.st.phase === 'clue')) return;
    // Re-read the whole answer from its timing (more reliable spacing than
    // the live decode), dropping a closing AR.
    let text = cl.live;
    try {
      const a = HST.analyzeSending(cl.marks, { unitMs: unitMs(), automatic: automatic() });
      if (a && a.text) text = a.text;
    } catch (e) {}
    text = String(text || '').replace(/<AR>\s*$/, '').trim();
    cl.sent = text;
    stopKeyingForClue();
    send({ t: 'answer', text });
    renderAnswerArea();
  }

  /* =====================================================================
     INVITATION: Copy / Share
     ===================================================================== */
  function inviteText() {
    const code = O.st ? O.st.code : O.room.code;
    const link = location.origin + '/cw-trainer/?room=' + code;
    return 'Join me for Morse Code Jeopardy online! 📻\n' +
      'Room code: ' + code + '\n' +
      'Tap to join: ' + link + '\n' +
      'Or open the HamShackTech CW Trainer, go to the Jeopardy tab, tap Join Online Game and enter the code.\n' +
      '73, ' + (O.room ? O.room.name : '');
  }
  async function shareInvite(btn) {
    const text = inviteText();
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    // On phones the Share sheet goes straight to WhatsApp and friends.
    if (touch && navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {}
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
    const was = btn.textContent;
    btn.textContent = ok ? 'Copied! Paste it in WhatsApp' : 'Couldn’t copy';
    setTimeout(() => { btn.textContent = was; }, 2200);
  }

  /* =====================================================================
     HOST: start the game with this device's categories
     ===================================================================== */
  function startGame() {
    unlockAudio();
    // Same board-making as the single-device game: 5 answers per category,
    // one hidden Daily Double in each column.
    loadPools();
    const rows = 5, cats = state.categories.slice(0, 6), tiles = [];
    for (let c = 0; c < cats.length; c++) {
      const pool = shuffle(parseLines(cats[c].lines)).slice(0, rows);
      const dd = Math.floor(Math.random() * rows);
      for (let r = 0; r < rows && r < pool.length; r++) {
        tiles.push({ c, r, dollars: DOLLARS[r] || (r + 1) * 200, answer: pool[r], dd: r === dd });
      }
    }
    send({ t: 'start', cats: cats.map((c) => c.name), tiles, step: prefs().step });
  }

  /* =====================================================================
     WIRING
     ===================================================================== */
  function wire() {
    el('olTabHost').addEventListener('click', () => setMode('host'));
    el('olTabJoin').addEventListener('click', () => setMode('join'));
    el('olChar').addEventListener('input', () => {
      const v = Number(el('olChar').value);
      el('olCharVal').textContent = v + ' WPM';
      fillFarnsworth(v, Number(el('olFw').value));
    });
    el('spChar').addEventListener('input', () => {
      const v = Number(el('spChar').value);
      el('spCharVal').textContent = v + ' WPM';
      fillFarnsworth(v, Number(el('spFw').value), 'spFw');
    });
    el('mySpeed').addEventListener('click', openSpeedDialog);
    el('spSave').addEventListener('click', saveSpeedDialog);
    el('spCancel').addEventListener('click', () => el('speedModal').classList.remove('show'));
    el('olHostBtn').addEventListener('click', hostRoom);
    el('olJoinBtn').addEventListener('click', () => joinRoom());
    el('olCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
    el('olCode').addEventListener('input', () => { el('olCode').value = el('olCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
    el('olCancel').addEventListener('click', () => { el('onlineModal').classList.remove('show'); if (!O.active) el('launchModal').classList.add('show'); });
    el('olKeySetup').addEventListener('click', () => { try { window.parent.HCT.openKeyerSetup(); } catch (e) {} });
    el('openHost').addEventListener('click', () => openOnlineDialog('host'));
    el('openJoin').addEventListener('click', () => openOnlineDialog('join'));
    el('barOnline').addEventListener('click', () => openOnlineDialog('join'));

    el('lobbyStart').addEventListener('click', startGame);
    el('lobbyInvite').addEventListener('click', (e) => shareInvite(e.currentTarget));
    el('panelInvite').addEventListener('click', (e) => shareInvite(e.currentTarget));
    el('hostSkip').addEventListener('click', () => send({ t: 'skip' }));
    el('hostEnd').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to end'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'End game'; }, 3000); return; }
      send({ t: 'end' });
    });
    el('leaveRoom').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to leave'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Leave room'; }, 3000); return; }
      leave();
    });
    el('playersList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kick]');
      if (!b) return;
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Remove?'; setTimeout(() => { b.dataset.sure = ''; b.textContent = '✕'; }, 3000); return; }
      send({ t: 'kick', pid: b.dataset.kick });
    });
    el('turnCard').addEventListener('click', () => { el('turnCard').hidden = true; });
    el('ansDone').addEventListener('click', submitAnswer);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && O.active && canKey() && e.target.tagName !== 'INPUT') { e.preventDefault(); submitAnswer(); }
    });
    // On-screen paddles.
    [['opDit', 'dit'], ['opDah', 'dah']].forEach(([id, which]) => {
      const b = el(id);
      const down = (e) => { e.preventDefault(); unlockAudio(); b.setPointerCapture(e.pointerId); b.classList.add('down'); keyer && keyer.touch(which, true); };
      const up = () => { if (!b.classList.contains('down')) return; b.classList.remove('down'); keyer && keyer.touch(which, false); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    el('noticeOk').addEventListener('click', () => { el('noticeModal').classList.remove('show'); el('launchModal').classList.add('show'); });
    el('soundHint').addEventListener('click', unlockAudio);
    // Any tap turns sound on (browsers block it until the first tap).
    document.addEventListener('pointerdown', () => { if (O.active) unlockAudio(); }, true);
    // Game over: the host can deal a new board in the same room.
    el('playAgain').addEventListener('click', (e) => {
      if (!O.active) return;
      e.stopImmediatePropagation();
      if (isHost()) startGame(); else el('gameOverModal').classList.remove('show');
    }, true);
    el('goLeave').addEventListener('click', () => leave());
  }

  /* ---------------- start-up ---------------- */
  async function init() {
    wire();
    let online = false;
    try { online = !!(await (await fetch('/rooms/config', { cache: 'no-store' })).json()).online; } catch (e) {}
    document.body.classList.toggle('online-ok', online);
    if (!online) return;
    const params = new URLSearchParams(location.search);
    const linkCode = (params.get('room') || '').toUpperCase();
    const saved = load(ROOM_KEY, null);
    if (saved && (!linkCode || linkCode === saved.code)) {
      // This device was in a room (the app was closed or reloaded): rejoin it.
      try {
        const j = await (await fetch('/rooms/info/' + saved.code)).json();
        if (j.exists && j.phase !== 'over') {
          O.room = saved;
          connect();
          // Sound needs a tap after a reload.
          el('soundHint').hidden = false;
          return;
        }
      } catch (e) {}
      save(ROOM_KEY, null);
    }
    if (linkCode) openOnlineDialog('join', linkCode);
  }
  init();
})();
