/* ============================================================
 * gostop.js — 고스톱 규칙 엔진 (UI 독립)
 *  - 3인 고스톱: 손패 7장, 바닥 6장, 3점 이상 '날 수' 있음
 *  - 2인 맞고  : 손패 10장, 바닥 8장, 7점 이상
 *  - 쪽 / 뻑 / 따닥 / 뻑 먹기(자뻑 2장) / 싹쓸이 / 폭탄 → 상대 피 1장씩 뺏기
 *  - 흔들기·폭탄 ×2, 고: 1고 +1, 2고 +2, 3고부터 +3점에 ×2, ×4 …
 *  - 피박·광박·멍박 ×2, 고박(고 한 뒤 남이 나면 독박), 나가리 시 다음 판 ×2
 *  - 총통(시작 시 손패 같은 월 4장) / 3뻑 즉시 승리
 * ============================================================ */
(function (global) {
  'use strict';
  const H = global.Hwatu;

  function rand() {
    if (global.crypto && global.crypto.getRandomValues) {
      const a = new Uint32Array(1); global.crypto.getRandomValues(a); return a[0] / 4294967296;
    }
    return Math.random();
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  class GoStopGame {
    /**
     * @param o.players [{id,name,isHuman,level,...}] 시계방향 순서
     * @param o.dealer  선(先) 인덱스
     * @param o.carry   나가리 누적 배수 (1, 2, 4 …)
     * @param o.hooks   { event(type,data):Promise, decide(player,kind,ctx):Promise }
     */
    constructor(o) {
      this.players = o.players.map((p) => Object.assign({}, p, {
        hand: [], cap: [], go: 0, goScore: 0, shakes: 0, bombs: 0, ppeok: 0, dummies: 0, shookMonths: [],
      }));
      this.n = this.players.length;
      this.mode = this.n === 2 ? 'matgo' : 'gostop';
      this.threshold = this.n === 2 ? 7 : 3;
      this.pibakLimit = this.n === 2 ? 7 : 5;
      this.dealer = o.dealer || 0;
      this.carry = o.carry || 1;
      this.hooks = o.hooks;
      this.floor = []; this.deck = [];
      this.ppeokOwner = {};
      this.lastGoPlayer = null;
      this.turnNo = 0;
    }
    emit(type, data) { return this.hooks.event ? this.hooks.event(type, data || {}) : Promise.resolve(); }
    decide(p, kind, ctx) { return this.hooks.decide(p, kind, Object.assign({ game: this, me: p }, ctx || {})); }
    others(p) { return this.players.filter((q) => q !== p); }
    score(p) { return H.score(p.cap); }
    /** 아직 보지 못한 카드 (내 손패·바닥·먹은 패에 없는 카드) — AI 카드 카운팅용 */
    unknownFor(p) {
      const seen = new Set();
      p.hand.forEach((c) => seen.add(c.id));
      this.floor.forEach((c) => seen.add(c.id));
      this.players.forEach((q) => q.cap.forEach((c) => seen.add(c.id)));
      return H.CARDS.filter((c) => !seen.has(c.id));
    }

    deal() {
      for (let tries = 0; tries < 50; tries++) {
        const deck = shuffle(H.CARDS.slice());
        const handN = this.n === 2 ? 10 : 7, floorN = this.n === 2 ? 8 : 6;
        this.players.forEach((p) => { p.hand = deck.splice(0, handN); });
        this.floor = deck.splice(0, floorN);
        this.deck = deck;
        // 바닥에 같은 월 4장 → 재배분
        const cnt = {};
        this.floor.forEach((c) => (cnt[c.m] = (cnt[c.m] || 0) + 1));
        if (Object.values(cnt).some((v) => v >= 4)) continue;
        return;
      }
    }

    async play() {
      this.deal();
      this.players.forEach((p) => { p.goScore = this.threshold - 1; p.hand.sort((a, b) => a.id - b.id); });
      await this.emit('deal', {});
      // 총통
      for (let k = 0; k < this.n; k++) {
        const p = this.players[(this.dealer + k) % this.n];
        const cnt = {};
        p.hand.forEach((c) => (cnt[c.m] = (cnt[c.m] || 0) + 1));
        const m = Object.keys(cnt).find((x) => cnt[x] === 4);
        if (m) {
          await this.emit('special', { p, kind: 'chongtong', month: +m, cards: p.hand.filter((c) => c.m === +m) });
          return this.settle(p, 'chongtong', 10);
        }
      }
      return this.run(this.dealer);
    }

    /** idx 플레이어부터 판을 끝까지 진행 (AI 시뮬레이션에서도 사용) */
    async run(idx) {
      while (this.players.some((p) => p.hand.length + p.dummies > 0)) {
        const p = this.players[idx];
        if (p.hand.length + p.dummies > 0) {
          this.turnNo++;
          const res = await this.turn(p);
          if (res) return res;
        }
        idx = (idx + 1) % this.n;
      }
      await this.emit('nagari', { carry: this.carry * 2 });
      return { nagari: true, players: this.players, carry: this.carry * 2 };
    }

    async pick(p, options, source) {
      if (options.length < 2) return options[0];
      if (options[0].t === options[1].t && options[0].pi === options[1].pi && options[0].sub === options[1].sub) return options[0];
      const id = await this.decide(p, 'pick', { options, source });
      return options.find((c) => c.id === id) || options[0];
    }

    async turn(p) {
      const before = this.score(p);
      await this.emit('turnStart', { p });
      const specials = [];
      let steal = 0;
      let c = null, m = 0, nBefore = 0, pickHand = null, bombed = false;

      const dec = await this.decide(p, 'play', {});
      if ((dec && dec.dummy && p.dummies > 0) || p.hand.length === 0) {
        p.dummies = Math.max(0, p.dummies - 1);
        await this.emit('play', { p, cards: [], dummy: true });
      } else {
        c = p.hand.find((x) => x.id === (dec && dec.card)) || p.hand[0];
        m = c.m;
        const sameHand = p.hand.filter((x) => x.m === m);
        const fm = this.floor.filter((x) => x.m === m);
        nBefore = fm.length;
        if (sameHand.length >= 3 && fm.length === 1) {
          // 폭탄: 같은 월 3장을 한 번에 내고 4장을 모두 가져감
          const three = sameHand.slice(0, 3);
          p.hand = p.hand.filter((x) => !three.includes(x));
          this.floor.push(...three);
          bombed = true; p.shakes++; p.bombs++; p.dummies += 2; steal++;
          specials.push('bomb');
          await this.emit('play', { p, cards: three, bomb: true });
        } else {
          if (sameHand.length >= 3 && fm.length === 0 && !p.shookMonths.includes(m)) {
            const yes = await this.decide(p, 'shake', { cards: sameHand });
            if (yes) {
              p.shakes++; p.shookMonths.push(m);
              await this.emit('shake', { p, cards: sameHand.slice(0, 3) });
            }
          }
          if (nBefore === 2) pickHand = await this.pick(p, fm, 'hand');
          p.hand = p.hand.filter((x) => x !== c);
          this.floor.push(c);
          await this.emit('play', { p, cards: [c] });
        }
      }

      // 더미에서 한 장 뒤집기
      let d = null;
      if (this.deck.length) {
        d = this.deck.pop();
        this.floor.push(d);
        await this.emit('flip', { p, card: d });
      }

      const captured = [];
      const take = (cards) => cards.forEach((x) => {
        const i = this.floor.indexOf(x);
        if (i >= 0) { this.floor.splice(i, 1); captured.push(x); }
      });
      const eatPpeok = (month) => {
        if (this.ppeokOwner[month] == null) return 0;
        const own = this.ppeokOwner[month] === p.id;
        delete this.ppeokOwner[month];
        specials.push(own ? 'jappeok' : 'ppeokEat');
        return own ? 2 : 1;
      };

      if (bombed) take(this.floor.filter((x) => x.m === m && x !== d));
      let ppeoked = false;
      if (c && !bombed) {
        if (d && d.m === m) {
          if (nBefore === 0) { take([c, d]); steal++; specials.push('jjok'); }
          else if (nBefore === 1) { this.ppeokOwner[m] = p.id; p.ppeok++; ppeoked = true; specials.push('ppeok'); }
          else if (nBefore === 2) { take(this.floor.filter((x) => x.m === m)); steal++; specials.push('ddadak'); }
        } else if (nBefore === 1) take(this.floor.filter((x) => x.m === m));
        else if (nBefore === 2) take([c, pickHand]);
        else if (nBefore === 3) { take(this.floor.filter((x) => x.m === m)); steal += eatPpeok(m); }
      }
      if (d && this.floor.includes(d) && !ppeoked && !(c && !bombed && d.m === m)) {
        const same = this.floor.filter((x) => x.m === d.m && x !== d);
        if (same.length === 1) take([d, same[0]]);
        else if (same.length === 2) { const pk = await this.pick(p, same, 'flip'); take([d, pk]); }
        else if (same.length === 3) { take([d].concat(same)); steal += eatPpeok(d.m); }
      }
      if (this.floor.length === 0 && this.deck.length > 0 && captured.length) { steal++; specials.push('sweep'); }

      if (captured.length) {
        p.cap.push(...captured);
        await this.emit('capture', { p, cards: captured });
      }
      for (const kind of specials) await this.emit('special', { p, kind });
      // 피 뺏기
      for (let k = 0; k < steal; k++) {
        for (const o of this.others(p)) {
          const pis = o.cap.filter((x) => x.t === 'pi').sort((a, b) => a.pi - b.pi);
          if (!pis.length) continue;
          const got = pis[0];
          o.cap.splice(o.cap.indexOf(got), 1);
          p.cap.push(got);
          await this.emit('steal', { from: o, to: p, card: got });
        }
      }
      const after = this.score(p);
      await this.emit('score', { p, before, after });

      if (p.ppeok >= 3) {
        await this.emit('special', { p, kind: 'threePpeok' });
        return this.settle(p, 'threePpeok', 7);
      }

      // 고 / 스톱
      if (after.total >= this.threshold && after.total > p.goScore) {
        const last = p.hand.length + p.dummies === 0 || this.deck.length === 0;
        let choice = 'stop';
        if (!last) choice = await this.decide(p, 'gostop', { score: after });
        if (choice === 'go') {
          p.go++; p.goScore = after.total; this.lastGoPlayer = p;
          await this.emit('go', { p, count: p.go, score: after.total });
        } else {
          await this.emit('stop', { p, score: after.total });
          return this.settle(p, 'stop');
        }
      }
      return null;
    }

    /** 정산: 승자 점수 × 배수, 패자별 지불 점수 */
    settle(w, reason, fixedBase) {
      const ws = this.score(w);
      let pts, goBonus = 0, goMul = 1;
      const shakeMul = Math.pow(2, w.shakes);
      if (fixedBase) {
        pts = fixedBase;
      } else {
        goBonus = w.go;
        goMul = w.go >= 3 ? Math.pow(2, w.go - 2) : 1;
        pts = (ws.total + goBonus) * goMul;
      }
      const meongbak = !fixedBase && ws.nYul >= 7;
      const losers = this.others(w).map((L) => {
        const ls = this.score(L);
        const flags = {
          pibak: !fixedBase && ws.piPts > 0 && ls.piCount <= this.pibakLimit,
          gwangbak: !fixedBase && ws.gwangPts > 0 && ls.nG === 0,
          meongbak,
          gobak: !fixedBase && L.go > 0,
        };
        let mul = (fixedBase ? 1 : shakeMul) * this.carry;
        if (flags.pibak) mul *= 2;
        if (flags.gwangbak) mul *= 2;
        if (flags.meongbak) mul *= 2;
        return { player: L, score: ls, flags, mul, points: pts * mul };
      });
      // 고박: 고를 외친 패자가 독박 (3인) / ×2 (맞고)
      const gobaker = losers.find((l) => l.flags.gobak && this.lastGoPlayer === l.player) || losers.find((l) => l.flags.gobak);
      if (gobaker) {
        if (this.n === 2) { gobaker.points *= 2; gobaker.mul *= 2; }
        else {
          const sum = losers.reduce((s, l) => s + l.points, 0);
          losers.forEach((l) => { l.paysFor = l === gobaker ? sum : 0; });
        }
      }
      losers.forEach((l) => { l.pay = l.paysFor != null ? l.paysFor : l.points; });
      return {
        nagari: false, reason, winner: w, ws, pts, goBonus, goMul, go: w.go, shakes: w.shakes, shakeMul,
        carry: this.carry, losers, players: this.players,
      };
    }
  }

  global.GoStop = { GoStopGame, shuffle, rand };
})(typeof window !== 'undefined' ? window : globalThis);
