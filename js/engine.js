/* ============================================================
 * engine.js — 텍사스 홀덤 토너먼트 규칙 엔진 (UI 독립)
 *  - 노리밋 홀덤, 시트앤고(SNG) 토너먼트 방식
 *  - 딜러 버튼 / 스몰·빅 블라인드 / 빅블라인드 앤티(BBA, 현행 TDA 방식)
 *  - 헤즈업 규칙: 버튼 = 스몰블라인드, 프리플랍 선행동, 포스트플랍 후행동
 *  - 최소 레이즈 = 직전 레이즈 크기, 불완전 올인 레이즈는 액션 재개(re-open) 안 함
 *  - 언콜드 벳 반환, 사이드팟, 스플릿 팟, 홀수 칩은 버튼 왼쪽부터
 * ============================================================ */
(function (global) {
  'use strict';
  const C = global.Cards;

  // [SB, BB, BB앤티]
  const BLIND_LEVELS = [
    [10, 20, 0], [15, 30, 0], [25, 50, 0], [50, 100, 100], [75, 150, 150],
    [100, 200, 200], [150, 300, 300], [200, 400, 400], [300, 600, 600],
    [400, 800, 800], [500, 1000, 1000], [700, 1400, 1400], [1000, 2000, 2000],
    [1500, 3000, 3000], [2000, 4000, 4000], [3000, 6000, 6000],
  ].map(([sb, bb, ante]) => ({ sb, bb, ante }));

  class PokerTable {
    /**
     * @param o.players [{id,name,isHuman,stack,...}] — 시계방향 좌석 순서
     * @param o.hooks { event(type,data):Promise, human(ctx):Promise<action>, ai(player,ctx):Promise<action> }
     */
    constructor(o) {
      this.players = o.players.map((p, i) => Object.assign({}, p, {
        seat: i, bet: 0, total: 0, hole: [], folded: false, allIn: false,
        out: p.stack <= 0, needs: false, canRaise: false, lastAction: null,
      }));
      this.levels = o.levels || BLIND_LEVELS;
      this.handsPerLevel = o.handsPerLevel || 10;
      this.hooks = o.hooks;
      this.levelIdx = 0;
      this.handNo = 0;
      this.button = -1;
      this.board = [];
      this.stats = {};
      this.bustOrder = [];
      this.players.forEach((p) => (this.stats[p.id] = {
        hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0, facedBet: 0, foldToBet: 0, showdowns: 0,
      }));
    }

    get level() { return this.levels[Math.min(this.levelIdx, this.levels.length - 1)]; }
    get n() { return this.players.length; }
    alive() { return this.players.filter((p) => !p.out); }
    inHand(p) { return !p.out && !p.folded; }
    canAct(p) { return !p.out && !p.folded && !p.allIn; }
    contenders() { return this.players.filter((p) => this.inHand(p)); }
    pot() { return this.players.reduce((s, p) => s + p.total, 0); }
    nextIdx(i, pred) {
      for (let k = 1; k <= this.n; k++) {
        const j = (((i + k) % this.n) + this.n) % this.n;
        if (pred(this.players[j])) return j;
      }
      return -1;
    }
    emit(type, data) { return this.hooks.event ? this.hooks.event(type, data || {}) : Promise.resolve(); }

    put(p, amt) {
      amt = Math.max(0, Math.min(amt, p.stack));
      p.stack -= amt; p.bet += amt; p.total += amt;
      if (p.stack === 0) p.allIn = true;
      return amt;
    }

    /* ---------------- 한 핸드 진행 ---------------- */
    async playHand() {
      this.handNo++;
      if (this.handNo > 1 && (this.handNo - 1) % this.handsPerLevel === 0 && this.levelIdx < this.levels.length - 1) {
        this.levelIdx++;
        await this.emit('levelUp', { level: this.level, levelNo: this.levelIdx + 1 });
      }
      const alive = this.alive();
      if (alive.length < 2) return null;

      for (const p of this.players) {
        Object.assign(p, { bet: 0, total: 0, hole: [], folded: p.out, allIn: false, needs: false, canRaise: false, lastAction: null, shown: false });
        if (!p.out) this.stats[p.id].hands++;
      }
      this.board = [];
      this.actions = [];
      this.street = 'preflop';
      this.preflopAggressor = null;
      this.vpipMarked = new Set();

      // 버튼 이동 (탈락자 건너뜀)
      this.button = this.button < 0
        ? this.players.indexOf(alive[Math.floor(C.rand() * alive.length)])
        : this.nextIdx(this.button, (p) => !p.out);
      const live = (p) => !p.out;
      let sbIdx, bbIdx;
      if (alive.length === 2) { sbIdx = this.button; bbIdx = this.nextIdx(sbIdx, live); }
      else { sbIdx = this.nextIdx(this.button, live); bbIdx = this.nextIdx(sbIdx, live); }
      this.sbIdx = sbIdx; this.bbIdx = bbIdx;

      await this.emit('handStart', { handNo: this.handNo, button: this.button, sb: sbIdx, bb: bbIdx, level: this.level, levelNo: this.levelIdx + 1 });

      // 블라인드 (블라인드가 앤티보다 우선)
      const L = this.level;
      const sbP = this.players[sbIdx], bbP = this.players[bbIdx];
      this.put(sbP, L.sb);
      this.put(bbP, L.bb);
      let ante = 0;
      if (L.ante && bbP.stack > 0) {
        ante = Math.min(L.ante, bbP.stack);
        bbP.stack -= ante; bbP.total += ante; // 데드머니 (베팅 금액엔 미포함)
        if (bbP.stack === 0) bbP.allIn = true;
      }
      await this.emit('blinds', { sb: sbP, bb: bbP, ante });

      // 딜링: 스몰블라인드부터 한 장씩 두 바퀴
      this.deck = C.shuffle(C.newDeck());
      for (let r = 0; r < 2; r++) {
        let i = sbIdx;
        for (let k = 0; k < alive.length; k++) {
          this.players[i].hole.push(this.deck.pop());
          i = this.nextIdx(i, live);
        }
      }
      await this.emit('deal', { order: sbIdx });

      // 프리플랍
      this.currentBet = L.bb;
      this.minRaise = L.bb;
      let revealed = false;
      await this.bettingRound(this.nextIdx(bbIdx, live));

      const streets = [['flop', 3], ['turn', 1], ['river', 1]];
      for (const [name, cnt] of streets) {
        if (this.contenders().length <= 1) break;
        this.collectBets();
        // 올인 런아웃: 액션 가능한 플레이어가 1명 이하면 패 공개
        const actors = this.contenders().filter((p) => !p.allIn).length;
        if (actors <= 1 && !revealed) {
          revealed = true;
          this.contenders().forEach((p) => (p.shown = true));
          await this.emit('allinReveal', { players: this.contenders() });
        }
        this.deck.pop(); // 번 카드
        const cards = [];
        for (let k = 0; k < cnt; k++) cards.push(this.deck.pop());
        this.board.push(...cards);
        this.street = name;
        await this.emit('street', { name, cards, board: this.board.slice(), runout: revealed });
        if (actors >= 2) {
          this.currentBet = 0;
          this.minRaise = L.bb;
          await this.bettingRound(this.nextIdx(this.button, live));
        }
      }
      this.collectBets();
      return this.finishHand();
    }

    collectBets() {
      for (const p of this.players) { p.bet = 0; }
    }

    /* ---------------- 베팅 라운드 ---------------- */
    async bettingRound(first) {
      for (const p of this.players) {
        if (this.canAct(p)) { p.needs = true; p.canRaise = true; }
        p.lastAction = null;
      }
      this.raisesThisStreet = 0;
      let idx = first;
      let guard = 0;
      while (guard++ < 500) {
        if (this.contenders().length <= 1) break;
        const p = this.players[idx];
        if (this.canAct(p) && (p.needs || p.bet < this.currentBet)) {
          const others = this.players.filter((q) => q !== p && this.canAct(q)).length;
          if (others === 0 && p.bet >= this.currentBet) {
            p.needs = false;
          } else {
            const ctx = this.buildCtx(p, others);
            let action;
            try {
              action = p.isHuman ? await this.hooks.human(ctx) : await this.hooks.ai(p, ctx);
            } catch (e) {
              if (e && e.name === 'Abort') throw e;
              console.error(e);
              action = { type: ctx.canCheck ? 'check' : 'fold' };
            }
            const rec = this.apply(p, action, ctx);
            this.actions.push(rec);
            await this.emit('action', rec);
          }
        }
        if (!this.players.some((q) => this.canAct(q) && (q.needs || q.bet < this.currentBet))) break;
        idx = (idx + 1) % this.n;
      }
    }

    buildCtx(p, others) {
      const toCall = Math.max(0, Math.min(this.currentBet - p.bet, p.stack));
      const maxTo = p.bet + p.stack;
      const minTo = Math.min(this.currentBet + this.minRaise, maxTo);
      const canRaise = p.canRaise && others > 0 && maxTo > this.currentBet;
      // 포지션: 이번 스트리트에서 나 이후에 행동할 플레이어 수
      let behind = 0;
      const lastIdx = this.street === 'preflop' ? this.bbIdx : this.button;
      if (this.players.indexOf(p) !== lastIdx) {
        let j = this.players.indexOf(p);
        for (let k = 0; k < this.n; k++) {
          j = (j + 1) % this.n;
          if (this.canAct(this.players[j])) behind++;
          if (j === lastIdx) break;
        }
      }
      return {
        player: p, hole: p.hole.slice(), board: this.board.slice(), street: this.street,
        toCall, pot: this.pot(), currentBet: this.currentBet, minRaiseTo: minTo, maxRaiseTo: maxTo,
        canRaise, canCheck: toCall === 0, stack: p.stack, bet: p.bet,
        bb: this.level.bb, sb: this.level.sb,
        opponents: this.contenders().filter((q) => q !== p),
        numInHand: this.contenders().length,
        numAlive: this.alive().length,
        behind, isButton: this.players.indexOf(p) === this.button,
        raisesThisStreet: this.raisesThisStreet,
        preflopAggressor: this.preflopAggressor,
        actions: this.actions.slice(),
        stats: this.stats,
        table: this,
      };
    }

    apply(p, action, ctx) {
      let type = action.type;
      const st = this.stats[p.id];
      const facingBet = ctx.toCall > 0;
      if (type === 'check' && !ctx.canCheck) type = 'call';
      if (type === 'fold' && ctx.canCheck) type = 'check';
      if (type === 'raise' && !ctx.canRaise) type = ctx.canCheck ? 'check' : 'call';
      if (type === 'call' && ctx.toCall === 0) type = 'check';
      let amount = 0;
      let label = type;

      if (type === 'fold') {
        p.folded = true;
      } else if (type === 'call') {
        amount = this.put(p, ctx.toCall);
      } else if (type === 'raise') {
        let to = Math.round(action.amount || ctx.minRaiseTo);
        to = Math.max(ctx.minRaiseTo, Math.min(to, ctx.maxRaiseTo));
        const prevBet = this.currentBet;
        amount = this.put(p, to - p.bet);
        const raiseSize = to - prevBet;
        label = prevBet === 0 ? 'bet' : 'raise';
        if (raiseSize >= this.minRaise) {
          this.minRaise = raiseSize;
          this.currentBet = to;
          for (const q of this.players) if (q !== p && this.canAct(q)) { q.needs = true; q.canRaise = true; }
        } else if (to > this.currentBet) {
          // 불완전 레이즈(숏 올인): 이미 행동한 플레이어에게 레이즈 권한을 다시 주지 않음
          this.currentBet = to;
          for (const q of this.players) if (q !== p && this.canAct(q) && q.bet < to) q.needs = true;
        }
        this.raisesThisStreet++;
        if (this.street === 'preflop') this.preflopAggressor = p.id;
      }
      if (p.allIn && type !== 'fold' && type !== 'check') label = 'allin';
      p.needs = false; p.canRaise = false;
      p.lastAction = label;

      // 통계 (상대 모델링용)
      if (this.street === 'preflop') {
        if ((type === 'call' || type === 'raise') && !this.vpipMarked.has(p.id)) { st.vpip++; this.vpipMarked.add(p.id); }
        if (type === 'raise') st.pfr++;
      } else {
        if (type === 'raise') st.bets++;
        if (type === 'call') st.calls++;
        if (facingBet) { st.facedBet++; if (type === 'fold') st.foldToBet++; }
      }
      return { player: p, type: label, rawType: type, amount, to: p.bet, street: this.street, pot: this.pot() };
    }

    /* ---------------- 핸드 종료 / 팟 분배 ---------------- */
    async finishHand() {
      // 언콜드 벳 반환
      const sorted = this.players.slice().sort((a, b) => b.total - a.total);
      if (sorted.length > 1 && sorted[0].total > sorted[1].total) {
        const diff = sorted[0].total - sorted[1].total;
        sorted[0].total -= diff; sorted[0].stack += diff;
        if (sorted[0].stack > 0) sorted[0].allIn = false;
        await this.emit('refund', { player: sorted[0], amount: diff });
      }

      const cont = this.contenders();
      const results = [];
      let showdown = false;
      if (cont.length === 1) {
        const amt = this.pot();
        cont[0].stack += amt;
        results.push({ amount: amt, winners: [cont[0]], hand: null, share: amt });
      } else {
        showdown = true;
        for (const p of cont) {
          p.score = C.evaluate(p.hole.concat(this.board));
          p.best5 = C.bestFive(p.hole.concat(this.board));
          p.shown = true;
          this.stats[p.id].showdowns++;
        }
        await this.emit('showdown', { players: cont, board: this.board });
        for (const pot of this.sidePots()) {
          let best = -1;
          for (const p of pot.eligible) best = Math.max(best, p.score);
          // 홀수 칩 순서: 버튼 왼쪽부터 시계방향
          const winners = [];
          for (let k = 1; k <= this.n; k++) {
            const q = this.players[(this.button + k) % this.n];
            if (pot.eligible.includes(q) && q.score === best) winners.push(q);
          }
          const share = Math.floor(pot.amount / winners.length);
          let odd = pot.amount - share * winners.length;
          for (const w of winners) { w.stack += share + (odd > 0 ? 1 : 0); odd--; }
          results.push({ amount: pot.amount, winners, hand: best, share, best5: winners[0].best5 });
        }
      }
      const totalPot = this.pot();
      for (const p of this.players) p.total = 0;
      await this.emit('win', { results, showdown, board: this.board.slice(), totalPot });

      // 탈락 처리
      const busted = this.players.filter((p) => !p.out && p.stack <= 0);
      for (const p of busted) {
        p.out = true; p.folded = true;
        p.place = this.alive().length + 1;
        this.bustOrder.push(p);
      }
      if (busted.length) await this.emit('bust', { players: busted });
      return { results, showdown };
    }

    sidePots() {
      const cont = this.contenders();
      const levels = [...new Set(cont.map((p) => p.total))].sort((a, b) => a - b);
      const pots = [];
      let prev = 0;
      for (const L of levels) {
        let amount = 0;
        for (const p of this.players) amount += Math.max(0, Math.min(p.total, L) - Math.min(p.total, prev));
        const eligible = cont.filter((p) => p.total >= L);
        if (amount > 0) pots.push({ amount, eligible });
        prev = L;
      }
      // 폴드한 플레이어의 초과분 (최상위 레벨보다 많이 낸 경우) → 마지막 팟
      let extra = 0;
      for (const p of this.players) extra += Math.max(0, p.total - prev);
      if (extra && pots.length) pots[pots.length - 1].amount += extra;
      return pots;
    }
  }

  global.Engine = { PokerTable, BLIND_LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
