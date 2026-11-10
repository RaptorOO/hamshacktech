/*
 * HamShackTech CW Trainer -- radio sidetone listener (audio thread)
 * ================================================================
 * Runs inside an AudioWorklet (see hst-radio.js). It hears the audio
 * input sample by sample and works out when the radio's sidetone starts
 * and stops, like a straight key closing and opening.
 *
 * 1. FINDING THE PITCH. Every 512 samples it looks at the last 1024 and
 *    measures how much of their energy sits at each pitch from 300 to
 *    1500 Hz (Goertzel filters, 20 Hz apart). A sidetone puts nearly all
 *    its energy at one pitch; room noise and speech spread theirs out. A
 *    pitch that holds nearly all the energy, steady within 6 Hz, six looks
 *    in a row (about 65 ms) is the sidetone, and the listener locks onto
 *    it (and moves if a steady tone turns up somewhere else for twice as
 *    long). The pitch is saved, so next time the first dit is caught too.
 * 2. FOLLOWING THE TONE. Locked on, it mixes the input with that pitch
 *    and averages over 3 ms: the result is how loud the sidetone is right
 *    now, nearly free of everything at other pitches. Tone on = louder
 *    than both the noise at that pitch (x4) and a share of the tone's own
 *    level, AND most of the input's energy is at that pitch. Tone off =
 *    below a lower line (hysteresis, so it doesn't chatter).
 * 3. TIMING. The 3 ms average makes each edge late by a known amount; the
 *    listener reports the corrected moment, as a sample number, so the
 *    page can turn it into the same clock the keyboard keys use.
 *
 * Messages to the page:
 *   { t: 'key', down, frame, detect }   frame = when the edge happened,
 *                                       detect = when it was seen (samples)
 *   { t: 'level', ... }                 about 20 times a second, for the meter
 *   { t: 'pitch', hz }                  locked onto a new pitch
 */
