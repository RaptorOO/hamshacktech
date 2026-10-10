/* =====================================================================
   HamShackTech CW Trainer -- Jeopardy rooms (Milestone 9a)

   One Durable Object ("Room") per online game. It is the referee: it
   holds the board, the players and whose turn it is, keeps a live
   WebSocket connection to every player's app, and decides when each
   clue starts, when time is up and how many points the group earned.

   No audio passes through here. When a tile is picked the room tells
   every device WHAT to send and WHEN to start; each device then sends
   the Morse itself, at that player's own speed.

   The site reaches this Worker through a Pages Function
   (functions/rooms/[[path]].js) that holds a binding to this class.

   Messages are small JSON objects with a "t" (type) field:
     app -> room   ping, start, pick, len, answer, skip, kick, end
     room -> app   pong, state, clue, deadline, reveal, nudge, kicked, error
   ===================================================================== */

const MAX_PLAYERS = 20;
const ANSWER_MS = 60000;        // time to send an answer, after the slowest playback ends
const COUNTDOWN_MS = 3500;      // "Stand by 3, 2, 1" before the clue starts
const DD_CARD_MS = 2600;        // the Daily Double card shows first
const LEN_WAIT_MS = 2000;       // how long to wait for every device's playback length
const DEFAULT_LEN_MS = 20000;   // playback length assumed for a device that didn't say
const REVEAL_MS = 6000;         // how long the answer stays up before the next turn
const NUDGE_MS = 30000;         // no pick for this long: remind (or skip someone who left)
const IDLE_DELETE_MS = 2 * 60 * 60 * 1000;   // a room forgets everything 2 hours after the last activity

export default {
  // Nothing is served from this Worker's own address; the site talks to
  // the Room objects through the Pages Function.
  async fetch() { return new Response('HamShackTech rooms', { status: 404 }); }
};

/* ---------------------------------------------------------------------
   Answer checking. Forgiving, like the QSO tab: case and extra spaces
   don't matter, a prosign such as <AR> at the end is ignored, and in a
   word of four or more letters one letter wrong, missing or extra still
   counts.
   --------------------------------------------------------------------- */
function normalize(s) {
  return String(s || '').toUpperCase()
    .replace(/<[A-Z]{2}>/g, ' ')          // prosigns (<AR>, <SK>, <KN>...) aren't part of the answer
    .replace(/[^A-Z0-9/?.,= ]/g, ' ')     // '*' = a character the decoder couldn't read
    .replace(/\s+/g, ' ').trim();
}
// Levenshtein distance: how many single-letter edits turn a into b.
function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = keep;
    }
  }
  return prev[b.length];
}
export function answerMatches(sent, truth) {
  const a = normalize(sent), b = normalize(truth);
  if (!a) return false;
  if (a === b) return true;
  const A = a.replace(/ /g, ''), B = b.replace(/ /g, '');   // word spacing is the hardest part; don't fail on it
  if (A === B) return true;
  return B.length >= 4 && editDistance(A, B) <= 1;
}

