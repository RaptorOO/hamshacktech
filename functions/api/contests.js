/*
 * HamShackTech CW Trainer -- On Air Practice events  (Tim, 2026-11-05)
 * ====================================================================
 *   GET /api/contests?from=<ISO>&to=<ISO>
 *     -> { ok, configured, events: [{ title, start, end, allDay, date, location, details, link }] }
 *
 * The Home tab's On Air Practice panel shows the events on Tim's Google
 * Calendar "CW Trainer Contests" (SST and the like). This reads that
 * calendar's iCal feed on the server, expands the repeating events, and
 * returns the ones that overlap the window asked for (at most 16 days).
 *
 * SETTING (Cloudflare dashboard -> Pages project -> Settings -> Variables):
 *   CONTESTS_ICS_URL   the calendar's "Secret address in iCal format"
 *                      (Google Calendar -> the calendar's Settings ->
 *                      Integrate calendar). A secret, so the calendar can
 *                      stay private. Without it the panel says events will
 *                      show here.
 *
 * Repeats understood: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL,
 * COUNT, UNTIL, BYDAY (with 2SA / -1SU style ordinals), BYMONTHDAY and
 * BYMONTH, plus EXDATE and single changed or cancelled instances
 * (RECURRENCE-ID). Times keep their own time zone (TZID), so a repeat
 * set in local time follows daylight saving. That covers what Google
 * Calendar writes for contests; anything fancier shows its first date only.
 */

const DAY = 86400000;
const MAX_WINDOW = 16 * DAY;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', ...extra }
  });
}

/* ---------------- iCal text ---------------- */
function unfold(text) { return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); }
function unescapeText(v) { return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }

// One content line -> { name, params, value }
function parseLine(line) {
  let i = 0, inQ = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ':' && !inQ) break;
  }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const parts = head.split(';');
  const params = {};
  parts.slice(1).forEach((p) => { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); });
  return { name: parts[0].toUpperCase(), params, value };
}

function parseCalendar(text) {
  const lines = unfold(text).split('\n');
  const cal = { tz: 'UTC', events: [] };
  let ev = null;
  for (const raw of lines) {
    if (!raw) continue;
    const { name, params, value } = parseLine(raw);
    if (name === 'X-WR-TIMEZONE' && !ev) cal.tz = value.trim() || 'UTC';
    else if (name === 'BEGIN' && value === 'VEVENT') ev = { exdates: [] };
    else if (name === 'END' && value === 'VEVENT') { if (ev) cal.events.push(ev); ev = null; }
    else if (ev) {
      if (name === 'DTSTART' || name === 'DTEND' || name === 'RECURRENCE-ID') ev[name] = { value, params };
      else if (name === 'EXDATE') value.split(',').forEach((v) => ev.exdates.push({ value: v, params }));
      else if (name === 'SUMMARY' || name === 'DESCRIPTION' || name === 'LOCATION' || name === 'URL') ev[name] = unescapeText(value);
      else ev[name] = value;   // UID, RRULE, DURATION, STATUS ...
    }
  }
  return cal;
}

/* ---------------- time zones ---------------- */
// Milliseconds the zone is ahead of UTC at that instant.
function tzOffset(ms, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    f.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
  } catch (e) { return 0; }
}
// A wall-clock time in a zone -> UTC milliseconds.
function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let t = guess - tzOffset(guess, tz);
  const t2 = guess - tzOffset(t, tz);
  return t2;
}

