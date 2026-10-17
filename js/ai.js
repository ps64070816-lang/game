/* ============================================================
 * ai.js — 상대 AI 3등급
 *   fish (하수)  : 루즈-패시브 "콜링 스테이션". 약한 패로 자주 콜, 레이즈는 넛에 가까울 때만
 *   reg  (중수)  : 타이트-어그레시브(TAG). Chen 공식 프리플랍 + 몬테카를로 승률·팟 오즈
 *   pro  (고수)  : 상대 레인지 가중 몬테카를로, 포지션/스택(M) 기반 푸시폴드,
 *                  세미블러프, 체크레이즈, 사이즈 믹스, 당신의 플레이 습관(VPIP/폴드율) 모델링
 *                  — Python 백엔드(server.py)가 켜져 있으면 백엔드 엔진의 승률 계산을 사용
 * ============================================================ */
(function (global) {
  'use strict';
  const C = global.Cards;
  const R = () => Math.random();

  /* ---------------- 공통 헬퍼 ---------------- */
  function raiseTo(ctx, frac) {
    let to;
    if (ctx.currentBet === 0) to = Math.round(ctx.pot * frac);
    else to = Math.round(ctx.currentBet + frac * (ctx.pot + ctx.toCall));
    to = Math.max(ctx.minRaiseTo, Math.min(to, ctx.maxRaiseTo));
    // 남는 스택이 팟의 30% 미만이면 그냥 올인 (커밋)
    if (ctx.maxRaiseTo - to < (ctx.pot + to) * 0.3) to = ctx.maxRaiseTo;
    return roundChips(to, ctx);
  }
  function roundChips(to, ctx) {
    if (to >= ctx.maxRaiseTo) return ctx.maxRaiseTo;
    const unit = ctx.bb >= 100 ? 25 : 5;
    to = Math.round(to / unit) * unit;
    return Math.max(ctx.minRaiseTo, Math.min(to, ctx.maxRaiseTo));
  }
  const act = {
    fold: (ctx) => (ctx.canCheck ? { type: 'check' } : { type: 'fold' }),
    check: () => ({ type: 'check' }),
    call: () => ({ type: 'call' }),
    raise: (ctx, to) => (ctx.canRaise ? { type: 'raise', amount: to } : { type: ctx.canCheck ? 'check' : 'call' }),
    allin: (ctx) => (ctx.canRaise ? { type: 'raise', amount: ctx.maxRaiseTo } : { type: ctx.canCheck ? 'check' : 'call' }),
  };
  const potOdds = (ctx) => (ctx.toCall > 0 ? ctx.toCall / (ctx.pot + ctx.toCall) : 0);
  const stackBB = (ctx) => (ctx.stack + ctx.bet) / ctx.bb;
  const numLimpers = (ctx) => ctx.actions.filter((a) => a.street === 'preflop' && a.rawType === 'call').length;

  /** 보드만으로 만든 족보보다 내 홀카드가 기여해 족보가 올라갔는지 */
  function madeInfo(ctx) {
    const all = ctx.hole.concat(ctx.board);
    const my = C.category(C.evaluate(all));
    const bd = ctx.board.length >= 5 ? C.category(C.evaluate(ctx.board)) : boardCat(ctx.board);
    return { my, boardCat: bd, improved: my > bd };
  }
  function boardCat(board) {
    const cnt = {};
    board.forEach((c) => (cnt[C.rankOf(c)] = (cnt[C.rankOf(c)] || 0) + 1));
    const v = Object.values(cnt).sort((a, b) => b - a);
    if (v[0] >= 3) return 3;
    if (v[0] === 2 && v[1] === 2) return 2;
    if (v[0] === 2) return 1;
    return 0;
  }

  /* ---------------- 백엔드 (선택) ---------------- */
  const Backend = {
    available: null,
    async check() {
      if (!/^https?:/.test(global.location ? global.location.protocol : '')) return (this.available = false);
      try {
        const r = await fetchTimeout('api/health', {}, 800);
        this.available = r.ok;
      } catch (e) { this.available = false; }
      return this.available;
    },
    async equity(hole, board, ranges, iters) {
      if (!this.available) return null;
      try {
        const r = await fetchTimeout('api/equity', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hole, board, ranges, iters }),
        }, 2500);
        if (!r.ok) return null;
        const j = await r.json();
        return typeof j.equity === 'number' ? j.equity : null;
      } catch (e) { return null; }
    },
  };
  function fetchTimeout(url, opt, ms) {
    return Promise.race([fetch(url, opt), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  }

  /* ============================================================
   * 하수 (Fish)
   * ============================================================ */
  function fish(p, ctx) {
    const s = p.style || { loose: 0.7, aggr: 0.25, bluff: 0.06 };
    const r = R();
    const ch = C.chen(ctx.hole);
    if (ctx.street === 'preflop') {
      if (ch >= 10 && r < 0.55) return act.raise(ctx, roundChips(Math.max(ctx.currentBet * 3, ctx.bb * 3), ctx));
      if (ch >= 12 && ctx.raisesThisStreet >= 1 && r < 0.4) return act.allin(ctx);
      const playable = ch >= 7 - s.loose * 6 || r < s.loose * 0.45;
      if (ctx.canCheck) return r < s.aggr * 0.15 ? act.raise(ctx, roundChips(ctx.bb * 3, ctx)) : act.check();
      if (ctx.toCall <= (ctx.stack + ctx.bet) * 0.12 && playable) return act.call();
      if (ch >= 8 || r < 0.15 * s.loose) return act.call();
      return act.fold(ctx);
    }
    const eq = C.equity(ctx.hole, ctx.board, ctx.numInHand - 1, 200);
    const m = madeInfo(ctx);
    const dr = C.draws(ctx.hole, ctx.board);
    const hasSomething = m.improved && m.my >= 1;
    if (eq > 0.78 && r < 0.5 + s.aggr * 0.3) return act.raise(ctx, raiseTo(ctx, 0.5));
    if (ctx.canCheck) {
      if (hasSomething && r < 0.3 + s.aggr * 0.3) return act.raise(ctx, raiseTo(ctx, 0.4 + r * 0.3));
      if (r < s.bluff) return act.raise(ctx, raiseTo(ctx, 0.5));
      return act.check();
    }
    const big = ctx.toCall > (ctx.stack + ctx.bet) * 0.55;
    if (hasSomething || dr.outs >= 4) {
      if (big && eq < 0.45 && r < 0.5) return act.fold(ctx);
      return act.call();
    }
    if (!big && r < 0.4 * s.loose) return act.call(); // 콜링 스테이션
    return act.fold(ctx);
  }

  /* ============================================================
   * 중수 (Regular / TAG)
   * ============================================================ */
  function reg(p, ctx) {
    const s = p.style || { loose: 0.4, aggr: 0.6, bluff: 0.15 };
    const r = R();
    const ch = C.chen(ctx.hole);
    const late = ctx.behind <= 2;
    const sbb = stackBB(ctx);
    const pair = C.rankOf(ctx.hole[0]) === C.rankOf(ctx.hole[1]);
    const looseAdj = Math.round((s.loose - 0.4) * 5);

    if (ctx.street === 'preflop') {
      if (sbb <= 12) {
        if (ctx.raisesThisStreet === 0 && ch >= (late ? 6 : 8) - looseAdj) return act.allin(ctx);
        if (ctx.raisesThisStreet > 0 && ch >= 10) return act.allin(ctx);
        if (ctx.canCheck) return act.check();
        if (ctx.toCall <= ctx.bb * 0.5 && ch >= 5) return act.call();
        return act.fold(ctx);
      }
      if (ctx.raisesThisStreet === 0) {
        if (ch >= (late ? 7 : 9) - looseAdj) {
          return act.raise(ctx, roundChips(ctx.bb * (2.5 + numLimpers(ctx)), ctx));
        }
        if (ctx.canCheck) return act.check();
        if (ctx.toCall <= ctx.sb && ch >= 5) return act.call();
        if (late && ch >= 6 && ctx.toCall <= ctx.bb) return act.call();
        return act.fold(ctx);
      }
      if (ch >= 12 || (ch >= 11 && ctx.raisesThisStreet === 1)) {
        if (ctx.raisesThisStreet >= 2 || ctx.currentBet * 3 > (ctx.stack + ctx.bet) * 0.4) return act.allin(ctx);
        return act.raise(ctx, roundChips(ctx.currentBet * 3, ctx));
      }
      if (ctx.raisesThisStreet === 1 && ch >= 9 - looseAdj && ctx.toCall <= ctx.stack * 0.12) return act.call();
      if (pair && ctx.toCall <= ctx.stack * 0.07) return act.call(); // 셋 마이닝
      return act.fold(ctx);
    }

    const ranges = ctx.opponents.map((o) => (ctx.preflopAggressor === o.id ? 8 : 3));
    const eq = C.equity(ctx.hole, ctx.board, ranges, 400);
    const po = potOdds(ctx);
    const dr = C.draws(ctx.hole, ctx.board);
    const iAmPfa = ctx.preflopAggressor === p.id;

    if (ctx.canCheck) {
      if (eq > 0.7) return act.raise(ctx, raiseTo(ctx, 0.66));
      if (eq > 0.52 && r < 0.6) return act.raise(ctx, raiseTo(ctx, 0.5));
      if (iAmPfa && ctx.street === 'flop' && ctx.numInHand <= 3 && r < 0.65) return act.raise(ctx, raiseTo(ctx, 0.5));
      if (dr.outs >= 8 && ctx.street !== 'river' && r < 0.4) return act.raise(ctx, raiseTo(ctx, 0.5));
      if (r < s.bluff * 0.6) return act.raise(ctx, raiseTo(ctx, 0.5));
      return act.check();
    }
    if (eq > 0.8) return r < 0.7 ? act.raise(ctx, raiseTo(ctx, 0.8)) : act.call();
    if (eq > po + 0.08) return act.call();
    if (ctx.street !== 'river' && dr.outs >= 8) {
      const drawEq = (dr.outs * (ctx.street === 'flop' ? 4 : 2)) / 100;
      if (drawEq > po - 0.05) return act.call();
    }
    return act.fold(ctx);
  }

  /* ============================================================
   * 고수 (Pro)
   * ============================================================ */
  function opponentRanges(p, ctx) {
    return ctx.opponents.map((o) => {
      const mine = ctx.actions.filter((a) => a.player.id === o.id);
      let rng = -99;
      const pre = mine.filter((a) => a.street === 'preflop');
      if (pre.some((a) => a.rawType === 'raise')) rng = pre.filter((a) => a.rawType === 'raise').length >= 2 ? 11 : 8;
      else if (pre.some((a) => a.rawType === 'call')) rng = 5;
      const post = mine.filter((a) => a.street !== 'preflop' && a.rawType === 'raise').length;
      if (post) rng = Math.max(rng, 4) + post * 1.5;
      // 플레이어 모델링: 루즈한 상대는 레인지를 넓게
      const st = ctx.stats[o.id];
      if (st && st.hands >= 8) {
        const vpip = st.vpip / st.hands;
        if (vpip > 0.5) rng -= 2;
        else if (vpip < 0.18) rng += 1.5;
      }
      return Math.min(rng, 12);
    });
  }
  function bluffAdjust(ctx) {
    // 상대들의 베팅 상대 폴드율에 따라 블러프 빈도 조절
    let adj = 1;
    for (const o of ctx.opponents) {
      const st = ctx.stats[o.id];
      if (!st || st.facedBet < 4) continue;
      const ftb = st.foldToBet / st.facedBet;
      if (ftb > 0.55) adj *= 1.6;
      else if (ftb < 0.3) adj *= 0.35;
    }
    return adj;
  }

  async function pro(p, ctx) {
    const s = p.style || { loose: 0.4, aggr: 0.75, bluff: 0.22 };
    const r = R();
    const ch = C.chen(ctx.hole);
    const sbb = stackBB(ctx);
    const suited = C.suitOf(ctx.hole[0]) === C.suitOf(ctx.hole[1]);
    const hi = Math.max(C.rankOf(ctx.hole[0]), C.rankOf(ctx.hole[1]));

    if (ctx.street === 'preflop') {
      // 숏스택 푸시/폴드 (M 기반)
      if (sbb <= 15) {
        if (ctx.raisesThisStreet === 0) {
          const need = ctx.behind <= 1 ? 5 : ctx.behind <= 3 ? 7 : 8;
          if (ch >= need - (sbb <= 8 ? 1 : 0)) return act.allin(ctx);
          return ctx.canCheck ? act.check() : act.fold(ctx);
        }
        const eqv = C.equity(ctx.hole, [], opponentRanges(p, ctx), 300);
        if (eqv > potOdds(ctx) + 0.03 || ch >= 10) return ctx.toCall >= ctx.stack ? act.call() : act.allin(ctx);
        return act.fold(ctx);
      }
      if (ctx.raisesThisStreet === 0) {
        const need = ctx.behind >= 4 ? 8 : ctx.behind === 3 ? 7 : ctx.behind === 2 ? 6 : 5;
        if (ch >= need) return act.raise(ctx, roundChips(ctx.bb * (2.2 + r * 0.4 + numLimpers(ctx)), ctx));
        if (ctx.canCheck) return r < 0.12 ? act.raise(ctx, roundChips(ctx.bb * 3, ctx)) : act.check();
        if (ctx.toCall <= ctx.sb && ch >= 4) return act.call();
        return act.fold(ctx);
      }
      if (ctx.raisesThisStreet === 1) {
        if (ch >= 11) return act.raise(ctx, roundChips(ctx.currentBet * (3 + r * 0.5), ctx));
        if (ctx.behind <= 1 && suited && (hi === 14 || ch >= 7) && r < 0.3 * s.aggr) {
          return act.raise(ctx, roundChips(ctx.currentBet * 3, ctx)); // 3벳 블러프
        }
        const bbDefend = ctx.player.seat === ctx.table.bbIdx && ctx.toCall <= ctx.bb * 2.5;
        if (ch >= (bbDefend ? 6 : 8) && ctx.toCall <= ctx.stack * 0.1) return act.call();
        return act.fold(ctx);
      }
      if (ch >= 13 || (ch >= 12 && r < 0.5)) return act.allin(ctx);
      if (ch >= 11 && ctx.toCall <= ctx.stack * 0.2) return act.call();
      return act.fold(ctx);
    }

    const ranges = opponentRanges(p, ctx);
    let eq = await Backend.equity(ctx.hole, ctx.board, ranges, 1500);
    if (eq == null) eq = C.equity(ctx.hole, ctx.board, ranges, 900);
    const po = potOdds(ctx);
    const dr = C.draws(ctx.hole, ctx.board);
    const spr = ctx.stack / Math.max(1, ctx.pot);
    const badj = bluffAdjust(ctx);
    const iAmPfa = ctx.preflopAggressor === p.id;
    const sizes = [0.33, 0.5, 0.66, 0.75, 1.0];

    if (ctx.canCheck) {
      if (eq > 0.78) {
        if (ctx.street !== 'river' && r < 0.2 && ctx.behind > 0) return act.check(); // 슬로우플레이 / 체크레이즈 준비
        const f = ctx.street === 'river' && r < 0.25 ? 1.3 : sizes[2 + Math.floor(r * 3)];
        return act.raise(ctx, raiseTo(ctx, f));
      }
      if (eq > 0.56 && r < 0.75) return act.raise(ctx, raiseTo(ctx, 0.5));
      if (dr.outs >= 8 && ctx.street !== 'river' && r < 0.55) return act.raise(ctx, raiseTo(ctx, 0.6));
      if (iAmPfa && ctx.street === 'flop' && ctx.numInHand === 2 && r < 0.7) return act.raise(ctx, raiseTo(ctx, 0.33));
      if (ctx.street === 'river' && eq < 0.2 && r < s.bluff * badj) return act.raise(ctx, raiseTo(ctx, 0.75));
      if (ctx.behind === 0 && ctx.numInHand === 2 && r < s.bluff * 0.8 * badj) return act.raise(ctx, raiseTo(ctx, 0.5)); // 포지션 스틸
      return act.check();
    }
    if (eq > 0.8) {
      if (spr < 1.5) return act.allin(ctx);
      return r < 0.65 ? act.raise(ctx, raiseTo(ctx, 0.9)) : act.call();
    }
    if (eq > 0.62 && ctx.raisesThisStreet <= 1 && r < 0.25 * s.aggr) return act.raise(ctx, raiseTo(ctx, 0.75));
    if (eq > po + 0.04) return act.call();
    if (ctx.street !== 'river' && dr.outs >= 8) {
      const implied = ctx.toCall < ctx.stack * 0.25 ? 0.08 : 0;
      const drawEq = (dr.outs * (ctx.street === 'flop' ? 4 : 2)) / 100;
      if (drawEq + implied > po) {
        if (r < 0.2 * s.aggr * badj) return act.raise(ctx, raiseTo(ctx, 0.8)); // 세미블러프 레이즈
        return act.call();
      }
    }
    if (ctx.street === 'flop' && eq > 0.25 && ctx.raisesThisStreet === 1 && r < 0.07 * badj) {
      return act.raise(ctx, raiseTo(ctx, 0.9)); // 체크레이즈 블러프
    }
    return act.fold(ctx);
  }

  const LEVELS = { fish, reg, pro };
  async function decide(p, ctx) {
    const fn = LEVELS[p.level] || reg;
    const res = await fn(p, ctx);
    return res;
  }
  const thinkTime = (level) => ({ fish: [500, 1300], reg: [700, 1700], pro: [900, 2400] }[level] || [600, 1500]);

  global.AI = { decide, thinkTime, Backend };
})(typeof window !== 'undefined' ? window : globalThis);
