/* ============================================================
 * hwatu.js — 화투 48장 정의, 고스톱 점수 계산, 화투 그림(SVG 직접 생성)
 *  그림은 이 코드가 직접 그리므로 저작권 문제가 없습니다.
 *  카드 id 0..47, 월 m = floor(id/4)+1
 *  t: 'gwang'(광) | 'yul'(열끗) | 'tti'(띠) | 'pi'(피)
 *  sub: bi(비광) godori(고도리 새) kookjin(국진) hong/cheong/cho(홍·청·초단) bitti(비띠) ssang(쌍피)
 * ============================================================ */
(function (global) {
  'use strict';

  const MONTH_NAMES = ['', '송학', '매조', '벚꽃', '흑싸리', '난초', '모란', '홍싸리', '공산', '국화', '단풍', '오동', '비'];
  const SPEC = [
    null,
    [['gwang'], ['tti', 'hong'], ['pi'], ['pi']],
    [['yul', 'godori'], ['tti', 'hong'], ['pi'], ['pi']],
    [['gwang'], ['tti', 'hong'], ['pi'], ['pi']],
    [['yul', 'godori'], ['tti', 'cho'], ['pi'], ['pi']],
    [['yul'], ['tti', 'cho'], ['pi'], ['pi']],
    [['yul'], ['tti', 'cheong'], ['pi'], ['pi']],
    [['yul'], ['tti', 'cho'], ['pi'], ['pi']],
    [['gwang'], ['yul', 'godori'], ['pi'], ['pi']],
    [['yul', 'kookjin'], ['tti', 'cheong'], ['pi'], ['pi']],
    [['yul'], ['tti', 'cheong'], ['pi'], ['pi']],
    [['gwang'], ['pi', 'ssang'], ['pi'], ['pi']],
    [['gwang', 'bi'], ['yul'], ['tti', 'bitti'], ['pi', 'ssang']],
  ];
  const CARDS = [];
  for (let m = 1; m <= 12; m++) {
    SPEC[m].forEach(([t, sub], i) => {
      CARDS.push({ id: (m - 1) * 4 + i, m, t, sub: sub || null, pi: t === 'pi' ? (sub === 'ssang' ? 2 : 1) : 0, k: i });
    });
  }
  const TYPE_KO = { gwang: '광', yul: '열끗', tti: '띠', pi: '피' };
  function cardName(c) {
    const base = MONTH_NAMES[c.m];
    if (c.t === 'gwang') return c.sub === 'bi' ? '비광' : base + ' 광';
    if (c.sub === 'kookjin') return '국진';
    if (c.sub === 'ssang') return base + ' 쌍피';
    if (c.t === 'tti') return base + ' ' + ({ hong: '홍단', cheong: '청단', cho: '초단', bitti: '띠' }[c.sub]);
    return base + ' ' + TYPE_KO[c.t];
  }

  /* ---------------- 점수 계산 ---------------- */
  function scoreCore(cards, kookjinAsPi) {
    let nG = 0, hasBi = false, nYul = 0, birds = 0, nTti = 0, hong = 0, cheong = 0, cho = 0, piCount = 0;
    for (const c of cards) {
      if (c.t === 'gwang') { nG++; if (c.sub === 'bi') hasBi = true; }
      else if (c.t === 'yul') {
        if (c.sub === 'kookjin' && kookjinAsPi) piCount += 2;
        else { nYul++; if (c.sub === 'godori') birds++; }
      } else if (c.t === 'tti') {
        nTti++;
        if (c.sub === 'hong') hong++; else if (c.sub === 'cheong') cheong++; else if (c.sub === 'cho') cho++;
      } else piCount += c.pi;
    }
    const s = {
      gwangPts: nG === 5 ? 15 : nG === 4 ? 4 : nG === 3 ? (hasBi ? 2 : 3) : 0,
      yulPts: nYul >= 5 ? nYul - 4 : 0,
      godori: birds === 3 ? 5 : 0,
      ttiPts: nTti >= 5 ? nTti - 4 : 0,
      hongdan: hong === 3 ? 3 : 0,
      cheongdan: cheong === 3 ? 3 : 0,
      chodan: cho === 3 ? 3 : 0,
      piPts: piCount >= 10 ? piCount - 9 : 0,
      nG, nYul, nTti, piCount, birds, hong, cheong, cho, kookjinAsPi: !!kookjinAsPi,
    };
    s.total = s.gwangPts + s.yulPts + s.godori + s.ttiPts + s.hongdan + s.cheongdan + s.chodan + s.piPts;
    return s;
  }
  /** 국진을 열끗/쌍피 중 유리한 쪽으로 자동 계산 */
  function score(cards) {
    const a = scoreCore(cards, false);
    if (!cards.some((c) => c.sub === 'kookjin')) return a;
    const b = scoreCore(cards, true);
    return b.total > a.total ? b : a;
  }

  /* ============================================================
   * 화투 그림 (100 x 160 SVG)
   * ============================================================ */
  const EMOJI = "font-family=\"Segoe UI Emoji,Apple Color Emoji,Noto Color Emoji,sans-serif\"";
  const em = (x, y, size, ch) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" ${EMOJI}>${ch}</text>`;
  const circ = (x, y, r, f, extra) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${extra || ''}/>`;
  function flower(x, y, r, petal, center, n) {
    let s = '';
    n = n || 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      s += circ((x + Math.cos(a) * r * 0.62).toFixed(1), (y + Math.sin(a) * r * 0.62).toFixed(1), (r * 0.5).toFixed(1), petal);
    }
    return s + circ(x, y, (r * 0.32).toFixed(1), center);
  }
  function mapleLeaf(x, y, r, col, rot) {
    let pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + (rot || 0);
      const rr = i % 2 ? r * 0.45 : r;
      pts.push((x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1));
    }
    return `<polygon points="${pts.join(' ')}" fill="${col}"/>`;
  }
  const redSky = '<rect x="0" y="0" width="100" height="58" fill="#c62828"/>';

  const MOTIF = {
    1: (c) => (c.t === 'gwang' ? redSky + circ(68, 30, 17, '#ffeb3b', 'opacity="0.95"') : '') +
      '<path d="M18 160 C22 120 30 100 26 70" stroke="#5d4037" stroke-width="7" fill="none"/>' +
      '<ellipse cx="30" cy="70" rx="28" ry="12" fill="#1b5e20"/><ellipse cx="45" cy="92" rx="30" ry="11" fill="#2e7d32"/>' +
      '<ellipse cx="24" cy="112" rx="24" ry="10" fill="#1b5e20"/><ellipse cx="62" cy="68" rx="18" ry="8" fill="#388e3c"/>',
    2: () => redSky.replace('58', '30') +
      '<path d="M8 150 L30 110 L22 80 L48 52 L60 30" stroke="#3e2723" stroke-width="5" fill="none"/>' +
      '<path d="M30 110 L62 98 L80 70" stroke="#3e2723" stroke-width="3.5" fill="none"/>' +
      flower(48, 52, 9, '#e53935', '#ffeb3b') + flower(26, 86, 8, '#e53935', '#ffeb3b') + flower(64, 96, 8, '#ef5350', '#ffeb3b') +
      flower(80, 70, 7, '#e53935', '#ffeb3b') + flower(58, 30, 7, '#ef5350', '#ffeb3b'),
    3: (c) => (c.t === 'gwang' ? '<rect x="0" y="0" width="100" height="40" fill="#c62828"/>' : '') +
      flower(30, 46, 13, '#f8bbd0', '#ec407a') + flower(62, 34, 12, '#f48fb1', '#ec407a') + flower(76, 64, 11, '#f8bbd0', '#ec407a') +
      flower(42, 74, 12, '#f48fb1', '#ec407a') + flower(18, 98, 10, '#f8bbd0', '#ec407a') + flower(66, 100, 10, '#f48fb1', '#ec407a') +
      (c.t === 'gwang' ? '<g><rect x="6" y="112" width="88" height="40" fill="#fff"/>' +
        [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${6 + i * 14.7}" y="112" width="7.3" height="40" fill="#c62828"/>`).join('') +
        '<rect x="6" y="110" width="88" height="5" fill="#4e342e"/></g>' : ''),
    4: () => '<rect x="0" y="0" width="100" height="22" fill="#4a148c" opacity="0.25"/>' +
      [16, 36, 56, 76].map((x, i) => `<path d="M${x} 0 Q${x + 6} ${40 + i * 6} ${x - 2} ${86 + i * 8}" stroke="#212121" stroke-width="2" fill="none"/>` +
        [0, 1, 2, 3, 4, 5].map((k) => `<ellipse cx="${x + 3 - k * 0.6}" cy="${10 + k * 14 + i * 2}" rx="${5 - k * 0.4}" ry="3.5" fill="${k % 2 ? '#311b92' : '#212121'}"/>`).join('')).join(''),
    5: () => [14, 34, 54, 74, 90].map((x, i) => `<path d="M${x} 160 Q${x - 8 + i * 3} 110 ${x + 6} ${70 + (i % 2) * 12}" stroke="#2e7d32" stroke-width="3.5" fill="none"/>`).join('') +
      flower(30, 70, 11, '#5e35b1', '#ffeb3b', 3) + flower(64, 62, 12, '#673ab7', '#ffeb3b', 3) + flower(48, 96, 10, '#7e57c2', '#ffeb3b', 3),
    6: () => '<ellipse cx="22" cy="118" rx="18" ry="9" fill="#2e7d32"/><ellipse cx="74" cy="122" rx="20" ry="9" fill="#388e3c"/><ellipse cx="50" cy="132" rx="22" ry="8" fill="#1b5e20"/>' +
      flower(50, 82, 26, '#c62828', '#ffca28', 7) + flower(50, 82, 14, '#e53935', '#ffca28', 6),
    7: () => [[10, 150, 70, 40], [30, 160, 90, 70], [0, 120, 50, 20]].map(([x1, y1, x2, y2]) => `<path d="M${x1} ${y1} Q${(x1 + x2) / 2 + 20} ${(y1 + y2) / 2} ${x2} ${y2}" stroke="#6d4c41" stroke-width="2.5" fill="none"/>`).join('') +
      Array.from({ length: 26 }, (_, i) => circ(12 + ((i * 37) % 80), 18 + ((i * 53) % 120), 3.4, i % 3 ? '#d32f2f' : '#e57373')).join(''),
    8: (c) => redSky.replace('58', '92') +
      (c.t === 'gwang' ? circ(50, 44, 26, '#fff8e1', 'stroke="#ffe082" stroke-width="2"') : '') +
      '<path d="M0 98 Q30 70 55 92 Q80 72 100 90 L100 160 L0 160 Z" fill="#111"/>' +
      Array.from({ length: 9 }, (_, i) => `<path d="M${8 + i * 10} 160 L${12 + i * 10} 104" stroke="#fafafa" stroke-width="1" opacity="0.5"/>`).join(''),
    9: () => [[30, 58, 15], [68, 48, 13], [50, 92, 16], [20, 118, 12], [78, 112, 12]].map(([x, y, r]) =>
      flower(x, y, r, '#fdd835', '#e65100', 10)).join('') +
      '<path d="M50 160 L50 108 M20 160 L22 130 M78 160 L76 124" stroke="#33691e" stroke-width="3"/>',
    10: () => '<path d="M50 160 L50 40 M50 90 L20 60 M50 70 L82 44" stroke="#4e342e" stroke-width="4" fill="none"/>' +
      mapleLeaf(24, 56, 14, '#d84315', 0.2) + mapleLeaf(80, 40, 13, '#e64a19', 0.5) + mapleLeaf(50, 34, 12, '#bf360c', 0) +
      mapleLeaf(30, 104, 12, '#ff7043', 0.8) + mapleLeaf(74, 96, 13, '#d84315', 0.3) + mapleLeaf(54, 130, 10, '#e64a19', 0.1),
    11: (c) => (c.sub === 'ssang' ? '<rect x="0" y="0" width="100" height="160" fill="#fff3e0"/>' : '') +
      '<ellipse cx="32" cy="70" rx="26" ry="20" fill="#1b1b1b"/><ellipse cx="70" cy="58" rx="24" ry="18" fill="#263238"/><ellipse cx="50" cy="104" rx="30" ry="20" fill="#212121"/>' +
      [0, 1, 2, 3, 4].map((k) => circ(50 + k * 3, 22 + k * 7, 3.6, c.sub === 'ssang' ? '#fbc02d' : '#8e24aa')).join(''),
    12: (c) => '<rect x="0" y="0" width="100" height="160" fill="#263238" opacity="0.92"/>' +
      [10, 26, 42, 58, 74, 90].map((x, i) => `<path d="M${x} 0 Q${x + 10} 60 ${x - 4 + (i % 2) * 8} 120" stroke="#66bb6a" stroke-width="2.5" fill="none"/>`).join('') +
      (c.t !== 'tti' ? Array.from({ length: 14 }, (_, i) => `<path d="M${(i * 23) % 100} ${(i * 41) % 140} l-4 12" stroke="#b0bec5" stroke-width="1.2"/>`).join('') : '') +
      (c.sub === 'ssang' ? '<path d="M0 120 Q25 105 50 120 T100 120 L100 160 L0 160 Z" fill="#c62828"/>' : ''),
  };

  function ribbon(sub) {
    const col = sub === 'cheong' ? '#1565c0' : '#d32f2f';
    let s = `<g transform="rotate(-8 50 70)"><rect x="34" y="18" width="30" height="96" rx="2" fill="${col}" stroke="#4a0000" stroke-width="1"/>`;
    if (sub === 'hong' || sub === 'cheong') {
      s += `<text x="49" y="56" font-size="15" font-weight="900" fill="${sub === 'cheong' ? '#fff' : '#111'}" text-anchor="middle" font-family="Malgun Gothic,Apple SD Gothic Neo,sans-serif">${sub === 'hong' ? '홍' : '청'}</text>`;
      s += `<text x="49" y="76" font-size="15" font-weight="900" fill="${sub === 'cheong' ? '#fff' : '#111'}" text-anchor="middle" font-family="Malgun Gothic,Apple SD Gothic Neo,sans-serif">단</text>`;
    }
    if (sub === 'bitti') s += '<path d="M36 40 l26 8 l-26 8 l26 8 l-26 8 l26 8" stroke="#111" stroke-width="2.5" fill="none"/>';
    return s + '</g>';
  }

  const ANIMAL = {
    1: () => em(34, 150, 40, '🦢'),
    2: () => em(70, 132, 30, '🐦'),
    4: () => em(66, 140, 30, '🐦') + circ(80, 20, 8, '#e53935'),
    5: () => '<path d="M6 128 L30 112 L54 128 L78 112 L98 126" stroke="#8d6e63" stroke-width="7" fill="none" stroke-linejoin="round"/>' +
      '<path d="M6 136 L30 120 L54 136 L78 120 L98 134" stroke="#5d4037" stroke-width="3" fill="none"/>',
    6: () => em(28, 40, 24, '🦋') + em(74, 30, 20, '🦋'),
    7: () => em(52, 148, 36, '🐗'),
    8: () => [[30, 40], [50, 30], [70, 44]].map(([x, y]) => `<path d="M${x - 8} ${y} q8 -7 8 0 q0 -7 8 0" stroke="#111" stroke-width="3" fill="none"/>`).join(''),
    9: () => em(50, 150, 34, '🍶') + '<text x="50" y="128" font-size="11" fill="#c62828" text-anchor="middle" font-weight="900">壽</text>',
    10: () => em(52, 150, 38, '🦌'),
    11: () => em(52, 150, 40, '🦚'),
    12: (c) => (c.t === 'gwang' ? em(40, 104, 40, '☂️') + em(62, 150, 34, '🐸') : em(60, 70, 30, '🐦')),
  };

  function badge(c) {
    let label = '', bg = '';
    if (c.t === 'gwang') { label = '광'; bg = '#d4a017'; }
    else if (c.sub === 'kookjin') { label = '국진'; bg = '#ef6c00'; }
    else if (c.t === 'yul') { label = c.sub === 'godori' ? '고도리' : '열'; bg = '#ef6c00'; }
    else if (c.t === 'tti') { label = '띠'; bg = c.sub === 'cheong' ? '#1565c0' : '#c62828'; }
    else if (c.sub === 'ssang') { label = '쌍피'; bg = '#6a1b9a'; }
    if (!label) return '';
    const w = 8 + label.length * 10;
    return `<g><rect x="${96 - w}" y="140" width="${w}" height="16" rx="8" fill="${bg}" stroke="#fff" stroke-width="1.2"/>` +
      `<text x="${96 - w / 2}" y="152" font-size="10.5" font-weight="900" fill="#fff" text-anchor="middle" font-family="Malgun Gothic,Apple SD Gothic Neo,sans-serif">${label}</text></g>`;
  }

  function cardSVG(c) {
    let art = MOTIF[c.m](c);
    if (c.t === 'tti') art += ribbon(c.sub);
    if ((c.t === 'yul' || c.t === 'gwang') && ANIMAL[c.m]) art += ANIMAL[c.m](c);
    if (c.m === 12 && c.sub === 'ssang') art += em(50, 100, 34, '🥁');
    if (c.t === 'gwang') {
      art += '<circle cx="17" cy="17" r="12" fill="#c62828" stroke="#fff" stroke-width="2"/>' +
        '<text x="17" y="22" font-size="14" font-weight="900" fill="#fff" text-anchor="middle" font-family="serif">光</text>';
    }
    const monthTag = `<text x="6" y="155" font-size="11" font-weight="900" fill="${c.m === 12 || c.m === 8 ? '#eceff1' : '#3e2723'}" font-family="Arial,sans-serif" opacity="0.85">${c.m}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 160">` +
      `<defs><clipPath id="r"><rect x="3" y="3" width="94" height="154" rx="7"/></clipPath></defs>` +
      `<rect x="1" y="1" width="98" height="158" rx="9" fill="#1a0a0a"/>` +
      `<g clip-path="url(#r)"><rect x="0" y="0" width="100" height="160" fill="#fdf6e3"/>${art}</g>` +
      `${badge(c)}${monthTag}</svg>`;
  }
  const urlCache = {};
  function cardURL(id) {
    if (!urlCache[id]) urlCache[id] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cardSVG(CARDS[id]));
    return urlCache[id];
  }

  global.Hwatu = { CARDS, MONTH_NAMES, TYPE_KO, cardName, score, cardSVG, cardURL };
})(typeof window !== 'undefined' ? window : globalThis);
