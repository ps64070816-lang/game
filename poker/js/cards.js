/* ============================================================
 * cards.js — 덱, 7카드 족보 평가기, 몬테카를로 승률 계산
 * 카드 표현: 0..51 정수.  rank = (id>>2)+2 (2..14), suit = id&3
 * suit: 0=♠ 1=♥ 2=♦ 3=♣
 * ============================================================ */
(function (global) {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const SUIT_NAMES = ['spade', 'heart', 'diamond', 'club'];
  const RANK_CH = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const HAND_NAMES_KO = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시', '로열 플러시'];
  const HAND_NAMES_EN = ['HIGH CARD', 'ONE PAIR', 'TWO PAIR', 'THREE OF A KIND', 'STRAIGHT', 'FLUSH', 'FULL HOUSE', 'FOUR OF A KIND', 'STRAIGHT FLUSH', 'ROYAL FLUSH'];

  const rankOf = (c) => (c >> 2) + 2;
  const suitOf = (c) => c & 3;
  const cardStr = (c) => RANK_CH[rankOf(c)] + SUITS[suitOf(c)];

  function newDeck() {
    const d = [];
    for (let i = 0; i < 52; i++) d.push(i);
    return d;
  }

  // 암호학적 난수 기반 Fisher–Yates 셔플 (공정한 딜링)
  function rand() {
    if (global.crypto && global.crypto.getRandomValues) {
      const a = new Uint32Array(1);
      global.crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // 스트레이트 최고 랭크 (A-2-3-4-5 휠 포함), 없으면 0
  function straightHigh(mask) {
    if (mask & (1 << 14)) mask |= 2; // A를 1로도 취급
    for (let h = 14; h >= 5; h--) {
      if (((mask >> (h - 4)) & 31) === 31) return h;
    }
    return 0;
  }

  const B = [1048576, 65536, 4096, 256, 16, 1]; // 16^5 .. 16^0
  function score(cat, ks) {
    let s = cat * B[0];
    for (let i = 0; i < ks.length && i < 5; i++) s += ks[i] * B[i + 1];
    return s;
  }
  function topBits(mask, n) {
    const out = [];
    for (let r = 14; r >= 2 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
    return out;
  }

  /** 5~7장의 카드를 평가해 비교 가능한 정수 점수 반환 (클수록 강함) */
  function evaluate(cards) {
    const rc = new Int8Array(15);
    const sc = [0, 0, 0, 0];
    const sm = [0, 0, 0, 0];
    let mask = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const r = (c >> 2) + 2, s = c & 3;
      rc[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r;
    }
    let fs = -1;
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
    if (fs >= 0) {
      const sf = straightHigh(sm[fs]);
      if (sf) return score(sf === 14 ? 9 : 8, [sf]);
    }
    let q = 0; const trips = [], pairs = [];
    for (let r = 14; r >= 2; r--) {
      if (rc[r] === 4) q = r;
      else if (rc[r] === 3) trips.push(r);
      else if (rc[r] === 2) pairs.push(r);
    }
    if (q) {
      return score(7, [q, topBits(mask & ~(1 << q), 1)[0] || 0]);
    }
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const p = Math.max(trips[1] || 0, pairs[0] || 0);
      return score(6, [trips[0], p]);
    }
    if (fs >= 0) return score(5, topBits(sm[fs], 5));
    const st = straightHigh(mask);
    if (st) return score(4, [st]);
    if (trips.length) {
      return score(3, [trips[0]].concat(topBits(mask & ~(1 << trips[0]), 2)));
    }
    if (pairs.length >= 2) {
      const k = topBits(mask & ~(1 << pairs[0]) & ~(1 << pairs[1]), 1)[0] || 0;
      return score(2, [pairs[0], pairs[1], k]);
    }
    if (pairs.length === 1) {
      return score(1, [pairs[0]].concat(topBits(mask & ~(1 << pairs[0]), 3)));
    }
    return score(0, topBits(mask, 5));
  }

  const category = (sc) => Math.floor(sc / B[0]);
  const handName = (sc) => HAND_NAMES_KO[category(sc)];
  const handNameEn = (sc) => HAND_NAMES_EN[category(sc)];

  /** 7장 중 최고의 5장 조합 (쇼다운 하이라이트용) */
  function bestFive(cards) {
    if (cards.length <= 5) return cards.slice();
    let best = -1, bestSet = null;
    const pick = [];
    (function rec(start) {
      if (pick.length === 5) {
        const s = evaluate(pick);
        if (s > best) { best = s; bestSet = pick.slice(); }
        return;
      }
      for (let i = start; i < cards.length; i++) { pick.push(cards[i]); rec(i + 1); pick.pop(); }
    })(0);
    return bestSet;
  }

  /* ---------------- 프리플랍 핸드 강도 (Chen formula) ---------------- */
  function chen(hole) {
    let r1 = rankOf(hole[0]), r2 = rankOf(hole[1]);
    if (r2 > r1) { const t = r1; r1 = r2; r2 = t; }
    const pts = { 14: 10, 13: 8, 12: 7, 11: 6 };
    let s = pts[r1] || r1 / 2;
    if (r1 === r2) { s = Math.max(5, s * 2); if (r1 === 5) s = 6; }
    if (suitOf(hole[0]) === suitOf(hole[1])) s += 2;
    const gap = r1 - r2 - 1;
    if (r1 !== r2) {
      if (gap === 1) s -= 1; else if (gap === 2) s -= 2; else if (gap === 3) s -= 4; else if (gap >= 4) s -= 5;
      if (gap <= 1 && r1 < 12) s += 1;
    }
    return Math.ceil(s);
  }

  /** 핸드 표기 (예: AKs, QQ, T9o) */
  function handCode(hole) {
    let r1 = rankOf(hole[0]), r2 = rankOf(hole[1]);
    if (r2 > r1) { const t = r1; r1 = r2; r2 = t; }
    const ch = (r) => (r === 10 ? 'T' : RANK_CH[r]);
    if (r1 === r2) return ch(r1) + ch(r2);
    return ch(r1) + ch(r2) + (suitOf(hole[0]) === suitOf(hole[1]) ? 's' : 'o');
  }

  /**
   * 몬테카를로 승률 계산
   * @param hole 내 홀카드 2장
   * @param board 공개된 보드 (0~5장)
   * @param opps 상대 수, 또는 상대별 최소 Chen 점수 배열 (레인지 가중)
   * @param iters 반복 횟수
   */
  function equity(hole, board, opps, iters) {
    const ranges = Array.isArray(opps) ? opps : new Array(Math.max(1, opps)).fill(-99);
    const nOpp = ranges.length;
    const used = new Uint8Array(52);
    hole.forEach((c) => (used[c] = 1));
    board.forEach((c) => (used[c] = 1));
    const rest = [];
    for (let i = 0; i < 52; i++) if (!used[i]) rest.push(i);
    const need = 5 - board.length;
    let win = 0;
    const my = new Array(7), op = new Array(7);
    for (let it = 0; it < iters; it++) {
      // 부분 셔플
      const deck = rest.slice();
      let top = deck.length;
      const draw = () => {
        const j = Math.floor(Math.random() * top);
        const c = deck[j]; deck[j] = deck[top - 1]; deck[top - 1] = c; top--;
        return c;
      };
      const oh = [];
      for (let o = 0; o < nOpp; o++) {
        let a = draw(), b = draw();
        // 레인지 가중: 범위 밖 핸드는 몇 번 재추첨 (rejection sampling)
        let tries = 0;
        while (ranges[o] > -99 && chen([a, b]) < ranges[o] && tries < 6) {
          deck[top++] = a; deck[top++] = b; // 반납
          a = draw(); b = draw(); tries++;
        }
        oh.push(a, b);
      }
      const bd = board.slice();
      for (let k = 0; k < need; k++) bd.push(draw());
      my[0] = hole[0]; my[1] = hole[1];
      for (let k = 0; k < 5; k++) { my[k + 2] = bd[k]; op[k + 2] = bd[k]; }
      const ms = evaluate(my);
      let best = 0, ties = 0, lost = false;
      for (let o = 0; o < nOpp; o++) {
        op[0] = oh[o * 2]; op[1] = oh[o * 2 + 1];
        const s = evaluate(op);
        if (s > ms) { lost = true; break; }
        if (s === ms) ties++;
        if (s > best) best = s;
      }
      if (!lost) win += ties ? 1 / (ties + 1) : 1;
    }
    return win / iters;
  }

  /** 드로우 감지 (플러시 드로우, 양방향/거트샷 스트레이트 드로우) */
  function draws(hole, board) {
    const all = hole.concat(board);
    const sc = [0, 0, 0, 0];
    let mask = 0;
    all.forEach((c) => { sc[suitOf(c)]++; mask |= 1 << rankOf(c); });
    const holeSuits = hole.map(suitOf);
    const flushDraw = sc.some((n, s) => n === 4 && holeSuits.includes(s));
    let oesd = false, gutshot = false;
    if (!straightHigh(mask)) {
      let m = mask; if (m & (1 << 14)) m |= 2;
      for (let lo = 1; lo <= 10; lo++) {
        let cnt = 0;
        for (let k = 0; k < 5; k++) if (m & (1 << (lo + k))) cnt++;
        if (cnt === 4) {
          const missingEnd = !(m & (1 << lo)) || !(m & (1 << (lo + 4)));
          if (missingEnd && lo > 1 && lo < 10) oesd = true; else gutshot = true;
        }
      }
    }
    const outs = (flushDraw ? 9 : 0) + (oesd ? 8 : gutshot ? 4 : 0) - (flushDraw && (oesd || gutshot) ? 2 : 0);
    return { flushDraw, oesd, gutshot, outs };
  }

  global.Cards = {
    SUITS, SUIT_NAMES, RANK_CH, HAND_NAMES_KO, HAND_NAMES_EN,
    rankOf, suitOf, cardStr, newDeck, shuffle, rand,
    evaluate, category, handName, handNameEn, bestFive, chen, handCode, equity, draws, straightHigh,
  };
})(typeof window !== 'undefined' ? window : globalThis);
