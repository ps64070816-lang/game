/* ============================================================
 * gostop-ai.js — 고스톱 AI 3등급
 *  fish (하수): 먹을 수 있으면 대충 먹고, 아니면 아무거나 냄. 고를 남발.
 *  reg  (중수): 먹는 패의 가치(광·고도리·단·쌍피) + 족보 완성 보너스로 탐욕적 선택,
 *               뻑 위험 회피, 상대 점수를 보고 고/스톱.
 *  pro  (고수): 카드 카운팅(안 나온 패 추적)으로 쪽·따닥·뻑 확률과 상대가 먹어갈 위험 계산,
 *               상대 족보 견제(고도리·단·광 끊기), 확정 먹이 아껴두기,
 *               상대 위협도·고박·피박 위험을 따져 고/스톱, 흔들기 판단.
 * ============================================================ */
(function (global) {
  'use strict';
  const H = global.Hwatu;
  const R = () => Math.random();
  const OPT = { flip: false, hold: true, go: 'pro', den: 1, mcGo: true, mcSamples: 40 }; // 시뮬레이션으로 튜닝한 고수 설정

  const SET_OF = (c) => {
    if (c.sub === 'godori') return 'godori';
    if (c.sub === 'hong' || c.sub === 'cheong' || c.sub === 'cho') return c.sub;
    return null;
  };
  const countSet = (cap, set) => cap.filter((x) => SET_OF(x) === set).length;
  const countG = (cap) => cap.filter((x) => x.t === 'gwang').length;
  const piCount = (cap) => cap.reduce((s, x) => s + (x.t === 'pi' ? x.pi : 0), 0);

  /** 카드 한 장의 가치 (내 입장). denial: 상대 족보 견제 가중치 */
  function cardValue(c, me, opps, denial) {
    let v = c.t === 'gwang' ? (c.sub === 'bi' ? 6 : 10)
      : c.t === 'yul' ? (c.sub === 'godori' ? 7 : c.sub === 'kookjin' ? 6 : 5)
        : c.t === 'tti' ? 4 : c.pi * 1.6;
    const set = SET_OF(c);
    if (set) {
      const have = countSet(me.cap, set);
      v += have === 2 ? 14 : have === 1 ? 4 : 0;
      for (const o of opps) {
        const oh = countSet(o.cap, set);
        if (oh === 2) v += 11 * denial; else if (oh === 1) v += 2 * denial;
      }
    }
    if (c.t === 'gwang') {
      const g = countG(me.cap);
      v += g >= 2 ? 8 : g === 1 ? 2 : 0;
      for (const o of opps) if (countG(o.cap) >= 2) v += 7 * denial;
    }
    if (c.t === 'pi') {
      const pc = piCount(me.cap);
      if (pc >= 6) v += c.pi * 1.2;
      for (const o of opps) if (piCount(o.cap) >= 8) v += c.pi * denial;
    }
    if (c.t === 'yul' && me.cap.filter((x) => x.t === 'yul').length >= 4) v += 2;
    if (c.t === 'tti' && me.cap.filter((x) => x.t === 'tti').length >= 4) v += 2;
    return v;
  }
  const sumV = (cards, me, opps, den) => cards.reduce((s, c) => s + cardValue(c, me, opps, den), 0);
  const STEAL_V = 2.2;

  /** 뒤집힌 카드 u가 바닥(floor)에서 얻어갈 가치 */
  function flipGain(u, floor, me, opps, den) {
    const same = floor.filter((x) => x.m === u.m);
    if (same.length === 0) return -cardValue(u, opps[0] || me, [me], 0) * 0.15;
    if (same.length === 1) return cardValue(u, me, opps, den) + cardValue(same[0], me, opps, den);
    if (same.length === 2) return cardValue(u, me, opps, den) + Math.max(...same.map((x) => cardValue(x, me, opps, den)));
    return sumV([u].concat(same), me, opps, den) + STEAL_V * opps.length;
  }

  /**
   * 손패 c를 냈을 때의 기대 가치
   * @param flipEV 뒤집기 기댓값까지 계산 (고수)
   */
  function evalMove(c, g, me, level) {
    const opps = g.others(me);
    const den = level === 'pro' ? OPT.den : level === 'reg' ? 0.5 : 0;
    const floor = g.floor;
    const fm = floor.filter((x) => x.m === c.m);
    const sameHand = me.hand.filter((x) => x.m === c.m);
    const unknown = g.unknownFor(me);
    const U = Math.max(1, unknown.length);
    const kSame = unknown.filter((x) => x.m === c.m).length;
    const oppHand = opps.reduce((s, o) => s + o.hand.length, 0);
    let v = 0;

    if (sameHand.length >= 3 && fm.length === 1) {
      // 폭탄
      return sumV(sameHand.concat(fm), me, opps, den) + STEAL_V * opps.length + 12;
    }
    if (fm.length === 0) {
      // 버리기: 상대가 먹어갈 위험 vs 쪽 기회
      const oppVal = Math.max(...opps.map((o) => cardValue(c, o, [me], 0)));
      const pOpp = Math.min(1, (kSame * oppHand) / U);
      v -= oppVal * (level === 'fish' ? 0 : pOpp * 0.8);
      if (level === 'pro') v += (kSame / U) * (cardValue(c, me, opps, den) * 2 + STEAL_V * opps.length);
      if (kSame === 0) v += 0.8; // 이 월은 더 나올 패가 없음 → 안전하게 버림
    } else if (fm.length === 1) {
      const gain = cardValue(c, me, opps, den) + cardValue(fm[0], me, opps, den);
      const pPpeok = level === 'fish' ? 0 : kSame / U;
      v += gain * (1 - pPpeok) - pPpeok * (gain * 0.6 + 3);
    } else if (fm.length === 2) {
      const gain = cardValue(c, me, opps, den) + Math.max(...fm.map((x) => cardValue(x, me, opps, den)));
      const pDd = level === 'pro' ? kSame / U : 0;
      v += gain + pDd * (Math.min(...fm.map((x) => cardValue(x, me, opps, den))) + STEAL_V * opps.length);
    } else {
      const gain = sumV([c].concat(fm), me, opps, den) + (g.ppeokOwner[c.m] != null ? STEAL_V * opps.length : 0);
      v += gain;
      // 고수: 바닥 3장 + 내 손 1장은 아무도 못 먹는 '확정 먹이' → 아껴둠
      if (level === 'pro' && OPT.hold && me.hand.length > 3) v -= 6;
    }

    if (level === 'pro' && OPT.flip) {
      // 뒤집기 기댓값: 내 패를 낸 뒤의 바닥 상태에서 안 나온 패 하나가 뒤집힐 때
      const after = floor.filter((x) => !(fm.length && x.m === c.m));
      if (fm.length === 0) after.push(c);
      let ev = 0;
      for (const u of unknown) if (u.m !== c.m) ev += flipGain(u, after, me, opps, den);
      v += ev / U * 0.9;
    }
    return v;
  }

  /* ---------------- 결정 ---------------- */
  function decidePlay(me, g, level) {
    const hand = me.hand;
    if (!hand.length) return { dummy: true };
    if (level === 'fish') {
      if (me.dummies > 0 && R() < 0.5) return { dummy: true };
      const caps = hand.filter((c) => g.floor.some((x) => x.m === c.m));
      const pool = caps.length && R() < 0.75 ? caps : hand;
      return { card: pool[Math.floor(R() * pool.length)].id };
    }
    let best = null, bestV = -Infinity;
    for (const c of hand) {
      const v = evalMove(c, g, me, level) + (level === 'reg' ? R() * 0.8 : R() * 0.2);
      if (v > bestV) { bestV = v; best = c; }
    }
    if (me.dummies > 0 && bestV < 1.5) return { dummy: true };
    return { card: best.id };
  }

  function decidePick(me, g, level, options) {
    if (level === 'fish') return options[Math.floor(R() * options.length)].id;
    const opps = g.others(me);
    const den = level === 'pro' ? 1 : 0.5;
    return options.slice().sort((a, b) => cardValue(b, me, opps, den) - cardValue(a, me, opps, den))[0].id;
  }

  function potential(p, g, me) {
    // 상대가 앞으로 낼 수 있는 점수의 대략적인 위협도
    const s = H.score(p.cap);
    let threat = s.total;
    const live = new Set(g.unknownFor(me).map((c) => c.id).concat(g.floor.map((c) => c.id)));
    for (const set of ['godori', 'hong', 'cheong', 'cho']) {
      const have = countSet(p.cap, set);
      const need = H.CARDS.filter((c) => SET_OF(c) === set && live.has(c.id)).length;
      if (have === 2 && need) threat += set === 'godori' ? 3 : 2;
    }
    if (countG(p.cap) >= 2) threat += 2;
    if (piCount(p.cap) >= 8) threat += 1.5;
    return threat;
  }

  function decideGoStop(me, g, level, score) {
    const remain = me.hand.length + me.dummies;
    if (level === 'fish') return remain >= 2 && R() < 0.75 ? 'go' : 'stop';
    const opps = g.others(me);
    const maxOpp = Math.max(...opps.map((o) => H.score(o.cap).total));
    if (level === 'reg' || OPT.go === 'reg') {
      if (remain >= 3 && maxOpp < g.threshold - 1 && me.go < 2 && score.total < g.threshold + 4) return 'go';
      return 'stop';
    }
    // 고수
    const threat = Math.max(...opps.map((o) => potential(o, g, me)));
    const turnsLeft = remain;
    let risk = (threat / g.threshold) * 0.6 + (me.go * 0.18) + (turnsLeft <= 2 ? 0.35 : 0);
    if (piCount(me.cap) <= g.pibakLimit) risk += 0.1; // 역으로 피박 위험
    const reward = 1 / (score.total + 1) + (me.go >= 2 ? 0.25 : 0.12);
    if (score.total >= g.threshold * 3) risk += 0.2; // 이미 충분히 큼
    return reward > risk * 0.55 && turnsLeft >= 3 ? 'go' : 'stop';
  }

  /**
   * 고수의 고/스톱 판단: 몬테카를로 시뮬레이션
   * 내가 모르는 패(상대 손패 + 더미)를 무작위로 다시 나눠 남은 판을 끝까지 진행해 보고
   * '고'의 평균 손익과 '지금 스톱'의 확정 이득을 비교한다.
   */
  async function rolloutGoStop(me, g, samples) {
    const GS = global.GoStop;
    const myIdx = g.players.indexOf(me);
    const stopRes = g.settle(me, 'stop');
    const stopGain = stopRes.losers.reduce((s, l) => s + l.pay, 0);
    const unknown = g.players.filter((q) => q !== me).flatMap((q) => q.hand).concat(g.deck);
    let total = 0;
    for (let k = 0; k < samples; k++) {
      const sim = cloneDetermined(me, g, GS.shuffle(unknown.slice()));
      const sm = sim.players[myIdx];
      sm.go++; sm.goScore = H.score(sm.cap).total; sim.lastGoPlayer = sm;
      const r = await sim.run((myIdx + 1) % g.n);
      total += r.nagari ? -stopGain * 0.15 : payoff(r, sm); // 나가리 = 지금 이득을 놓침 (다음 판 배수로 일부 보상)
    }
    return { goEV: total / samples, stopGain };
  }
  /** 판 상태를 결정화(안 보이는 패 재분배)해서 복제 */
  function cloneDetermined(me, g, pool) {
    const GS = global.GoStop;
    const clones = g.players.map((q) => ({
      id: q.id, level: 'reg', hand: q === me ? q.hand.slice() : pool.splice(0, q.hand.length),
      cap: q.cap.slice(), go: q.go, goScore: q.goScore, shakes: q.shakes, bombs: q.bombs, ppeok: q.ppeok,
      dummies: q.dummies, shookMonths: q.shookMonths.slice(),
    }));
    const sim = new GS.GoStopGame({ players: clones, carry: g.carry, hooks: { event: noop, decide: simDecide } });
    sim.players = clones;
    sim.floor = g.floor.slice(); sim.deck = pool; sim.ppeokOwner = Object.assign({}, g.ppeokOwner);
    sim.lastGoPlayer = g.lastGoPlayer ? clones[g.players.indexOf(g.lastGoPlayer)] : null;
    return sim;
  }
  const payoff = (r, sm) => {
    if (r.nagari) return 0;
    if (r.winner === sm) return r.losers.reduce((s, l) => s + l.pay, 0);
    const mine = r.losers.find((l) => l.player === sm);
    return mine ? -mine.pay : 0;
  };
  const noop = () => Promise.resolve();
  const simDecide = (p, kind, ctx) => {
    if (kind === 'gostop') return decideGoStop(p, ctx.game, 'reg', ctx.score);
    return decide(p, kind, ctx);
  };

  function decideShake(me, g, level, cards) {
    if (level === 'fish') return R() < 0.4;
    if (level === 'reg') return R() < 0.7;
    // 고수: 손패로 먹을 게 있거나 판이 유리할 때 흔든다
    const caps = me.hand.filter((c) => g.floor.some((x) => x.m === c.m)).length;
    return caps >= 2 || H.score(me.cap).total >= 1 || R() < 0.5;
  }

  function decide(me, kind, ctx) {
    const g = ctx.game, level = me.level || 'reg';
    if (kind === 'play') return decidePlay(me, g, level);
    if (kind === 'pick') return decidePick(me, g, level, ctx.options);
    if (kind === 'gostop') {
      if (level === 'pro' && OPT.mcGo && !ctx.sim) {
        return rolloutGoStop(me, g, OPT.mcSamples).then(({ goEV, stopGain }) => (goEV > stopGain * 1.05 ? 'go' : 'stop'));
      }
      return decideGoStop(me, g, level, ctx.score);
    }
    if (kind === 'shake') return decideShake(me, g, level, ctx.cards);
    return null;
  }
  const thinkTime = (level) => ({ fish: [400, 900], reg: [550, 1100], pro: [700, 1500] }[level] || [500, 1000]);

  global.GoStopAI = { decide, thinkTime, cardValue, evalMove, OPT };
})(typeof window !== 'undefined' ? window : globalThis);