class HSTRadioListener extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;
    this.sr = sr;
    // Pitch search.
    this.N = 1024;
    this.buf = new Float32Array(this.N);
    this.bufPos = 0;
    this.sinceScan = 0;
    this.win = new Float32Array(this.N);
    for (let n = 0; n < this.N; n++) this.win[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (this.N - 1));
    this.freqs = [];
    for (let f = 300; f <= 1500; f += 20) this.freqs.push(f);
    this.cand = 0; this.candRun = 0; this.candSum = 0;
    this.pitch = 0;               // locked pitch (Hz), 0 = not yet
    // Envelope at the locked pitch: running sums over M samples.
    this.M = Math.max(16, Math.round(sr * 0.003));
    this.ri = new Float64Array(this.M); this.rq = new Float64Array(this.M); this.rp = new Float64Array(this.M);
    this.si = 0; this.sq = 0; this.sp = 0; this.rpos = 0; this.resum = 0;
    this.phase = 0; this.dphase = 0;
    // Levels (linear amplitude, 1 = full scale).
    this.floor = 0.001;           // the noise at the locked pitch, while the tone is off
    this.peak = 0;                // the tone's own level
    this.ABS_MIN = 0.003;         // about -50 dBFS: quieter than this is never a tone
    this.down = false;
    this.frame = 0;               // samples heard so far
    this.lastLevel = 0;
    this.rmsAcc = 0; this.rmsN = 0; this.maxA = 0;
    // Smoothing constants (per sample).
    const a = (sec) => 1 - Math.exp(-1 / (sr * sec));
    this.aFloorDown = a(0.15); this.aFloorUp = a(2); this.aPeakDecay = a(3);
    // The page can start from the pitch heard last time, so the very first
    // dit is caught (otherwise the search needs about 30 ms of tone).
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.t === 'reset') this.resetPitch();
      if (m.t === 'pitch' && m.hz >= 300 && m.hz <= 1500) this.lock(m.hz, true);
    };
    this.t0 = null;               // the audio clock (s) at sample 0
  }

  resetPitch() {
    this.pitch = 0; this.cand = 0; this.candRun = 0; this.peak = 0; this.floor = 0.001;
    if (this.down) { this.down = false; this.post({ t: 'key', down: false, frame: this.frame, detect: this.frame }); }
  }

  // Every message carries t0: sample n happened at t0 + n / sampleRate
  // on the AudioContext clock.
  post(m) { m.t0 = this.t0; m.sr = this.sr; this.port.postMessage(m); }

  lock(hz, quiet) {
    this.pitch = hz;
    this.dphase = 2 * Math.PI * hz / this.sr;
    this.ri.fill(0); this.rq.fill(0); this.rp.fill(0);
    this.si = this.sq = this.sp = 0;
    this.peak = 0;
    if (!quiet) this.post({ t: 'pitch', hz: Math.round(hz) });
  }

  // How much of the last N samples' energy is at each pitch; returns the
  // best pitch (refined between filters) and its share (1 = a pure tone).
  scan() {
    const N = this.N, buf = this.buf, win = this.win, start = this.bufPos;
    const x = new Float32Array(N);
    let energy = 0;
    for (let n = 0; n < N; n++) { const v = buf[(start + n) % N] * win[n]; x[n] = v; energy += v * v; }
    if (energy <= 0) return null;
    let best = -1, bestP = 0;
    const pw = new Float64Array(this.freqs.length);
    for (let k = 0; k < this.freqs.length; k++) {
      const w = 2 * Math.PI * this.freqs[k] / this.sr, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let n = 0; n < N; n++) { const s0 = x[n] + c * s1 - s2; s2 = s1; s1 = s0; }
      const p = s1 * s1 + s2 * s2 - c * s1 * s2;
      pw[k] = p;
      if (p > bestP) { bestP = p; best = k; }
    }
    if (best < 0) return null;
    // Share of the energy at that pitch: 3|X|^2 / (N * sum((x w)^2)) is 1
    // for a pure tone with a Hann window and about 3/N for white noise.
    const share = 3 * bestP / (N * energy);
    let hz = this.freqs[best];
    if (best > 0 && best < pw.length - 1) {
      const a = Math.log(pw[best - 1] + 1e-20), b = Math.log(pw[best] + 1e-20), g = Math.log(pw[best + 1] + 1e-20);
      const d = a - 2 * b + g;
      if (d < 0) hz += 20 * 0.5 * (a - g) / d;
    }
    return { hz, share, rms: Math.sqrt(energy / (N * 0.375)) };
  }

  process(inputs) {
    // All the input's channels added together: an interface's sidetone may
    // be on input 1 or input 2 (a stereo pair), and the unused one is quiet.
    const chans = inputs[0];
    if (!chans || !chans.length) return true;
    let ch = chans[0];
    if (chans.length > 1) {
      ch = new Float32Array(chans[0].length);
      for (let c = 0; c < chans.length; c++) for (let i = 0; i < ch.length; i++) ch[i] += chans[c][i];
    }
    if (this.t0 === null) this.t0 = currentTime;
    const M = this.M;
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      this.frame++;
      this.buf[this.bufPos] = x; this.bufPos = (this.bufPos + 1) % this.N;
      this.rmsAcc += x * x; this.rmsN++;
      if (++this.sinceScan >= 512) {
        this.sinceScan = 0;
        const r = this.scan();
        // A tone: nearly all the energy at one pitch, not too quiet, and the
        // SAME pitch (within 6 Hz) look after look. A voice can put most of
        // its energy in one harmonic for a moment, but its pitch slides.
        if (r && r.share > 0.7 && r.rms > this.ABS_MIN) {
          if (this.candRun && Math.abs(r.hz - this.cand) < 6) { this.candRun++; this.candSum += r.hz; }
          else { this.cand = r.hz; this.candSum = r.hz; this.candRun = 1; }
          const hz = this.candSum / this.candRun;
          const far = !this.pitch || Math.abs(hz - this.pitch) > 40;
          // About 65 ms of steady tone to find the pitch (a dah does it);
          // twice that to move away from one already found.
          if (far && this.candRun >= (this.pitch ? 12 : 6)) this.lock(hz);
        } else this.candRun = 0;
      }
      if (!this.pitch) continue;

      // Mix with the locked pitch; running 3 ms sums of I, Q and power.
      this.phase += this.dphase; if (this.phase > 6.283185307179586) this.phase -= 6.283185307179586;
      const vi = x * Math.cos(this.phase), vq = x * Math.sin(this.phase), vp = x * x;
      const p = this.rpos;
      this.si += vi - this.ri[p]; this.sq += vq - this.rq[p]; this.sp += vp - this.rp[p];
      this.ri[p] = vi; this.rq[p] = vq; this.rp[p] = vp;
      this.rpos = (p + 1) % M;
      if (++this.resum >= 48000) {   // stop rounding errors building up
        this.resum = 0; this.si = this.sq = this.sp = 0;
        for (let k = 0; k < M; k++) { this.si += this.ri[k]; this.sq += this.rq[k]; this.sp += this.rp[k]; }
      }
      const I = this.si / M, Q = this.sq / M, iq = I * I + Q * Q, pow = this.sp / M;
      const A = 2 * Math.sqrt(iq);                    // the tone's amplitude
      const share = pow > 1e-12 ? 2 * iq / pow : 0;   // 1 = all the input is the tone
      if (A > this.maxA) this.maxA = A;

      if (this.down) {
        if (A > this.peak) this.peak = A;
        const off = Math.max(this.ABS_MIN * 0.6, this.floor * 2.5, this.peak * 0.25);
        if (A < off || share < 0.2) {
          this.down = false;
          // The average takes (1 - off/peak) of M samples to fall to the line.
          const lag = M * Math.min(1, Math.max(0, 1 - off / (this.peak || off)));
          this.post({ t: 'key', down: false, frame: this.frame - lag, detect: this.frame });
        }
      } else {
        this.peak += (0 - this.peak) * this.aPeakDecay;
        this.floor += (A - this.floor) * (A < this.floor ? this.aFloorDown : this.aFloorUp);
        if (this.floor < 1e-5) this.floor = 1e-5;
        const on = Math.max(this.ABS_MIN, this.floor * 4, this.peak * 0.35);
        if (A > on && share > 0.6) {
          this.down = true;
          // The average takes about on/level of M samples to climb to the
          // line; the level isn't known yet, so assume the usual 1/3.
          const lag = M * (this.peak ? Math.min(1, on / this.peak) : 0.35);
          this.post({ t: 'key', down: true, frame: this.frame - lag, detect: this.frame });
          if (A > this.peak) this.peak = A;
        }
      }
    }
    // The meter, about 20 times a second.
    if (this.frame - this.lastLevel >= this.sr / 20) {
      this.lastLevel = this.frame;
      const rms = Math.sqrt(this.rmsAcc / Math.max(1, this.rmsN));
      this.post({
        t: 'level', frame: this.frame, rms, tone: this.maxA, floor: this.floor,
        on: Math.max(this.ABS_MIN, this.floor * 4, this.peak * 0.35), pitch: Math.round(this.pitch), down: this.down
      });
      this.rmsAcc = 0; this.rmsN = 0; this.maxA = 0;
    }
    return true;
  }
}
registerProcessor('hst-radio-listener', HSTRadioListener);