/* Clean up anything typed by a person before keeping or sending it. */
function cleanName(s) {
  return String(s || '').replace(/[^\p{L}\p{N} ./-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16).toUpperCase();
}
function cleanText(s, max) { return String(s || '').replace(/[\u0000-\u001f]/g, '').slice(0, max); }

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sockets = new Map();   // player id -> WebSocket (only players connected right now)
    this.timers = {};           // named setTimeout handles
    this.s = null;              // the game state (see blank())
    // Reload a saved game if this object was restarted (e.g. after an update).
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get('s')) || null;
      if (this.s) {
        this.s.players.forEach((p) => { p.on = false; });   // nobody is connected after a restart
        // A clue or reveal in progress can't be resumed exactly; move on to the next pick.
        if (this.s.phase === 'clue' || this.s.phase === 'reveal') { this.s.clue = null; this.s.phase = 'pick'; }
      }
    });
  }

  blank(code, hostKey) {
    return {
      code, hostKey, created: Date.now(), touched: Date.now(),
      phase: 'lobby',             // lobby | pick | clue | reveal | over
      players: [],                // [{ id, name, on, removed }] in the order they joined
      hostId: null,
      turn: 0,                    // index into players of whose turn it is
      step: 2,                    // WPM added per dollar row (host's choice)
      cats: [], tiles: [],        // the board; tiles: { c, r, dollars, answer, dd, used, points }
      bank: 0,
      clue: null                  // the clue in play (see pick())
    };
  }

  save() {
    this.s.touched = Date.now();
    // Stored so a restarted object can carry on; deleted by the idle alarm.
    this.ctx.storage.put('s', this.s);
    this.ctx.storage.setAlarm(Date.now() + IDLE_DELETE_MS);
  }
  async alarm() {
    // Nobody has done anything for 2 hours: forget the room entirely.
    await this.ctx.storage.deleteAll();
    this.s = null;
    this.sockets.forEach((ws) => { try { ws.close(4000, 'Room closed'); } catch (e) {} });
    this.sockets.clear();
  }

  timer(name, ms, fn) {
    clearTimeout(this.timers[name]);
    this.timers[name] = setTimeout(() => { delete this.timers[name]; fn(); }, ms);
  }
  cancel(name) { clearTimeout(this.timers[name]); delete this.timers[name]; }

  async fetch(req) {
    await this.ready;
    const url = new URL(req.url);

    // POST /init { code, hostKey } -- called once when the host creates the room.
    if (url.pathname === '/init') {
      if (this.s) return new Response('taken', { status: 409 });
      const b = await req.json();
      this.s = this.blank(b.code, b.hostKey);
      this.save();
      return Response.json({ ok: true });
    }

    // GET /info -- does this room exist, and can someone join it?
    if (url.pathname === '/info') {
      if (!this.s) return Response.json({ exists: false });
      const n = this.s.players.filter((p) => !p.removed).length;
      return Response.json({ exists: true, phase: this.s.phase, players: n, full: n >= MAX_PLAYERS });
    }

    // GET /ws?pid=&name=&key= with "Upgrade: websocket" -- a player connects.
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      if (!this.s) return new Response('No such room', { status: 404 });
      const pid = String(url.searchParams.get('pid') || '').slice(0, 40);
      const name = cleanName(url.searchParams.get('name'));
      const key = url.searchParams.get('key') || '';
      if (!/^[a-z0-9]{8,40}$/.test(pid) || !name) return new Response('Bad player', { status: 400 });

      let p = this.s.players.find((x) => x.id === pid);
      if (p && p.removed) return new Response('Removed', { status: 403 });
      if (!p) {
        if (this.s.players.filter((x) => !x.removed).length >= MAX_PLAYERS) return new Response('Room full', { status: 403 });
        if (this.s.phase === 'over') return new Response('Game over', { status: 410 });
        p = { id: pid, name, on: false, removed: false };
        this.s.players.push(p);
      }
      p.name = name;
      // The person holding the room's host key is the host (they created it).
      if (key && key === this.s.hostKey) this.s.hostId = pid;

      const pair = new WebSocketPair();
      const ws = pair[1];
      ws.accept();
      const old = this.sockets.get(pid);
      if (old) { try { old.close(4001, 'Opened somewhere else'); } catch (e) {} }
      this.sockets.set(pid, ws);
      p.on = true;
      ws.addEventListener('message', (ev) => this.onMessage(pid, ws, ev.data));
      const gone = () => {
        if (this.sockets.get(pid) !== ws) return;   // replaced by a newer connection
        this.sockets.delete(pid);
        const q = this.s && this.s.players.find((x) => x.id === pid);
        if (q) q.on = false;
        if (this.s) { this.afterLeave(pid); this.broadcastState(); }
      };
      ws.addEventListener('close', gone);
      ws.addEventListener('error', gone);
      this.save();
      this.broadcastState();
      // Someone rejoining mid-clue gets the clue (minus timing they missed).
      if (this.s.phase === 'clue' && this.s.clue) this.sendClue(ws, pid);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return new Response('Not found', { status: 404 });
  }

  /* ---------------- messages from players ---------------- */
  onMessage(pid, ws, raw) {
    if (!this.s) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const isHost = pid === this.s.hostId;
    switch (m.t) {
      case 'ping':   // clock sync: the app works out how far its clock is from ours
        ws.send(JSON.stringify({ t: 'pong', c: m.c, s: Date.now() }));
        return;
      case 'start': if (isHost) this.start(m); return;
      case 'pick': this.pick(pid, m.c, m.r); return;
      case 'len': this.gotLen(pid, m); return;
      case 'answer': this.gotAnswer(pid, m); return;
      case 'skip': if (isHost && this.s.phase === 'pick') this.nextTurn(); return;
      case 'kick': if (isHost && m.pid !== pid) this.kick(m.pid); return;
      case 'end': if (isHost) this.gameOver(); return;
    }
  }

  // Host taps Start. The host's app chose the categories and answers.
  start(m) {
    if (this.s.phase !== 'lobby' && this.s.phase !== 'over') return;
    const cats = (Array.isArray(m.cats) ? m.cats : []).slice(0, 6).map((c) => cleanText(c, 30));
    const tiles = (Array.isArray(m.tiles) ? m.tiles : []).slice(0, 36).map((t) => ({
      c: t.c | 0, r: t.r | 0, dollars: Math.max(0, Math.min(5000, t.dollars | 0)),
      answer: normalize(cleanText(t.answer, 40)), dd: !!t.dd, used: false, points: 0
    })).filter((t) => t.answer && t.c < cats.length);
    if (!cats.length || !tiles.length) return;
    this.s.cats = cats;
    this.s.tiles = tiles;
    this.s.step = Math.max(0, Math.min(5, Number(m.step) || 0));
    this.s.bank = 0;
    this.s.clue = null;
    this.s.phase = 'pick';
    // The host goes first; everyone else in the order they joined.
    const h = this.s.players.findIndex((p) => p.id === this.s.hostId);
    this.s.turn = h >= 0 ? h : 0;
    this.save();
    this.broadcastState();
    this.startPickTimer();
  }

  // The player whose turn it is picks a tile.
  pick(pid, c, r) {
    const s = this.s;
    if (s.phase !== 'pick') return;
    const turnP = s.players[s.turn];
    if (!turnP || turnP.id !== pid) return;
    const tile = s.tiles.find((t) => t.c === c && t.r === r && !t.used);
    if (!tile) return;
    this.cancel('pick');
    tile.used = true;
    const now = Date.now();
    s.phase = 'clue';
    s.clue = {
      c, r, dd: tile.dd, by: pid,
      startAt: now + (tile.dd ? DD_CARD_MS : 0) + COUNTDOWN_MS,
      deadline: null,
      lens: {},                       // player id -> their playback length (ms)
      answers: {},                    // player id -> { text, ok }
      // Who's taking part: everyone connected when the tile opened.
      who: s.players.filter((p) => p.on && !p.removed).map((p) => p.id)
    };
    this.save();
    this.broadcastState();
    this.sockets.forEach((ws, id) => this.sendClue(ws, id));
    // Wait briefly for every device to say how long its playback takes.
    this.timer('lens', LEN_WAIT_MS, () => this.setDeadline());
  }

  sendClue(ws, pid) {
    const cl = this.s.clue, tile = this.s.tiles.find((t) => t.c === cl.c && t.r === cl.r);
    try {
      ws.send(JSON.stringify({ t: 'clue', c: cl.c, r: cl.r, dd: cl.dd, text: tile.answer, startAt: cl.startAt, deadline: cl.deadline }));
    } catch (e) {}
  }

  gotLen(pid, m) {
    const cl = this.s.clue;
    if (this.s.phase !== 'clue' || !cl || cl.deadline) return;
    cl.lens[pid] = Math.max(0, Math.min(120000, Number(m.ms) || 0));
    if (cl.who.every((id) => id in cl.lens || !this.sockets.has(id))) this.setDeadline();
  }

  // Everyone gets the same 60 seconds, counted from when the SLOWEST
  // player's playback finishes, so choosing a slower speed costs no time.
  setDeadline() {
    const cl = this.s.clue;
    if (this.s.phase !== 'clue' || !cl || cl.deadline) return;
    this.cancel('lens');
    const lens = cl.who.map((id) => (id in cl.lens ? cl.lens[id] : DEFAULT_LEN_MS));
    const longest = lens.length ? Math.max.apply(null, lens) : DEFAULT_LEN_MS;
    cl.deadline = cl.startAt + longest + ANSWER_MS;
    this.save();
    this.broadcast({ t: 'deadline', at: cl.deadline });
    this.timer('answer', cl.deadline - Date.now(), () => this.reveal());
  }

  gotAnswer(pid, m) {
    const cl = this.s.clue;
    if (this.s.phase !== 'clue' || !cl || pid in cl.answers) return;
    const tile = this.s.tiles.find((t) => t.c === cl.c && t.r === cl.r);
    const text = normalize(cleanText(m.text, 60));
    cl.answers[pid] = { text, ok: answerMatches(text, tile.answer) };
    if (cl.who.indexOf(pid) < 0) cl.who.push(pid);   // joined after the tile opened, but answered: counts
    this.save();
    this.broadcastState();
    // Everyone still here has answered: no need to wait out the clock.
    const waiting = cl.who.filter((id) => this.sockets.has(id) && !(id in cl.answers));
    if (!waiting.length) this.reveal();
  }

  // Time's up (or everyone answered): show the answer and the group's result.
  reveal() {
    const s = this.s, cl = s.clue;
    if (s.phase !== 'clue' || !cl) return;
    this.cancel('answer'); this.cancel('lens');
    const tile = s.tiles.find((t) => t.c === cl.c && t.r === cl.r);
    // Who counts: those who answered, plus those who took part and are still here.
    const counted = cl.who.filter((id) => id in cl.answers || this.sockets.has(id));
    const correct = counted.filter((id) => cl.answers[id] && cl.answers[id].ok).length;
    const total = counted.length;
    const value = tile.dollars * (tile.dd ? 2 : 1);
    const points = total ? Math.round(value * correct / total) : 0;
    tile.points = points;
    s.bank += points;
    s.phase = 'reveal';
    this.save();
    // Each player privately sees what the app read from their own sending.
    this.sockets.forEach((ws, id) => {
      try {
        ws.send(JSON.stringify({
          t: 'reveal', c: cl.c, r: cl.r, dd: tile.dd, answer: tile.answer, correct, total, points, value,
          bank: s.bank, yours: cl.answers[id] || null
        }));
      } catch (e) {}
    });
    this.broadcastState();
    this.timer('reveal', REVEAL_MS, () => {
      s.clue = null;
      if (s.tiles.every((t) => t.used)) this.gameOver();
      else this.nextTurn();
    });
  }

  // Turn passes to the next player in join order who is still here.
  nextTurn() {
    const s = this.s, n = s.players.length;
    if (!n) return;
    for (let k = 1; k <= n; k++) {
      const i = (s.turn + k) % n, p = s.players[i];
      if (p.on && !p.removed) { s.turn = i; break; }
    }
    s.phase = 'pick';
    s.clue = null;
    this.save();
    this.broadcastState();
    this.startPickTimer();
  }

  // 30 seconds with no pick: if they've left, move on; if they're here,
  // remind them (their app pulses the card and replays their call sign).
  startPickTimer() {
    this.timer('pick', NUDGE_MS, () => {
      const s = this.s;
      if (!s || s.phase !== 'pick') return;
      const p = s.players[s.turn];
      if (!p || !p.on || p.removed) { this.nextTurn(); return; }
      const ws = this.sockets.get(p.id);
      if (ws) { try { ws.send(JSON.stringify({ t: 'nudge' })); } catch (e) {} }
      this.startPickTimer();
    });
  }

  afterLeave(pid) {
    const s = this.s;
    // If the player whose turn it is leaves, give them 30 seconds to come back.
    if (s.phase === 'pick' && s.players[s.turn] && s.players[s.turn].id === pid) this.startPickTimer();
    // If everyone left mid-clue is now answered, reveal.
    if (s.phase === 'clue' && s.clue && s.clue.deadline) {
      const waiting = s.clue.who.filter((id) => this.sockets.has(id) && !(id in s.clue.answers));
      if (!waiting.length && Object.keys(s.clue.answers).length) this.reveal();
    }
    if (s.phase === 'clue' && s.clue && !s.clue.deadline) this.gotLen(pid, { ms: 0 });
  }

  kick(pid) {
    const p = this.s.players.find((x) => x.id === pid);
    if (!p) return;
    p.removed = true; p.on = false;
    const ws = this.sockets.get(pid);
    if (ws) {
      try { ws.send(JSON.stringify({ t: 'kicked' })); ws.close(4003, 'Removed by host'); } catch (e) {}
      this.sockets.delete(pid);
    }
    if (this.s.phase === 'pick' && this.s.players[this.s.turn] === p) this.nextTurn();
    this.save();
    this.broadcastState();
  }

  gameOver() {
    ['pick', 'answer', 'lens', 'reveal'].forEach((n) => this.cancel(n));
    this.s.phase = 'over';
    this.s.clue = null;
    this.save();
    this.broadcastState();
  }

  /* ---------------- sending ---------------- */
  broadcast(obj) {
    const msg = JSON.stringify(obj);
    this.sockets.forEach((ws) => { try { ws.send(msg); } catch (e) {} });
  }

  // Everything the apps need to draw the screen. Answers of unplayed
  // tiles are never included.
  broadcastState() {
    const s = this.s;
    if (!s) return;
    const cl = s.clue;
    const base = {
      t: 'state', code: s.code, phase: s.phase, hostId: s.hostId, step: s.step, bank: s.bank,
      turnId: s.players[s.turn] ? s.players[s.turn].id : null,
      players: s.players.filter((p) => !p.removed).map((p) => ({
        id: p.id, name: p.name, on: p.on,
        answered: !!(cl && cl.answers[p.id]),
        inClue: !!(cl && cl.who.indexOf(p.id) >= 0)
      })),
      cats: s.cats,
      tiles: s.tiles.map((t) => ({
        c: t.c, r: t.r, dollars: t.dollars, used: t.used,
        // A used tile's answer and score are shown on the board once revealed.
        answer: t.used && !(cl && cl.c === t.c && cl.r === t.r) ? t.answer : null,
        dd: t.used ? t.dd : undefined, points: t.points
      })),
      clue: cl ? { c: cl.c, r: cl.r, dd: cl.dd, startAt: cl.startAt, deadline: cl.deadline } : null
    };
    this.sockets.forEach((ws, id) => {
      try { ws.send(JSON.stringify(Object.assign({ you: id }, base))); } catch (e) {}
    });
  }
}