// A DTSTART-style value -> { utc, allDay, wall: {y,mo,d,h,mi,s}, tz }
function readTime(prop, calTz) {
  if (!prop) return null;
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const wall = { y: +m[1], mo: +m[2] - 1, d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  if (!m[4] || prop.params.VALUE === 'DATE') return { allDay: true, wall, tz: 'UTC', utc: Date.UTC(wall.y, wall.mo, wall.d) };
  const tz = m[7] ? 'UTC' : (prop.params.TZID || calTz || 'UTC');
  return { allDay: false, wall, tz, utc: m[7] ? Date.UTC(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s) : zonedToUtc(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s, tz) };
}

function durationMs(v) {
  const m = (v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000);
}

/* ---------------- repeats ---------------- */
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRule(s) {
  const r = {};
  s.split(';').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) r[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); });
  return {
    freq: r.FREQ, interval: Math.max(1, +r.INTERVAL || 1), count: r.COUNT ? +r.COUNT : 0, until: r.UNTIL || '',
    byday: r.BYDAY ? r.BYDAY.split(',').map((x) => { const m = x.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/); return m ? { n: m[1] ? +m[1] : 0, wd: WD[m[2]] } : null; }).filter(Boolean) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map((x) => +x - 1) : null,
    wkst: WD[r.WKST] !== undefined ? WD[r.WKST] : 1
  };
}

// Does this calendar day (a UTC-midnight date standing for a wall date) fit the rule?
function dayMatches(rule, day, start) {
  const dt = new Date(day), st = new Date(start);
  const y = dt.getUTCFullYear(), mo = dt.getUTCMonth(), d = dt.getUTCDate(), wd = dt.getUTCDay();
  const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  function nthOk(b) {
    if (b.wd !== wd) return false;
    if (!b.n) return true;
    const nth = Math.floor((d - 1) / 7) + 1, fromEnd = -(Math.floor((dim - d) / 7) + 1);
    return b.n > 0 ? nth === b.n : fromEnd === b.n;
  }
  function dayOfMonthOk() {
    if (rule.bymonthday) return rule.bymonthday.some((n) => (n > 0 ? n === d : dim + n + 1 === d));
    if (rule.byday) return rule.byday.some(nthOk);
    return d === st.getUTCDate();
  }
  const days = Math.round((day - start) / DAY);
  switch (rule.freq) {
    case 'DAILY':
      if (days % rule.interval) return false;
      return (!rule.byday || rule.byday.some((b) => b.wd === wd)) && (!rule.bymonth || rule.bymonth.includes(mo));
    case 'WEEKLY': {
      const weekStart = (t) => t - ((new Date(t).getUTCDay() - rule.wkst + 7) % 7) * DAY;
      const weeks = Math.round((weekStart(day) - weekStart(start)) / (7 * DAY));
      if (weeks % rule.interval) return false;
      const want = rule.byday ? rule.byday.map((b) => b.wd) : [st.getUTCDay()];
      return want.includes(wd) && (!rule.bymonth || rule.bymonth.includes(mo));
    }
    case 'MONTHLY': {
      const months = (y - st.getUTCFullYear()) * 12 + mo - st.getUTCMonth();
      if (months % rule.interval) return false;
      return (!rule.bymonth || rule.bymonth.includes(mo)) && dayOfMonthOk();
    }
    case 'YEARLY': {
      if ((y - st.getUTCFullYear()) % rule.interval) return false;
      const months = rule.bymonth || [st.getUTCMonth()];
      if (!months.includes(mo)) return false;
      if (!rule.bymonth && !rule.byday && !rule.bymonthday) return d === st.getUTCDate();
      return dayOfMonthOk();
    }
  }
  return false;
}

// Every start (UTC ms) of a repeating event that could overlap [from, to).
function expand(ev, t0, ruleText, from, to, len, calTz) {
  const rule = parseRule(ruleText);
  if (!rule.freq) return [t0.utc];
  const until = rule.until ? readTime({ value: rule.until, params: {} }, 'UTC') : null;
  const startDay = Date.UTC(t0.wall.y, t0.wall.mo, t0.wall.d);
  const out = [];
  let n = 0;
  // COUNT has to be counted from the first one; otherwise start just before
  // the window (dayMatches lines each day up against the first one itself).
  let day = rule.count ? startDay : Math.max(startDay, Math.floor(from / DAY) * DAY - 2 * DAY);
  const lastDay = to + 2 * DAY;
  for (let guard = 0; day <= lastDay && guard < 30000; day += DAY, guard++) {
    if (!dayMatches(rule, day, startDay)) continue;
    const dt = new Date(day);
    const utc = t0.allDay ? day : zonedToUtc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), t0.wall.h, t0.wall.mi, t0.wall.s, t0.tz);
    if (utc < t0.utc) continue;
    if (until && utc > until.utc + (until.allDay ? DAY - 1 : 0)) break;
    n++;
    if (rule.count && n > rule.count) break;
    if (utc + len > from && utc < to) out.push(utc);
  }
  return out;
}

