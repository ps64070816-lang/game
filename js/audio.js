/* ============================================================
 * audio.js — Web Audio API 실시간 합성 BGM & 효과음
 *  외부 음원 파일을 쓰지 않고 코드로 연주하므로 저작권 문제가 없습니다.
 *  BGM 트랙: lounge(로비) / fremont(하수) / strip(중수) / highroller(고수)
 *            tension(올인) / victory(스테이지 클리어) / gameover
 * ============================================================ */
(function (global) {
  'use strict';

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const Audio = {
    ctx: null, master: null, bgmBus: null, sfxBus: null, noise: null,
    bgmOn: true, sfxOn: true, bgmVol: 0.5, sfxVol: 0.8,
    track: null, trackName: null, step: 0, nextTime: 0, timer: null, trackGain: null,

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = this.bgmOn ? this.bgmVol : 0;
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = this.sfxOn ? this.sfxVol : 0;
      // 간단한 리버브 (임펄스 응답 합성)
      const ir = this.makeImpulse(2.2, 2.5);
      const mkRev = (bus) => {
        const rv = this.ctx.createConvolver(); rv.buffer = ir;
        const g = this.ctx.createGain(); g.gain.value = 0.28;
        rv.connect(g); g.connect(bus); return rv;
      };
      this.reverbBgm = mkRev(this.bgmBus);
      this.reverbSfx = mkRev(this.sfxBus);
      this.bgmBus.connect(this.master); this.sfxBus.connect(this.master);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.pendingTrack) { const t = this.pendingTrack; this.pendingTrack = null; this.play(t); }
    },
    makeImpulse(sec, decay) {
      const rate = this.ctx.sampleRate, len = rate * sec;
      const buf = this.ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    },
    setBgm(on) { this.bgmOn = on; if (this.bgmBus) this.bgmBus.gain.setTargetAtTime(on ? this.bgmVol : 0, this.ctx.currentTime, 0.2); },
    setSfx(on) { this.sfxOn = on; if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? this.sfxVol : 0, this.ctx.currentTime, 0.05); },

    /* ---------------- 악기 ---------------- */
    env(g, t, a, peak, d, sus, rel, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d);
      g.gain.setValueAtTime(Math.max(0.0001, peak * sus), t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
    },
    out(node, dest, wet) {
      node.connect(dest || this.bgmBus);
      if (wet) { const s = this.ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(dest === this.sfxBus ? this.reverbSfx : this.reverbBgm); }
    },
    osc(type, freq, t, dur, dest) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      o.start(t); o.stop(t + dur + 0.05);
      if (dest) o.connect(dest);
      return o;
    },
    epiano(m, t, dur, vel, dest) {
      const g = this.ctx.createGain();
      const f = mtof(m);
      this.osc('sine', f, t, dur + 0.6, g);
      const h = this.ctx.createGain(); h.gain.value = 0.25;
      this.osc('sine', f * 2.0, t, 0.4, h); h.connect(g);
      const trem = this.ctx.createGain(); trem.gain.value = 1;
      const lfo = this.osc('sine', 5, t, dur + 0.6); const lg = this.ctx.createGain(); lg.gain.value = 0.15;
      lfo.connect(lg); lg.connect(trem.gain);
      g.connect(trem);
      this.env(g, t, 0.008, 0.16 * vel, 0.5, 0.35, 0.5, dur);
      this.out(trem, dest, 0.35);
    },
    pad(m, t, dur, vel, cutoff) {
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff || 1200; lp.Q.value = 0.5;
      [-7, 7].forEach((det) => { const o = this.osc('sawtooth', mtof(m), t, dur + 1.2, lp); o.detune.value = det; });
      lp.connect(g);
      this.env(g, t, Math.min(0.8, dur * 0.4), 0.05 * vel, 0.3, 0.8, 1.0, dur);
      this.out(g, null, 0.5);
    },
    bass(m, t, dur, vel) {
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      this.osc('triangle', mtof(m), t, dur, lp);
      this.osc('sine', mtof(m), t, dur, lp);
      lp.connect(g);
      this.env(g, t, 0.01, 0.38 * vel, 0.15, 0.5, 0.08, dur);
      this.out(g);
    },
    pluckBass(m, t, dur, vel) {
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.18);
      this.osc('sawtooth', mtof(m), t, dur, lp);
      lp.connect(g);
      this.env(g, t, 0.005, 0.26 * vel, 0.12, 0.4, 0.06, dur);
      this.out(g);
    },
    bell(m, t, vel, dest) {
      const g = this.ctx.createGain();
      const f = mtof(m);
      this.osc('sine', f, t, 1.4, g);
      const g2 = this.ctx.createGain(); g2.gain.value = 0.3; this.osc('sine', f * 3.01, t, 0.6, g2); g2.connect(g);
      this.env(g, t, 0.004, 0.12 * vel, 0.25, 0.25, 0.9, 0.3);
      this.out(g, dest, 0.5);
    },
    brass(m, t, dur, vel, dest) {
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.06); lp.frequency.linearRampToValueAtTime(1400, t + dur);
      [-5, 5].forEach((det) => { const o = this.osc('sawtooth', mtof(m), t, dur + 0.2, lp); o.detune.value = det; });
      lp.connect(g);
      this.env(g, t, 0.03, 0.09 * vel, 0.1, 0.7, 0.15, dur);
      this.out(g, dest, 0.3);
    },
    strings(m, t, dur, vel) {
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(3000, t + dur);
      [-9, 0, 9].forEach((det) => { const o = this.osc('sawtooth', mtof(m), t, dur + 0.3, lp); o.detune.value = det; });
      lp.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * vel, t + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
      this.out(g, null, 0.5);
    },
    /** 가야금 느낌의 뜯는 소리 (농현: 살짝 떨림) */
    gayageum(m, t, dur, vel, bend) {
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
      lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.35);
      const f = mtof(m);
      const o1 = this.osc('triangle', f, t, dur + 0.8, lp);
      const o2 = this.osc('sawtooth', f, t, dur + 0.8, lp); o2.detune.value = 4;
      const vib = this.osc('sine', 5.5, t, dur + 0.8); const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + 0.25);
      vib.connect(vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
      if (bend) { o1.frequency.setValueAtTime(f * 1.06, t); o1.frequency.exponentialRampToValueAtTime(f, t + 0.12); }
      lp.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.7);
      this.out(g, null, 0.45);
    },
    /** 대금/피리 느낌의 긴 선율 */
    daegeum(m, t, dur, vel) {
      const g = this.ctx.createGain();
      const f = mtof(m);
      const o = this.osc('sine', f, t, dur + 0.3, g);
      const vib = this.osc('sine', 4.8, t, dur + 0.3); const vg = this.ctx.createGain(); vg.gain.value = f * 0.01;
      vib.connect(vg); vg.connect(o.frequency);
      const n = this.ctx.createGain(); n.gain.value = 0.3; this.osc('triangle', f * 2, t, dur + 0.3, n); n.connect(g);
      this.noiseHit(t, 0.12, 'bandpass', f * 2, 2, 0.03 * vel);
      this.env(g, t, 0.08, 0.09 * vel, 0.2, 0.75, 0.25, dur);
      this.out(g, null, 0.5);
    },
    /** 장구: 덩(양편) / 쿵(북편) / 덕(채편) */
    janggu(kind, t, vel) {
      vel = vel || 1;
      if (kind === 'kung' || kind === 'deong') {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
        g.gain.setValueAtTime(0.55 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g); o.start(t); o.stop(t + 0.45); this.out(g, null, 0.2);
      }
      if (kind === 'deok' || kind === 'deong') {
        this.noiseHit(t, 0.07, 'bandpass', 2600, 3, 0.45 * vel, null, 0.25);
        this.osc('triangle', 520, t, 0.05, (() => { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.16 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); this.out(g); return g; })());
      }
      if (kind === 'giduk') { this.noiseHit(t, 0.04, 'bandpass', 3000, 4, 0.25 * vel); }
    },
    noiseHit(t, dur, type, freq, q, vel, dest, wet) {
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
      const g = this.ctx.createGain();
      s.connect(f); f.connect(g);
      g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
      this.out(g, dest, wet);
    },
    kick(t, vel, dest) {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.7 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); o.start(t); o.stop(t + 0.4);
      this.out(g, dest);
    },
    snare(t, vel) { this.noiseHit(t, 0.18, 'bandpass', 1800, 0.8, 0.35 * vel, null, 0.2); this.osc('triangle', 190, t, 0.08, (() => { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.2 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); this.out(g); return g; })()); },
    brush(t, vel) { this.noiseHit(t, 0.25, 'bandpass', 3000, 0.5, 0.12 * vel, null, 0.2); },
    hat(t, vel, open) { this.noiseHit(t, open ? 0.25 : 0.05, 'highpass', 8000, 0.7, 0.16 * vel); },
    ride(t, vel) { this.noiseHit(t, 0.5, 'bandpass', 7500, 2.5, 0.08 * vel, null, 0.3); this.bell(108, t, 0.08 * vel); },
    shaker(t, vel) { this.noiseHit(t, 0.06, 'highpass', 6000, 0.5, 0.06 * vel); },
    rim(t, vel) { this.noiseHit(t, 0.04, 'bandpass', 2500, 5, 0.3 * vel); },

    /* ---------------- BGM 시퀀서 ---------------- */
    play(name) {
      if (!this.ctx) { this.pendingTrack = name; return; }
      if (this.trackName === name) return;
      const def = TRACKS[name];
      if (!def) return;
      // 크로스페이드: 기존 트랙 페이드아웃
      if (this.trackGain) {
        const old = this.trackGain;
        old.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
        setTimeout(() => old.disconnect(), 2500);
      }
      const tg = this.ctx.createGain();
      tg.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      tg.gain.setTargetAtTime(def.gain || 1, this.ctx.currentTime + 0.05, 0.5);
      tg.connect(this.bgmBus);
      this.trackGain = tg;
      this.track = def; this.trackName = name;
      this.step = 0; this.nextTime = this.ctx.currentTime + 0.1;
      if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
    },
    stop() {
      if (this.trackGain && this.ctx) this.trackGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
      this.track = null; this.trackName = null;
    },
    schedule() {
      if (!this.track || !this.ctx) return;
      const tr = this.track;
      const stepDur = 60 / tr.bpm / (tr.stepsPerBeat || 4);
      const steps = tr.steps || 16;
      while (this.nextTime < this.ctx.currentTime + 0.15) {
        const s = this.step % steps;
        const bar = Math.floor(this.step / steps);
        const swing = (s % 2 === 1) ? stepDur * (tr.swing || 0) : 0;
        const t = this.nextTime + swing;
        const chord = tr.chords[bar % tr.chords.length];
        const prevBus = this.bgmBus;
        this.bgmBus = this.trackGain; // 트랙별 게인으로 라우팅
        try { tr.step.call(this, s, t, chord, bar, stepDur); } catch (e) { console.warn(e); }
        this.bgmBus = prevBus;
        this.nextTime += stepDur;
        this.step++;
        if (tr.once && this.step >= tr.once * steps) { this.track = null; break; }
      }
    },

    /* ---------------- 효과음 ---------------- */
    sfx(name) {
      if (!this.ctx || !this.sfxOn) return;
      const t = this.ctx.currentTime + 0.01;
      const S = this.sfxBus;
      const tone = (type, f, start, dur, vol, f2) => {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, start);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, start + dur);
        g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        o.connect(g); g.connect(S); o.start(start); o.stop(start + dur + 0.02);
      };
      switch (name) {
        case 'deal': this.noiseHit(t, 0.07, 'bandpass', 3500, 1.2, 0.5, S); break;
        case 'flip': this.noiseHit(t, 0.05, 'highpass', 2500, 1, 0.5, S); tone('triangle', 900, t, 0.04, 0.06); break;
        case 'chip':
          for (let i = 0; i < 3; i++) { const tt = t + i * 0.035 + Math.random() * 0.01; tone('sine', 3800 + Math.random() * 1500, tt, 0.06, 0.12); this.noiseHit(tt, 0.03, 'highpass', 5000, 1, 0.15, S); }
          break;
        case 'chips':
          for (let i = 0; i < 9; i++) { const tt = t + i * 0.03 + Math.random() * 0.02; tone('sine', 3200 + Math.random() * 2500, tt, 0.07, 0.1); this.noiseHit(tt, 0.03, 'highpass', 5000, 1, 0.12, S); }
          break;
        case 'check': [0, 0.11].forEach((d) => { tone('sine', 180, t + d, 0.08, 0.35, 90); this.noiseHit(t + d, 0.05, 'lowpass', 900, 1, 0.4, S); }); break;
        case 'fold': {
          const s = this.ctx.createBufferSource(); s.buffer = this.noise;
          const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
          f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(4000, t + 0.25);
          const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
          s.connect(f); f.connect(g); g.connect(S); s.start(t); s.stop(t + 0.35); break;
        }
        case 'allin':
          tone('sine', 70, t, 0.8, 0.6, 35);
          { const s = this.ctx.createBufferSource(); s.buffer = this.noise;
            const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
            f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + 0.6);
            const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
            s.connect(f); f.connect(g); g.connect(S); s.start(t); s.stop(t + 1); }
          this.sfx('chips');
          break;
        case 'turn': [76, 83].forEach((m, i) => this.bell(m, t + i * 0.12, 1.4, S)); break;
        case 'click': tone('square', 1200, t, 0.03, 0.05); break;
        case 'slap': // 화투 패를 바닥에 '탁!' 치는 소리
          this.noiseHit(t, 0.09, 'lowpass', 2200, 1.5, 0.9, S);
          this.noiseHit(t, 0.03, 'highpass', 4000, 1, 0.35, S);
          tone('sine', 160, t, 0.08, 0.35, 70);
          break;
        case 'bigslap':
          this.noiseHit(t, 0.16, 'lowpass', 1800, 1.5, 1.2, S);
          tone('sine', 120, t, 0.18, 0.6, 50);
          this.noiseHit(t + 0.02, 0.05, 'highpass', 3500, 1, 0.5, S);
          break;
        case 'gong': [55, 62, 67].forEach((m, i) => this.bell(m, t + i * 0.01, 2.2, S)); this.kick(t, 1, S); break;
        case 'win': [72, 76, 79, 84].forEach((m, i) => this.bell(m, t + i * 0.09, 1.6, S)); this.sfx('chips'); break;
        case 'lose': [67, 63, 60].forEach((m, i) => tone('triangle', mtof(m), t + i * 0.18, 0.3, 0.12)); break;
        case 'level': [79, 84, 88, 91].forEach((m, i) => this.bell(m, t + i * 0.07, 1.4, S)); break;
        case 'good': [72, 79, 84, 88, 91].forEach((m, i) => this.bell(m, t + i * 0.06, 1.8, S)); break;
        case 'fanfare':
          [[60, 0, 0.15], [64, 0.15, 0.15], [67, 0.3, 0.15], [72, 0.45, 0.6], [67, 1.05, 0.15], [72, 1.2, 0.9]].forEach(([m, d, du]) => {
            this.brass(m, t + d, du, 2.4, S); this.brass(m + 4, t + d, du, 1.6, S);
          });
          break;
        case 'jackpot':
          for (let i = 0; i < 24; i++) this.bell(84 + ((i * 5) % 12), t + i * 0.07, 1.6, S);
          for (let i = 0; i < 30; i++) tone('sine', 3000 + Math.random() * 3000, t + 0.3 + i * 0.05, 0.08, 0.08);
          this.sfx('fanfare');
          break;
        case 'knockout': tone('sawtooth', 220, t, 0.4, 0.2, 55); this.kick(t, 1.4, S); this.noiseHit(t, 0.5, 'lowpass', 1200, 1, 0.5, S); break;
        case 'heartbeat': this.kick(t, 0.9, S); this.kick(t + 0.22, 0.6, S); break;
        default: break;
      }
    },
  };

  /* ============================================================
   * BGM 트랙 정의 (16스텝 = 1마디)
   *  chord: { r: 베이스 루트(midi), v: 보이싱 배열, w: 워킹베이스(선택) }
   * ============================================================ */
  const ch = (r, v, w) => ({ r, v, w });
  const TRACKS = {
    // 로비: 라운지 재즈 (ii-V-I-VI)
    lounge: {
      bpm: 84, swing: 0.33, gain: 0.9,
      chords: [ch(38, [53, 57, 60, 64], [38, 41, 45, 42]), ch(43, [53, 57, 59, 64], [43, 47, 50, 49]), ch(36, [52, 55, 59, 62], [36, 40, 43, 44]), ch(45, [55, 58, 61, 64], [45, 44, 43, 40])],
      step(s, t, c, bar, sd) {
        if (s % 4 === 0) this.bass(c.w[s / 4] - 0, t, sd * 3.5, 1);
        if (s === 0 || s === 6 || (s === 11 && bar % 2)) c.v.forEach((m) => this.epiano(m, t, sd * (s === 0 ? 5 : 3), 1));
        if (s % 4 === 0 || s % 4 === 3) this.ride(t, s % 4 === 0 ? 1 : 0.6);
        if (s === 4 || s === 12) this.brush(t, 1);
        if (s % 2 === 0 && bar % 4 === 3 && Math.random() < 0.4) this.bell(c.v[Math.floor(Math.random() * 4)] + 12, t, 0.8);
      },
    },
    // 하수: 프리몬트 스트리트 — 밝은 보사노바
    fremont: {
      bpm: 112, swing: 0.1, gain: 0.9,
      chords: [ch(41, [57, 60, 64, 65]), ch(38, [57, 60, 62, 65]), ch(43, [58, 62, 65, 69]), ch(36, [58, 60, 64, 67])],
      step(s, t, c, bar, sd) {
        if (s === 0 || s === 8) this.bass(c.r, t, sd * 2.5, 1);
        if (s === 6 || s === 14) this.bass(c.r + 7, t, sd * 1.5, 0.9);
        if ([0, 3, 6, 10, 12].includes(s)) c.v.forEach((m) => this.epiano(m, t, sd * 1.4, 0.8));
        if ([3, 6, 10, 13].includes(s)) this.rim(t, 0.8);
        this.shaker(t, s % 2 ? 0.6 : 1);
        if (s === 0 || s === 8) this.kick(t, 0.5);
        if (s % 4 === 2 && Math.random() < 0.35) this.bell(c.v[Math.floor(Math.random() * 4)] + 12, t, 0.9);
      },
    },
    // 중수: 더 스트립 — 디스코 펑크
    strip: {
      bpm: 116, swing: 0, gain: 0.8,
      chords: [ch(40, [55, 59, 62, 66]), ch(40, [55, 59, 62, 66]), ch(45, [55, 59, 61, 64]), ch(45, [55, 59, 61, 64]), ch(36, [55, 59, 62, 64]), ch(35, [54, 57, 59, 63])],
      step(s, t, c, bar, sd) {
        if (s % 4 === 0) this.kick(t, 0.8);
        if (s === 4 || s === 12) this.snare(t, 0.9);
        this.hat(t, s % 4 === 2 ? 1 : 0.5, s % 4 === 2);
        const bl = [0, 3, 6, 7, 10, 12, 14];
        if (bl.includes(s)) this.pluckBass(c.r + (s === 3 || s === 7 || s === 14 ? 12 : 0), t, sd * 0.9, 1);
        if (s === 6 || s === 14) c.v.forEach((m) => this.brass(m, t, sd * 0.8, 0.8));
        if (s === 0 && bar % 2 === 0) c.v.forEach((m) => this.pad(m + 12, t, sd * 30, 0.6, 2400));
      },
    },
    // 고수: 하이롤러 룸 — 다크 누아르 재즈
    highroller: {
      bpm: 72, swing: 0.25, gain: 1,
      chords: [ch(36, [51, 55, 59, 62]), ch(44, [55, 60, 63, 67]), ch(41, [56, 60, 63, 67]), ch(43, [53, 56, 59, 63])],
      step(s, t, c, bar, sd) {
        if (s === 0) c.v.forEach((m) => this.pad(m, t, sd * 15, 0.9, 900));
        if (s === 0 || s === 10) this.bass(c.r, t, sd * 4, 1.1);
        if (s % 2 === 0) this.epiano(c.v[(s / 2) % 4] + 12, t, sd * 1.8, 0.55);
        if (s === 0) this.kick(t, 0.6);
        if (s === 8) this.brush(t, 0.8);
        if (s % 4 === 0) this.ride(t, 0.5);
      },
    },
    // 올인 긴장감
    tension: {
      bpm: 132, swing: 0, gain: 0.9,
      chords: [ch(33, [57, 60, 64]), ch(29, [57, 60, 65]), ch(33, [57, 60, 64]), ch(28, [56, 59, 64])],
      step(s, t, c, bar, sd) {
        if (s % 2 === 0) this.pluckBass(c.r, t, sd * 0.8, 1);
        if (s === 0 || s === 3) this.kick(t, s === 0 ? 1 : 0.6);
        if (s === 0) c.v.forEach((m) => this.strings(m, t, sd * 15, 1));
        if (s % 4 === 2) this.hat(t, 0.6);
        if (s % 2 === 1) this.bell(c.v[s % 3] + 24, t, 0.3);
      },
    },
    // 고스톱 하수: 굿거리 장단 (12/8, 흥겨운 평조 5음계)
    gutgeori: {
      bpm: 76, steps: 12, stepsPerBeat: 3, swing: 0, gain: 0.95,
      chords: [ch(43, [67, 69, 71, 74, 76]), ch(48, [72, 74, 76, 79, 81]), ch(50, [74, 76, 79, 81, 83]), ch(43, [67, 71, 74, 76, 79])],
      step(s, t, c, bar, sd) {
        const pat = { 0: 'deong', 3: 'giduk', 4: 'deok', 6: 'kung', 9: 'deok', 10: 'giduk' };
        if (pat[s]) this.janggu(pat[s], t, s === 0 ? 1 : 0.8);
        if (s === 0 || s === 6) this.bass(c.r, t, sd * 5, 0.7);
        const mel = [0, -1, 2, 1, -1, 3, 4, -1, 2, 3, -1, 1];
        const k = mel[(s + bar * 5) % 12];
        if (k >= 0 && Math.random() < 0.85) this.gayageum(c.v[k], t, sd * 2, 1, s === 0);
        if (s === 0 && bar % 2 === 1) this.daegeum(c.v[4] + 12, t, sd * 10, 0.8);
      },
    },
    // 고스톱 중수: 세마치 장단 (빠르고 경쾌)
    semachi: {
      bpm: 108, steps: 9, stepsPerBeat: 3, swing: 0, gain: 0.9,
      chords: [ch(45, [69, 72, 74, 76, 79]), ch(43, [67, 69, 72, 74, 76]), ch(41, [65, 69, 72, 74, 77]), ch(40, [64, 67, 69, 71, 76])],
      step(s, t, c, bar, sd) {
        const pat = { 0: 'deong', 3: 'deong', 5: 'deok', 6: 'kung', 7: 'deok' };
        if (pat[s]) this.janggu(pat[s], t, 0.9);
        if (s === 0) this.pluckBass(c.r, t, sd * 2, 1);
        if (s === 6) this.pluckBass(c.r + 7, t, sd * 2, 0.9);
        if (s % 2 === 0) this.gayageum(c.v[(s / 2 + bar) % 5], t, sd * 1.5, 0.9);
        if (s === 0) this.daegeum(c.v[(bar * 2) % 5] + 12, t, sd * 4, 0.7);
      },
    },
    // 고스톱 고수: 진양조 느낌 (느리고 비장한 계면조)
    jinyang: {
      bpm: 54, steps: 12, stepsPerBeat: 3, swing: 0, gain: 1,
      chords: [ch(40, [64, 67, 69, 71, 74]), ch(45, [69, 72, 74, 76, 79]), ch(38, [62, 64, 67, 69, 71]), ch(40, [64, 67, 71, 74, 76])],
      step(s, t, c, bar, sd) {
        if (s === 0) { this.janggu('deong', t, 1); c.v.slice(0, 3).forEach((m) => this.pad(m - 12, t, sd * 11, 0.8, 700)); this.bass(c.r - 12, t, sd * 10, 1); }
        if (s === 6) this.janggu('kung', t, 0.7);
        if (s === 9) this.janggu('deok', t, 0.6);
        if (s === 0 || s === 4 || s === 8) this.gayageum(c.v[(s / 4 + bar) % 5], t, sd * 4, 0.9, true);
        if (s === 2 && bar % 2 === 0) this.daegeum(c.v[3] + 12, t, sd * 8, 0.9);
      },
    },
    // 승리
    victory: {
      bpm: 124, swing: 0, gain: 0.9,
      chords: [ch(36, [60, 64, 67, 72]), ch(43, [59, 62, 67, 71]), ch(45, [60, 64, 69, 72]), ch(41, [60, 65, 69, 72])],
      step(s, t, c, bar, sd) {
        if (s % 4 === 0) this.kick(t, 0.8);
        if (s === 4 || s === 12) this.snare(t, 0.8);
        this.hat(t, 0.5, s % 4 === 2);
        if (s % 2 === 0) this.pluckBass(c.r + (s % 4 ? 12 : 0), t, sd, 1);
        const mel = [0, 2, 3, 2, 1, 2, 3, 3];
        if (s % 2 === 0) this.brass(c.v[mel[s / 2]] + 12, t, sd * 1.6, 1.1);
        if (s === 0) c.v.forEach((m) => this.pad(m, t, sd * 15, 0.7, 2500));
      },
    },
    // 게임오버
    gameover: {
      bpm: 60, swing: 0, gain: 1,
      chords: [ch(33, [57, 60, 64]), ch(38, [57, 62, 65]), ch(40, [56, 59, 62, 64]), ch(33, [57, 60, 64])],
      step(s, t, c, bar, sd) {
        if (s === 0) { this.bass(c.r, t, sd * 14, 1); c.v.forEach((m) => this.pad(m, t, sd * 15, 0.7, 700)); }
        if (s % 4 === 0) this.epiano(c.v[(s / 4) % c.v.length] + 12, t, sd * 3, 0.8);
      },
    },
  };

  global.GameAudio = Audio;
})(window);