/* ---------------- the events for a window ---------------- */
// The event's page: a link after "More info:" if there is one, else the first link.
function firstLink(text) {
  const t = text || '';
  const m = t.match(/More info:?\s*(?:<a [^>]*href=")?(https?:\/\/[^\s<>"')]+)/i) || t.match(/(https?:\/\/[^\s<>"')]+)/);
  return m ? m[1] : '';
}
function plain(text) { return (text || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim(); }

function eventsBetween(cal, from, to) {
  const moved = {};   // UID -> { original start ms: true }, for changed or cancelled instances
  cal.events.forEach((e) => {
    if (!e['RECURRENCE-ID'] || !e.UID) return;
    const r = readTime(e['RECURRENCE-ID'], cal.tz);
    if (r) (moved[e.UID] = moved[e.UID] || {})[r.utc] = true;
  });
  const out = [];
  cal.events.forEach((e) => {
    if ((e.STATUS || '').toUpperCase() === 'CANCELLED') return;
    const t0 = readTime(e.DTSTART, cal.tz);
    if (!t0) return;
    const t1 = readTime(e.DTEND, cal.tz);
    const len = t1 ? Math.max(0, t1.utc - t0.utc) : e.DURATION ? durationMs(e.DURATION) : (t0.allDay ? DAY : 0);
    let starts = [t0.utc];
    if (e.RRULE && !e['RECURRENCE-ID']) {
      const ex = {};
      e.exdates.forEach((x) => { const r = readTime(x, cal.tz); if (r) ex[r.utc] = true; });
      const skip = moved[e.UID] || {};
      starts = expand(e, t0, e.RRULE, from, to, len, cal.tz).filter((s) => !ex[s] && !skip[s]);
    }
    const details = plain(e.DESCRIPTION);
    starts.forEach((s) => {
      if (!(s + Math.max(len, 1) > from && s < to)) return;
      out.push({
        title: (e.SUMMARY || 'Event').trim(),
        start: new Date(s).toISOString(),
        end: new Date(s + len).toISOString(),
        allDay: t0.allDay,
        date: t0.allDay ? new Date(s).toISOString().slice(0, 10) : '',
        location: (e.LOCATION || '').trim(),
        details: details.length > 700 ? details.slice(0, 700) + '…' : details,
        link: (e.URL || '').trim() || firstLink(e.DESCRIPTION)
      });
    });
  });
  out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)));
  return out;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const now = Date.now();
  let from = Date.parse(url.searchParams.get('from') || '') || now - DAY;
  let to = Date.parse(url.searchParams.get('to') || '') || now + 8 * DAY;
  if (to <= from) to = from + DAY;
  if (to - from > MAX_WINDOW) to = from + MAX_WINDOW;
  if (!env.CONTESTS_ICS_URL) return json({ ok: true, configured: false, events: [] });
  try {
    const res = await fetch(env.CONTESTS_ICS_URL, { cf: { cacheTtl: 600, cacheEverything: true } });
    if (!res.ok) return json({ ok: false, configured: true, error: 'calendar ' + res.status, events: [] }, 502, { 'cache-control': 'no-store' });
    const cal = parseCalendar(await res.text());
    return json({ ok: true, configured: true, events: eventsBetween(cal, from, to) });
  } catch (e) {
    console.error(e && e.stack || e);
    return json({ ok: false, configured: true, error: 'calendar unreachable', events: [] }, 502, { 'cache-control': 'no-store' });
  }
}

