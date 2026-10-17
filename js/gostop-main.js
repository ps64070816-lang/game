/* ============================================================
 * gostop-main.js — 화면, 화투 연출, 진행(하수 → 중수 → 고수), 이벤트
 * ============================================================ */
(function () {
  'use strict';
  const H = window.Hwatu, R = window.GSRoster, A = window.GameAudio, V = window.Voice, AI = window.GoStopAI;
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
  const won = (n) => fmt(n) + '원';

  /* ---------------- 저장 ---------------- */
  const STORE = 'lvgostop_v1';
  const DEFAULTS = { name: '', gender: 'M', unlocked: 1, cleared: {}, vip: 0, mode: 3, speed: 'normal', bgm: true, sfx: true, voice: true, helper: true };
  let save = Object.assign({}, DEFAULTS);
  try { save = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* 저장소 사용 불가 */ }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* 무시 */ } };

  const SPEED = { slow: 1.45, normal: 1, fast: 0.55, turbo: 0.28 };
  const S = {
    session: 0, stage: null, roster: [], game: null, dealerId: null, carry: 1, gameNo: 0,
    pending: null, cardEls: [], panels: {}, labels: {}, slotOf: {}, prevZone: {}, autoPlay: false, L: null,
  };
  class AbortErr extends Error { constructor() { super('abort'); this.name = 'Abort'; } }
  const wait = (ms, sess) => new Promise((res, rej) => setTimeout(() => {
    if (sess !== undefined && sess !== S.session) rej(new AbortErr()); else res();
  }, Math.max(0, ms * (SPEED[save.speed] || 1))));
  const playerName = () => (save.name || '플레이어').trim() || '플레이어';
  const human = () => S.roster.find((p) => p.isHuman);
  const gp = (id) => S.game && S.game.players.find((p) => p.id === id);
  const nameOf = (p) => (p.isHuman ? playerName() : p.name);
  const voiceOf = (p) => (p.isHuman ? { gender: save.gender, id: 'me' } : p);

  /* ============================================================
   * 스카이라인
   * ============================================================ */
  function buildSkyline() {
    const svg = $('#skyline');
    const ns = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
    let seed = 11;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const neon = ['#ff2d95', '#4cc9f0', '#ffd166', '#06d6a0', '#b5179e'];
    for (let x = 0; x < 1200; x += 34 + rnd() * 30) {
      const w = 30 + rnd() * 40, h = 60 + rnd() * 120;
      el('rect', { x, y: 300 - h, width: w, height: h, fill: '#140726' });
    }
    for (let x = -10; x < 1200; x += 60 + rnd() * 50) {
      const w = 50 + rnd() * 60, h = 80 + rnd() * 140;
      const c = neon[Math.floor(rnd() * neon.length)];
      el('rect', { x, y: 300 - h, width: w, height: h, fill: '#1c0b33', stroke: c, 'stroke-width': 1.5, 'stroke-opacity': 0.8 });
      for (let wy = 300 - h + 10; wy < 290; wy += 14) for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        if (rnd() < 0.55) el('rect', { x: wx, y: wy, width: 6, height: 7, fill: rnd() < 0.7 ? '#ffd98a' : '#9be7ff', opacity: 0.75, class: rnd() < 0.15 ? 'win' : '' });
      }
    }
    el('rect', { x: 905, y: 40, width: 10, height: 260, fill: '#2a1048', stroke: '#4cc9f0', 'stroke-width': 1 });
    el('ellipse', { cx: 910, cy: 55, rx: 34, ry: 12, fill: '#2a1048', stroke: '#ff2d95', 'stroke-width': 2 });
    el('polygon', { points: '160,300 250,170 340,300', fill: '#120622', stroke: '#ffd166', 'stroke-width': 2 });
    const cx = 640, cy = 175, r = 85;
    el('circle', { cx, cy, r, fill: 'none', stroke: '#06d6a0', 'stroke-width': 2.5, 'stroke-opacity': 0.9 });
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      el('line', { x1: cx, y1: cy, x2: cx + r * Math.cos(a), y2: cy + r * Math.sin(a), stroke: '#06d6a0', 'stroke-opacity': 0.35 });
      el('circle', { cx: cx + r * Math.cos(a), cy: cy + r * Math.sin(a), r: 4, fill: neon[k % neon.length] });
    }
  }

  /* ============================================================
   * 로비 / 설정 / 모달
   * ============================================================ */
  function showScreen(id) { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); }

  function renderLobby() {
    $('#pName').value = save.name;
    document.querySelectorAll('.av-pick button').forEach((b) => b.classList.toggle('sel', b.dataset.g === save.gender));
    $('#optMode').value = String(save.mode);
    $('#optSpeed').value = save.speed;
    $('#optBgm').checked = save.bgm; $('#optSfx').checked = save.sfx; $('#optVoice').checked = save.voice; $('#optHelper').checked = save.helper;
    $('#vipPts').textContent = fmt(save.vip);
    const list = $('#stageList');
    list.innerHTML = '';
    for (const st of R.STAGES) {
      const unlocked = st.id <= save.unlocked;
      const card = document.createElement('div');
      card.className = 'stage-card' + (unlocked ? '' : ' locked');
      card.style.setProperty('--sc', st.accent);
      card.style.setProperty('--sbg', st.felt);
      const faces = R.CHARACTERS[st.id].map((c) => `<img src="${R.avatarSrc(c.id)}" alt="${c.name}" title="${c.name} — ${c.title}">`).join('');
      card.innerHTML = `
        <div>
          <span class="grade">${st.grade}</span><span class="stage-no">STAGE ${st.id} · ${st.gradeEn} · 점당 ${won(st.pointValue)}</span>
          <h4>${st.venue}</h4>
          <p>${st.desc}</p>
          <div class="faces">${faces}</div>
        </div>
        <button class="play" ${unlocked ? '' : 'disabled'}>${unlocked ? 'PLAY ▶' : '🔒 잠김'}</button>
        ${save.cleared[st.id] ? '<div class="clear-stamp">CLEAR</div>' : ''}`;
      if (unlocked) card.querySelector('.play').onclick = () => { A.sfx('click'); startStage(st.id); };
      list.appendChild(card);
    }
  }
  function bindLobby() {
    $('#pName').oninput = (e) => { save.name = e.target.value.slice(0, 10); persist(); };
    document.querySelectorAll('.av-pick button').forEach((b) => (b.onclick = () => {
      save.gender = b.dataset.g; persist(); renderLobby(); A.sfx('click');
      V.say(save.gender === 'M' ? '좋은 선택입니다, 사장님' : '좋은 선택입니다, 사모님', 'dealer', { priority: true });
    }));
    $('#optMode').onchange = (e) => { save.mode = +e.target.value; persist(); };
    $('#optSpeed').onchange = (e) => { save.speed = e.target.value; persist(); };
    $('#optBgm').onchange = (e) => setBgm(e.target.checked);
    $('#optSfx').onchange = (e) => setSfx(e.target.checked);
    $('#optVoice').onchange = (e) => setVoice(e.target.checked);
    $('#optHelper').onchange = (e) => { save.helper = e.target.checked; persist(); render(); };
    $('#btnRules').onclick = showRules;
    $('#btnReset').onclick = () => confirmModal('진행 상황 초기화', '잠금 해제된 스테이지와 VIP 포인트가 모두 초기화됩니다.', () => {
      Object.assign(save, { unlocked: 1, cleared: {}, vip: 0 }); persist(); renderLobby();
    });
    $('#tBgm').onclick = () => setBgm(!save.bgm);
    $('#tSfx').onclick = () => setSfx(!save.sfx);
    $('#tVoice').onclick = () => setVoice(!save.voice);
    $('#tLog').onclick = () => $('#log').classList.toggle('show');
    $('#tRules').onclick = showRules;
    $('#tQuit').onclick = () => confirmModal('로비로 나가기', '진행 중인 판은 기록되지 않습니다.', quitToLobby);
    $('#passBtn').onclick = () => { if (S.pending && S.pending.kind === 'play') resolvePending({ dummy: true }); };
    addEventListener('resize', () => render());
  }
  function setBgm(on) { save.bgm = on; persist(); A.setBgm(on); syncToggles(); }
  function setSfx(on) { save.sfx = on; persist(); A.setSfx(on); syncToggles(); }
  function setVoice(on) { save.voice = on; persist(); V.on = on; if (!on) V.stop(); syncToggles(); }
  function syncToggles() {
    $('#tBgm').classList.toggle('off', !save.bgm);
    $('#tSfx').classList.toggle('off', !save.sfx);
    $('#tVoice').classList.toggle('off', !save.voice);
  }

  function modal(html, buttons, opts) {
    const box = $('#modalBox');
    box.innerHTML = html + (buttons && buttons.length ? '<div class="modal-actions"></div>' : '');
    const act = box.querySelector('.modal-actions');
    (buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = b.cls || 'secondary'; btn.textContent = b.label;
      btn.onclick = () => { A.sfx('click'); closeModal(); if (b.fn) b.fn(); };
      act.appendChild(btn);
    });
    $('#modal').classList.add('show');
    return box;
  }
  const closeModal = () => $('#modal').classList.remove('show');
  function confirmModal(title, text, fn) {
    modal(`<h2 style="font-size:24px">${title}</h2><p style="text-align:center">${text}</p>`, [
      { label: '취소', cls: 'secondary' }, { label: '확인', cls: 'primary', fn },
    ]);
  }
  function showRules() {
    const img = (id) => `<img src="${H.cardURL(id)}" style="width:34px;vertical-align:middle;margin:1px">`;
    modal(`
      <h2>GO-STOP 규칙</h2>
      <h3>🎯 목표</h3>
      <p>같은 월(그림)의 패를 맞춰 먹고, 족보로 점수를 만들어 먼저 <b>나는</b>(3인 고스톱 3점, 2인 맞고 7점) 사람이 이깁니다.
      점수가 나면 <b>고</b>(계속해서 점수 키우기) 또는 <b>스톱</b>(그 자리에서 정산)을 고릅니다.
      각 등급 테이블에서 판돈을 <b>두 배</b>로 불리거나 상대를 모두 파산시키면 클리어! (하수 → 중수 → 고수)</p>
      <h3>🃏 진행 (반시계 방향)</h3>
      <ul>
        <li>3인: 손패 7장·바닥 6장 / 맞고: 손패 10장·바닥 8장. 이긴 사람이 다음 판 선.</li>
        <li>손패 1장을 내서 바닥의 같은 월 패와 맞추고, 더미에서 1장을 뒤집어 또 맞춥니다.</li>
        <li><b>쪽</b>: 낸 패가 안 맞았는데 뒤집은 패로 먹음 → 상대 피 1장씩 뺏기</li>
        <li><b>뻑</b>: 맞춘 패와 같은 월이 뒤집혀 3장이 바닥에 남음. 나중에 4번째 패로 먹으면 피를 뺏고(자뻑은 2장), 한 판에 <b>3뻑</b>이면 즉시 승리</li>
        <li><b>따닥</b>: 바닥 2장 + 낸 패 + 뒤집은 패가 모두 같은 월 → 4장 먹고 피 뺏기</li>
        <li><b>싹쓸이</b>: 바닥을 다 쓸어감 → 피 뺏기 · <b>폭탄</b>: 같은 월 3장을 들고 바닥에 1장 → 한 번에 4장, 피 뺏기, ×2</li>
        <li><b>흔들기</b>: 같은 월 3장을 들고 있을 때 보여주면 ×2 · <b>총통</b>: 시작부터 같은 월 4장이면 즉시 승리</li>
      </ul>
      <h3>🏆 족보</h3>
      <table class="breakdown">
        <tr><td>광 ${[0, 8, 28, 40, 44].map(img).join('')}</td><td>3광 3점 (비광 포함 2점) · 4광 4점 · 5광 15점</td></tr>
        <tr><td>고도리 ${[4, 12, 29].map(img).join('')}</td><td>5점</td></tr>
        <tr><td>홍단 ${[1, 5, 9].map(img).join('')}</td><td>3점</td></tr>
        <tr><td>청단 ${[21, 33, 37].map(img).join('')}</td><td>3점</td></tr>
        <tr><td>초단 ${[13, 17, 25].map(img).join('')}</td><td>3점</td></tr>
        <tr><td>열끗 5장</td><td>1점, 1장마다 +1</td></tr>
        <tr><td>띠 5장</td><td>1점, 1장마다 +1</td></tr>
        <tr><td>피 10장 (쌍피 ${[41, 47].map(img).join('')}는 2장)</td><td>1점, 1장마다 +1 · 국진 ${img(32)}은 유리하게 쌍피로 자동 계산</td></tr>
      </table>
      <h3>✖ 배수</h3>
      <ul>
        <li>고: 1고 +1점, 2고 +2점, 3고부터 +3점에 ×2, 4고 ×4 …</li>
        <li>흔들기·폭탄 ×2 · <b>피박</b>(진 사람 피 ${'3인 5장 / 맞고 7장'} 이하) ×2 · <b>광박</b>(광 점수로 났는데 광 0장) ×2 · <b>멍박</b>(열끗 7장 이상으로 남) ×2</li>
        <li><b>고박</b>: 고를 외쳤다가 남이 나면 독박 (3인: 두 사람 몫 / 맞고: ×2)</li>
        <li><b>나가리</b>: 아무도 못 나면 다음 판 ×2</li>
      </ul>
      <h3>🤖 상대 등급</h3>
      <ul>
        <li><b>하수</b> — 먹을 게 보이면 대충 먹고, 고를 남발합니다.</li>
        <li><b>중수</b> — 광·고도리·단을 노리고 뻑을 피하며, 상대 점수를 보고 고/스톱.</li>
        <li><b>고수</b> — 나온 패를 모두 기억해 쪽·뻑 확률을 계산하고, 당신의 족보를 끊으며, 남은 판을 수십 번 시뮬레이션해 고/스톱을 정합니다.</li>
      </ul>`, [{ label: '닫기', cls: 'primary' }]);
  }

  /* ============================================================
   * 화투 카드 DOM & 레이아웃
   * ============================================================ */
  function buildCards() {
    const layer = $('#cardLayer');
    layer.innerHTML = '';
    S.cardEls = H.CARDS.map((c) => {
      const el = document.createElement('div');
      el.className = 'hc';
      el.dataset.id = c.id;
      el.innerHTML = `<div class="in"><div class="fc" style="background-image:url(&quot;${H.cardURL(c.id)}&quot;)"></div><div class="bk"></div></div>`;
      el.title = H.cardName(c);
      el.addEventListener('click', () => onCardClick(c.id));
      el.addEventListener('mouseenter', () => onCardHover(c.id, true));
      el.addEventListener('mouseleave', () => onCardHover(c.id, false));
      el.style.display = 'none';
      layer.appendChild(el);
      return el;
    });
  }

  function seatOf(p) {
    // 반시계 방향: 나(아래) → 오른쪽 위 → 왼쪽 위
    const g = S.game;
    const hi = g.players.findIndex((q) => q.isHuman);
    const rel = (g.players.indexOf(p) - hi + g.n) % g.n;
    if (rel === 0) return 'me';
    if (g.n === 2) return 'top';
    return rel === 1 ? 'right' : 'left';
  }

  function computeLayout() {
    const ar = $('#arena');
    const W = ar.clientWidth, Hh = ar.clientHeight;
    const narrow = W < 760;
    let cw = Math.max(30, Math.min(W / (narrow ? 11.5 : 15.5), Hh / 8.6, 92));
    const ch = cw * 1.6;
    $('#cardLayer').style.setProperty('--cw', cw + 'px');
    const panelH = narrow ? 52 : 70;
    const L = { W, H: Hh, cw, ch, narrow, panelH };
    L.oppHandS = 0.4; L.oppPileS = narrow ? 0.36 : 0.44; L.myPileS = narrow ? 0.4 : 0.5; L.floorS = narrow ? 0.78 : 0.86; L.handS = 1;
    L.top = 8;
    L.oppPileY = L.top + panelH + 6;
    L.matTop = L.oppPileY + ch * L.oppPileS + 14;
    L.handY = Hh - ch * L.handS - 10;
    L.myPileY = L.handY - ch * L.myPileS - 16;
    L.matBottom = L.myPileY - 10;
    L.matLeft = 10; L.matRight = W - 10;
    L.cx = W / 2; L.cy = (L.matTop + L.matBottom) / 2;
    return L;
  }

  function slotPos(i, L) {
    // 12개 바닥 자리: 덱 주변 타원 (3시 방향부터 시계 방향)
    const fw = L.cw * L.floorS, fh = L.ch * L.floorS;
    const rx = Math.max(fw * 2.2, (L.matRight - L.matLeft) / 2 - fw * 1.45);
    const ry = Math.max(fh * 0.55, (L.matBottom - L.matTop) / 2 - fh / 2 - 8);
    const order = [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11];
    const a = -Math.PI / 2 + (order[i] / 12) * Math.PI * 2;
    return { x: L.cx + rx * Math.cos(a) - fw / 2, y: L.cy + ry * Math.sin(a) - fh / 2 };
  }

  function groupsOf(cap) {
    const G = { gwang: [], yul: [], tti: [], pi: [] };
    cap.forEach((c) => G[c.t].push(c));
    Object.values(G).forEach((a) => a.sort((x, y) => x.id - y.id));
    return G;
  }

  function render(opts) {
    const g = S.game;
    if (!g) return;
    opts = opts || {};
    const L = computeLayout();
    S.L = L;
    const pos = {}; // id -> {x,y,s,up,z,zone}

    // 매트
    const mat = $('#mat');
    Object.assign(mat.style, { left: L.matLeft + 'px', top: L.matTop + 'px', width: (L.matRight - L.matLeft) + 'px', height: Math.max(40, L.matBottom - L.matTop) + 'px' });

    // 더미
    const dx = L.cx - (L.cw * L.floorS) / 2, dy = L.cy - (L.ch * L.floorS) / 2;
    g.deck.forEach((c, i) => { pos[c.id] = { x: dx - i * 0.25, y: dy - i * 0.35, s: L.floorS, up: false, z: 10 + i, zone: 'deck' }; });
    const dc = $('#deckCount');
    dc.style.left = L.cx + 'px'; dc.style.top = (dy + L.ch * L.floorS + 4) + 'px';
    dc.textContent = g.deck.length ? `더미 ${g.deck.length}` : '';

    // 바닥: 월별로 자리 배정
    const months = [...new Set(g.floor.map((c) => c.m))];
    for (const m of Object.keys(S.slotOf)) if (!months.includes(+m)) delete S.slotOf[m];
    for (const m of months) {
      if (S.slotOf[m] == null) {
        const used = new Set(Object.values(S.slotOf));
        let k = 0; while (used.has(k)) k++;
        S.slotOf[m] = k;
      }
    }
    for (const m of months) {
      const sp = slotPos(S.slotOf[m], L);
      g.floor.filter((c) => c.m === m).forEach((c, k) => {
        pos[c.id] = { x: sp.x + k * L.cw * L.floorS * 0.3, y: sp.y + k * 5, s: L.floorS, up: true, z: 100 + k, zone: 'floor' };
      });
    }

    // 플레이어별: 손패 + 먹은 패
    for (const p of g.players) {
      const seat = seatOf(p);
      const isMe = seat === 'me';
      // 손패
      const hand = p.hand.slice().sort((a, b) => a.id - b.id);
      if (isMe) {
        const w = L.cw;
        const startX = L.narrow ? 8 : Math.max(200, L.W * 0.2);
        const avail = L.W - startX - 10;
        const gap = Math.min(w * 1.06, (avail - w) / Math.max(1, hand.length - 1));
        const total = gap * (hand.length - 1) + w;
        const x0 = startX + Math.max(0, (avail - total) / 2);
        hand.forEach((c, i) => {
          const lift = S.hoverId === c.id && S.pending && S.pending.kind === 'play' ? -14 : 0;
          pos[c.id] = { x: x0 + i * gap, y: L.handY + lift, s: 1, up: !S.hideMine, z: 400 + i, zone: 'hand' };
        });
      } else {
        const s = L.oppHandS, w = L.cw * s;
        const region = oppRegion(seat, L);
        const x0 = seat === 'left' || seat === 'top' ? region.x + (L.narrow ? 120 : 190) : region.x + region.w - (L.narrow ? 120 : 190) - w - (hand.length - 1) * w * 0.45;
        hand.forEach((c, i) => { pos[c.id] = { x: x0 + i * w * 0.45, y: L.top + 4, s, up: S.revealAll, z: 400 + i, zone: 'ohand' }; });
      }
      // 먹은 패
      const G = groupsOf(p.cap);
      const s = isMe ? L.myPileS : L.oppPileS;
      const w = L.cw * s;
      let x = isMe ? 10 : oppRegion(seat, L).x + 4;
      const y = isMe ? L.myPileY : L.oppPileY;
      const maxW = isMe ? L.W - 20 : oppRegion(seat, L).w - 8;
      const counts = ['gwang', 'yul', 'tti', 'pi'].map((k) => G[k].length);
      const base = counts.reduce((a, n) => a + (n ? w + 10 : 0), 0);
      const extra = counts.reduce((a, n) => a + Math.max(0, n - 1), 0);
      const off = Math.max(w * 0.12, Math.min(w * 0.42, (maxW - base) / Math.max(1, extra)));
      ['gwang', 'yul', 'tti', 'pi'].forEach((k, gi) => {
        const arr = G[k];
        const lab = S.labels[p.id] && S.labels[p.id][k];
        if (lab) {
          lab.style.display = arr.length ? 'block' : 'none';
          lab.style.left = x + 'px'; lab.style.top = y + 'px';
          const label = { gwang: '광', yul: '열', tti: '띠', pi: '피' }[k];
          lab.textContent = k === 'pi' ? `피 ${arr.reduce((s2, c) => s2 + c.pi, 0)}` : `${label} ${arr.length}`;
        }
        arr.forEach((c, i) => { pos[c.id] = { x: x + i * off, y, s, up: true, z: 200 + gi * 30 + i, zone: 'pile' + p.id }; });
        if (arr.length) x += (arr.length - 1) * off + w + 10;
      });
    }

    // 카드 DOM 반영
    const helper = save.helper;
    const floorMonths = new Set(g.floor.map((c) => c.m));
    H.CARDS.forEach((c) => {
      const el = S.cardEls[c.id];
      const P = pos[c.id];
      if (!P) { el.style.display = 'none'; return; }
      el.style.display = '';
      const moved = S.prevZone[c.id] !== P.zone;
      S.prevZone[c.id] = P.zone;
      el.style.transitionDelay = opts.stagger ? (opts.stagger(c.id) + 'ms') : '0ms';
      el.style.transform = `translate(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px) scale(${P.s})`;
      el._z = P.z;
      if (moved && !opts.stagger) {
        el.style.zIndex = 900 + P.z; // 이동 중인 패는 맨 위로
        clearTimeout(el._zt);
        el._zt = setTimeout(() => { el._zt = null; el.style.zIndex = el._z; }, 460);
      } else if (!el._zt) el.style.zIndex = P.z;
      el.classList.toggle('up', P.up);
      const mine = P.zone === 'hand';
      el.classList.toggle('mine', mine);
      el.classList.toggle('can', mine && !!S.pending && S.pending.kind === 'play');
      el.classList.toggle('match', mine && helper && floorMonths.has(c.m));
      el.classList.toggle('hl', P.zone === 'floor' && S.hoverMonth === c.m);
    });
    placePanels(L);
    const hb = $('#helpbar');
    hb.style.top = (L.myPileY - 26) + 'px';
    const pb = $('#passBtn');
    const me = g.players.find((p) => p.isHuman);
    pb.classList.toggle('show', !!(S.pending && S.pending.kind === 'play' && me && me.dummies > 0));
    pb.textContent = `💣 폭탄 패스 (${me ? me.dummies : 0})`;
    pb.style.left = (L.narrow ? 8 : 20) + 'px'; pb.style.top = (L.handY - 44) + 'px';
  }

  function oppRegion(seat, L) {
    if (seat === 'top') return { x: 10, w: L.W - 20 };
    if (seat === 'left') return { x: 10, w: L.W / 2 - 20 };
    return { x: L.W / 2 + 10, w: L.W / 2 - 20 };
  }

  /* ---------------- 플레이어 패널 ---------------- */
  function buildPanels() {
    const box = $('#panels');
    box.innerHTML = '';
    S.panels = {}; S.labels = {};
    for (const p of S.game.players) {
      const el = document.createElement('div');
      el.className = 'pl';
      el.innerHTML = `<div class="av"><img alt=""></div><div><div class="nm"></div><div class="money"></div><div class="pts"></div></div><span class="think">…</span><div class="bubble"></div>`;
      el.title = p.isHuman ? playerName() : `${p.name} — ${p.title}`;
      box.appendChild(el);
      S.panels[p.id] = el;
      setMood(p, 'calm');
      S.labels[p.id] = {};
      for (const k of ['gwang', 'yul', 'tti', 'pi']) {
        const lab = document.createElement('div');
        lab.className = 'pile-label';
        box.appendChild(lab);
        S.labels[p.id][k] = lab;
      }
    }
    updatePanels();
  }
  function placePanels(L) {
    for (const p of S.game.players) {
      const el = S.panels[p.id];
      if (!el) continue;
      const seat = seatOf(p);
      el.classList.toggle('top', seat !== 'me');
      if (seat === 'me') {
        el.style.left = '10px'; el.style.top = (L.narrow ? L.myPileY - L.panelH - 30 : L.handY + L.ch / 2 - 35) + 'px';
        el.style.right = 'auto';
      } else if (seat === 'right') {
        el.style.left = 'auto'; el.style.right = '10px'; el.style.top = L.top + 'px';
      } else {
        el.style.left = '10px'; el.style.right = 'auto'; el.style.top = L.top + 'px';
      }
    }
  }
  function updatePanels() {
    const g = S.game;
    if (!g) return;
    for (const p of g.players) {
      const el = S.panels[p.id];
      if (!el) continue;
      const rp = S.roster.find((q) => q.id === p.id);
      const sc = H.score(p.cap);
      el.querySelector('.nm').innerHTML = `${nameOf(p)}<small>${p.isHuman ? 'YOU' : S.stage.grade + ' ' + (p.gender === 'M' ? '♂' : '♀')}</small>${g.players.indexOf(p) === g.dealer ? ' <span class="tag">선</span>' : ''}`;
      el.querySelector('.money').textContent = won(rp ? rp.money : 0);
      let tags = `<b>${sc.total}</b>점`;
      if (p.go) tags += ` <span class="tag go">${p.go}고</span>`;
      if (p.shakes) tags += ` <span class="tag shake">${p.bombs ? '폭탄' : '흔들'}×${Math.pow(2, p.shakes)}</span>`;
      if (p.ppeok) tags += ` <span class="tag ppeok">뻑${p.ppeok}</span>`;
      if (sc.godori) tags += ' <span class="tag dang">고도리</span>';
      if (sc.hongdan) tags += ' <span class="tag dang">홍단</span>';
      if (sc.cheongdan) tags += ' <span class="tag dang">청단</span>';
      if (sc.chodan) tags += ' <span class="tag dang">초단</span>';
      el.querySelector('.pts').innerHTML = tags;
    }
  }
  function setMood(p, mood) {
    const el = S.panels[p.id];
    if (el) el.querySelector('.av img').src = R.avatarSrc(p.avatar, mood);
  }
  function setActive(p) {
    Object.entries(S.panels).forEach(([id, el]) => el.classList.toggle('active', p && id === p.id));
  }
  function bubble(p, text, cls, ms) {
    const el = S.panels[p.id];
    if (!el) return;
    const b = el.querySelector('.bubble');
    b.className = 'bubble show ' + (cls || '');
    b.textContent = text;
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('show'), ms || 1800);
  }
  function help(text) { $('#helpbar').innerHTML = text || ''; $('#helpbar').style.opacity = text ? 1 : 0; }
  function addLog(text, cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    const log = $('#log');
    log.appendChild(d);
    while (log.children.length > 400) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
  function banner(title, sub, tier, ms) {
    FX.banner(title, sub, tier, ms);
    $('#banner .b-title').classList.toggle('ko', /[가-힣]/.test(title));
  }
  function addVip(n, reason) {
    if (S.autoPlay) return;
    save.vip += n; persist();
    addLog(`★ VIP +${fmt(n)} (${reason})`, 'h');
  }
  function updateHud() {
    const st = S.stage;
    const n = S.game ? S.game.n : (save.mode === 2 ? 2 : 3);
    $('#hudMode').textContent = n === 2 ? '2인 맞고' : '3인 고스톱';
    $('#hudPoint').textContent = won(st.pointValue);
    $('#hudGame').textContent = '#' + Math.max(1, S.gameNo);
    $('#hudCarry').textContent = '×' + S.carry;
    $('#hudCarryBox').classList.toggle('hot', S.carry > 1);
    $('#hudTarget').textContent = won(st.startMoney * 2);
  }

  /* ============================================================
   * 사람 입력
   * ============================================================ */
  function resolvePending(v) {
    const p = S.pending;
    if (!p) return;
    S.pending = null;
    help('');
    render();
    p.resolve(v);
  }
  function onCardClick(id) {
    const P = S.pending;
    if (!P || P.kind !== 'play') return;
    const me = S.game.players.find((p) => p.isHuman);
    if (!me.hand.some((c) => c.id === id)) return;
    A.sfx('click');
    resolvePending({ card: id });
  }
  function onCardHover(id, on) {
    const g = S.game;
    if (!g) return;
    const me = g.players.find((p) => p.isHuman);
    if (!me || !me.hand.some((c) => c.id === id)) return;
    S.hoverId = on ? id : null;
    S.hoverMonth = on && save.helper ? H.CARDS[id].m : null;
    render();
  }

  function humanDecide(kind, ctx, sess) {
    return new Promise((resolve, reject) => {
      if (sess !== S.session) return reject(new AbortErr());
      S.pending = { kind, resolve, reject };
      const g = S.game, me = ctx.me;
      if (kind === 'play') {
        A.sfx('turn');
        const caps = me.hand.filter((c) => g.floor.some((x) => x.m === c.m)).length;
        help(`<b>내 차례</b> — 낼 패를 클릭하세요${save.helper ? ` · 금색 테두리 = 먹을 수 있는 패 (${caps}장)` : ''}`);
        render();
      } else if (kind === 'pick') {
        const opts = ctx.options;
        const box = modal(`<div class="choice"><h2 style="font-size:26px">어느 패를 먹을까요?</h2>
          <p>${ctx.source === 'flip' ? '뒤집은 패' : '낸 패'}와 같은 월이 바닥에 2장 있습니다.</p>
          <div class="cards">${opts.map((c) => `<button data-id="${c.id}"><img src="${H.cardURL(c.id)}" alt=""><span>${H.cardName(c)}</span></button>`).join('')}</div></div>`, []);
        box.querySelectorAll('.cards button').forEach((b) => (b.onclick = () => { A.sfx('click'); closeModal(); resolvePending(+b.dataset.id); }));
      } else if (kind === 'shake') {
        const box = modal(`<div class="choice"><h2 style="font-size:26px">흔드시겠습니까?</h2>
          <p>같은 월 3장을 들고 있습니다. 흔들면 이번 판 점수 <b>×2</b> (대신 상대에게 패를 보여줍니다)</p>
          <div class="cards">${ctx.cards.slice(0, 3).map((c) => `<button disabled><img src="${H.cardURL(c.id)}" alt=""></button>`).join('')}</div>
          <div class="gs-btns"><button class="go" data-v="1">흔들기!<small>×2</small></button><button class="stop" data-v="0">그냥 내기</button></div></div>`, []);
        box.querySelectorAll('.gs-btns button').forEach((b) => (b.onclick = () => { A.sfx('click'); closeModal(); resolvePending(b.dataset.v === '1'); }));
      } else if (kind === 'gostop') {
        const sc = ctx.score;
        const st = g.settle(me, 'stop');
        const gain = st.losers.reduce((s, l) => s + l.pay, 0) * S.stage.pointValue;
        const nextGo = me.go + 1;
        const goText = nextGo >= 3 ? `${nextGo}고 (×${Math.pow(2, nextGo - 2)})` : `${nextGo}고 (+${nextGo}점)`;
        V.say(`${sc.total}점! 고, 하시겠습니까?`, 'dealer', { priority: true });
        const box = modal(`<div class="choice"><h2>${sc.total}점 났습니다!</h2>
          <p>${scoreLine(sc)}</p>
          <p>지금 <b>스톱</b>하면 약 <b style="color:#ffd166">${won(gain)}</b> 획득<br>
          <b>고</b>하면 ${goText} — 단, 다른 사람이 나면 <b style="color:#ff6b81">고박(독박)</b>!</p>
          <div class="gs-btns"><button class="go" data-v="go">고!<small>${goText}</small></button><button class="stop" data-v="stop">스톱!<small>${won(gain)}</small></button></div></div>`, []);
        box.querySelectorAll('.gs-btns button').forEach((b) => (b.onclick = () => { A.sfx('click'); closeModal(); resolvePending(b.dataset.v); }));
      }
    });
  }
  function scoreLine(sc) {
    const parts = [];
    if (sc.gwangPts) parts.push(`광 ${sc.gwangPts}점`);
    if (sc.godori) parts.push('고도리 5점');
    if (sc.hongdan) parts.push('홍단 3점');
    if (sc.cheongdan) parts.push('청단 3점');
    if (sc.chodan) parts.push('초단 3점');
    if (sc.yulPts) parts.push(`열끗 ${sc.yulPts}점`);
    if (sc.ttiPts) parts.push(`띠 ${sc.ttiPts}점`);
    if (sc.piPts) parts.push(`피 ${sc.piPts}점`);
    return parts.join(' · ');
  }

  /* ============================================================
   * 엔진 훅
   * ============================================================ */
  async function decide(p, kind, ctx, sess) {
    if (sess !== S.session) throw new AbortErr();
    if (p.isHuman && !S.autoPlay) return humanDecide(kind, ctx, sess);
    const el = S.panels[p.id];
    if (el && kind === 'play') el.classList.add('thinking');
    const t0 = performance.now();
    const res = await AI.decide(p, kind, ctx);
    const [a, b] = AI.thinkTime(p.level);
    const base = kind === 'play' ? a + Math.random() * (b - a) : kind === 'gostop' ? 900 : 380;
    await wait(Math.max(80, base - (performance.now() - t0)), sess);
    if (el) el.classList.remove('thinking');
    return res;
  }

  const SPECIAL = {
    jjok: ['쪽!', '입 맞추듯 쪽! 피 한 장씩 뺏기', 'good', '쪽!'],
    ppeok: ['뻑!', '같은 월 3장이 바닥에… 뻑!', 'bad', '뻑!'],
    ddadak: ['따닥!', '4장 싹 먹고 피 뺏기', 'great', '따닥!'],
    ppeokEat: ['뻑 먹기!', '뻑을 먹어 피 뺏기', 'great', '뻑 먹었다!'],
    jappeok: ['자뻑!', '내 뻑을 내가 먹었다! 피 2장씩', 'great', '자뻑!'],
    sweep: ['싹쓸이!', '바닥을 싹 쓸었다! 피 뺏기', 'great', '싹쓸이!'],
    bomb: ['폭탄!', '같은 월 4장 한 번에! ×2', 'great', '폭탄!'],
    chongtong: ['총통!', '같은 월 4장을 들고 시작! 즉시 승리', 'jackpot', '총통!'],
    threePpeok: ['쓰리뻑!', '한 판에 뻑 세 번! 즉시 승리', 'jackpot', '쓰리뻑!'],
  };
  const SPECIAL_VIP = { jjok: 10, ddadak: 20, ppeokEat: 20, jappeok: 40, sweep: 30, bomb: 30, chongtong: 500, threePpeok: 300 };

  async function onEvent(type, d, sess) {
    if (sess !== S.session) throw new AbortErr();
    const g = S.game;
    switch (type) {
      case 'deal': {
        S.slotOf = {}; S.prevZone = {}; S.revealAll = false; S.hideMine = false;
        // 모든 패를 더미 자리로 모은 뒤 나눠주는 연출
        const L = computeLayout();
        const dx = L.cx - (L.cw * L.floorS) / 2, dy = L.cy - (L.ch * L.floorS) / 2;
        S.cardEls.forEach((el) => {
          el.style.transition = 'none'; el.style.display = '';
          el.style.transform = `translate(${dx}px, ${dy}px) scale(${L.floorS})`;
          el.classList.remove('up', 'match', 'hl', 'newcap');
        });
        void document.body.offsetWidth;
        S.cardEls.forEach((el) => { el.style.transition = ''; });
        const order = {};
        let k = 0;
        g.players.forEach((p) => p.hand.forEach((c) => (order[c.id] = k++ * 28)));
        g.floor.forEach((c) => (order[c.id] = k++ * 28));
        render({ stagger: (id) => order[id] || 0 });
        for (let i = 0; i < 10; i++) setTimeout(() => { if (sess === S.session) A.sfx('slap'); }, i * 90);
        updatePanels();
        V.say(g.n === 2 ? '맞고, 시작합니다' : '고스톱, 패 돌립니다', 'dealer');
        await wait(k * 28 + 700, sess);
        S.cardEls.forEach((el) => (el.style.transitionDelay = '0ms'));
        break;
      }
      case 'turnStart': {
        setActive(d.p);
        updatePanels();
        if (!d.p.isHuman || S.autoPlay) help(`${nameOf(d.p)}의 차례`);
        break;
      }
      case 'shake': {
        banner('흔들기!', `${nameOf(d.p)} — 같은 월 3장 공개 ×2`, 'great', 1600);
        bubble(d.p, '흔들기!', 'go');
        A.sfx('bigslap');
        V.say('흔들기!', voiceOf(d.p), { priority: true });
        addLog(`${nameOf(d.p)}: 흔들기 (${d.cards.slice(0, 3).map(H.cardName).join(', ')})`, 'h');
        if (d.p.isHuman) addVip(20, '흔들기');
        updatePanels();
        await wait(1300, sess);
        break;
      }
      case 'play': {
        render();
        if (d.dummy) { help(`${nameOf(d.p)} — 폭탄 패스`); A.sfx('click'); }
        else {
          A.sfx(d.bomb ? 'bigslap' : 'slap');
          addLog(`${nameOf(d.p)}: ${d.cards.map(H.cardName).join(', ')} 냄`);
        }
        await wait(d.bomb ? 600 : 420, sess);
        break;
      }
      case 'flip': {
        render();
        A.sfx('slap');
        await wait(520, sess);
        break;
      }
      case 'capture': {
        render();
        d.cards.forEach((c) => {
          const el = S.cardEls[c.id];
          el.classList.add('newcap');
          setTimeout(() => el.classList.remove('newcap'), 900);
        });
        A.sfx('chip');
        updatePanels();
        await wait(380, sess);
        break;
      }
      case 'special': {
        const sp = SPECIAL[d.kind];
        if (!sp) break;
        render();
        const who = nameOf(d.p);
        banner(sp[0], `${who} — ${sp[1]}`, sp[2], d.kind === 'chongtong' || d.kind === 'threePpeok' ? 2600 : 1500);
        const line = !d.p.isHuman && d.p.lines && (d.kind === 'ppeok' ? d.p.lines.ppeok : d.kind === 'jjok' ? d.p.lines.jjok : null);
        bubble(d.p, line ? line[0] : sp[3], d.kind === 'ppeok' ? '' : 'go');
        V.say(line ? line[0] : sp[3], voiceOf(d.p), { priority: true });
        addLog(`${who}: ${sp[0]}`, 'h');
        if (d.kind === 'ppeok') { A.sfx('lose'); setMood(d.p, 'sad'); }
        else if (sp[2] === 'jackpot') { A.sfx('jackpot'); FX.slot(sp[0].replace('!', '')); FX.coinRain(120); FX.fireworks(8, 280); }
        else { A.sfx(d.kind === 'bomb' ? 'gong' : 'good'); FX.flash(d.kind === 'bomb' ? '#ff9f1c' : '#ffffff'); if (d.kind === 'bomb') FX.shake(); FX.confetti(50); setMood(d.p, 'happy'); }
        if (d.p.isHuman && SPECIAL_VIP[d.kind]) addVip(SPECIAL_VIP[d.kind], sp[0]);
        updatePanels();
        await wait(sp[2] === 'jackpot' ? 2600 : 1150, sess);
        break;
      }
      case 'steal': {
        render();
        bubble(d.from, '피 뺏김…', '', 1200);
        A.sfx('chip');
        updatePanels();
        await wait(260, sess);
        break;
      }
      case 'score': {
        await announceSets(d.p, d.before, d.after, sess);
        updatePanels();
        break;
      }
      case 'go': {
        const n = d.count;
        const title = n >= 3 ? (n === 3 ? '쓰리고!' : n === 4 ? '포고!' : `${n}고!`) : n === 2 ? '투고!' : '원고!';
        const ko = n >= 3 ? `${n}고! 점수 ×${Math.pow(2, n - 2)}` : `${n}고! +${n}점`;
        banner(title, `${nameOf(d.p)} — ${d.score}점에서 ${ko}`, n >= 3 ? 'jackpot' : 'great', 1700);
        const line = !d.p.isHuman && d.p.lines ? d.p.lines.go[Math.min(n - 1, d.p.lines.go.length - 1)] : (n >= 3 ? '쓰리고!' : '고!');
        bubble(d.p, line, 'go', 2000);
        V.say(n >= 3 ? title : line, voiceOf(d.p), { priority: true });
        A.sfx(n >= 3 ? 'fanfare' : 'gong');
        if (n >= 2 || g.players.filter((q) => q.go).length >= 2) A.play('tension');
        if (n >= 3) { FX.fireworks(4, 250); if (d.p.isHuman) addVip(100 * (n - 2), `${n}고`); }
        addLog(`${nameOf(d.p)}: ${n}고 (${d.score}점)`, 'h');
        updatePanels();
        await wait(1500, sess);
        break;
      }
      case 'stop': {
        banner('STOP!', `${nameOf(d.p)} — ${d.score}점에서 스톱!`, 'jackpot', 1600);
        const line = !d.p.isHuman && d.p.lines ? d.p.lines.stop[0] : '스톱!';
        bubble(d.p, line, 'stop', 2200);
        V.say(line, voiceOf(d.p), { priority: true });
        A.sfx('fanfare');
        addLog(`${nameOf(d.p)}: 스톱 (${d.score}점)`, 'h');
        await wait(1400, sess);
        break;
      }
      case 'nagari': {
        banner('나가리', `아무도 못 났습니다 — 다음 판 ×${d.carry}`, 'bad', 2200);
        V.say(`나가리! 다음 판은 ${d.carry}배입니다`, 'dealer', { priority: true });
        A.sfx('lose');
        addLog(`나가리 → 다음 판 ×${d.carry}`, 'h');
        await wait(2000, sess);
        break;
      }
      default: break;
    }
  }

  async function announceSets(p, b, a, sess) {
    const ev = [];
    if (a.godori && !b.godori) ev.push(['고도리!', '새 세 마리 5점', 'great', '고도리!', 50]);
    if (a.hongdan && !b.hongdan) ev.push(['홍단!', '붉은 띠 3장 3점', 'good', '홍단!', 30]);
    if (a.cheongdan && !b.cheongdan) ev.push(['청단!', '푸른 띠 3장 3점', 'good', '청단!', 30]);
    if (a.chodan && !b.chodan) ev.push(['초단!', '풀 띠 3장 3점', 'good', '초단!', 30]);
    if (a.nG > b.nG && a.nG >= 3) {
      const t = a.nG === 5 ? '오광!' : a.nG === 4 ? '사광!' : (a.gwangPts === 2 ? '비삼광!' : '삼광!');
      ev.push([t, `광 ${a.nG}장 ${a.gwangPts}점`, a.nG === 5 ? 'jackpot' : 'great', t, a.nG === 5 ? 1000 : a.nG === 4 ? 100 : 30]);
    }
    if (a.nYul >= 7 && b.nYul < 7) ev.push(['멍따!', '열끗 7장 — 이기면 멍박 ×2', 'good', '멍따!', 20]);
    if (a.piCount >= 10 && b.piCount < 10) ev.push(['피 10장!', '피로 점수 시작', 'info', '피 열 장!', 0]);
    for (const [t, sub, tier, say, vip] of ev) {
      banner(t, `${nameOf(p)} — ${sub}`, tier, 1500);
      V.say(say, voiceOf(p), { priority: true });
      if (tier === 'jackpot') { A.sfx('jackpot'); FX.slot(t.replace('!', '')); FX.coinRain(150); }
      else if (tier === 'great') { A.sfx('fanfare'); FX.fireworks(3, 220); }
      else A.sfx('good');
      if (p.isHuman && vip) addVip(vip, t);
      setMood(p, 'happy');
      addLog(`${nameOf(p)}: ${t}`, 'h');
      await wait(tier === 'jackpot' ? 2400 : 1250, sess);
    }
  }

  /* ============================================================
   * 판 진행 / 정산
   * ============================================================ */
  function pickOpponents(stageId, count) {
    const pool = R.CHARACTERS[stageId].slice();
    for (let t = 0; t < 50; t++) {
      window.GoStop.shuffle(pool);
      const sel = pool.slice(0, count);
      if (count < 2 || (sel.some((c) => c.gender === 'M') && sel.some((c) => c.gender === 'F'))) return sel;
    }
    return pool.slice(0, count);
  }

  async function startStage(id) {
    A.init();
    closeModal();
    const st = R.STAGES[id - 1];
    S.stage = st;
    const sess = ++S.session;
    const nOpp = save.mode === 2 ? 1 : 2;
    const opps = pickOpponents(id, nOpp);
    S.roster = [{ id: 'me', name: playerName(), gender: save.gender, isHuman: true, avatar: save.gender === 'F' ? 'player_f' : 'player_m', money: st.startMoney }]
      .concat(opps.map((c) => Object.assign({}, c, { isHuman: false, level: st.level, avatar: c.id, money: st.startMoney })));
    S.dealerId = S.roster[Math.floor(Math.random() * S.roster.length)].id;
    S.carry = 1; S.gameNo = 0; S.game = null;
    document.documentElement.style.setProperty('--felt', st.felt);
    document.documentElement.style.setProperty('--accent', st.accent);
    $('#hudVenue').textContent = st.venue;
    $('#hudGrade').textContent = st.grade;
    $('#log').innerHTML = '';
    showScreen('game');
    buildCards();
    updateHud();
    A.play(st.bgm);
    banner(st.venue, `STAGE ${st.id} · ${st.grade} · ${nOpp === 1 ? '2인 맞고' : '3인 고스톱'} · 점당 ${won(st.pointValue)}`, 'info', 2600);
    V.say(`${st.venueKo}에 오신 것을 환영합니다. ${st.grade} 테이블, 점당 ${st.pointValue}원입니다.`, 'dealer', { priority: true });
    try {
      await wait(2200, sess);
      let lastN = S.roster.length;
      for (;;) {
        const me = human();
        const active = S.roster.filter((p) => p.money > 0);
        if (me.money <= 0) return gameOver(st, sess);
        if (active.length === 1 || me.money >= st.startMoney * 2) return stageClear(st, sess);
        if (active.length < lastN && active.length === 2 && lastN === 3) {
          banner('맞고 전환', '한 명이 파산! 이제부터 2인 맞고 (7점)', 'info', 2200);
          V.say('한 명 파산! 이제부터 맞고입니다', 'dealer', { priority: true });
          await wait(2000, sess);
        }
        lastN = active.length;
        await playOneGame(active, sess);
      }
    } catch (e) {
      if (e && e.name === 'Abort') return;
      console.error(e);
    }
  }

  async function playOneGame(active, sess) {
    S.gameNo++;
    let dealerIdx = active.findIndex((p) => p.id === S.dealerId);
    if (dealerIdx < 0) dealerIdx = 0;
    const g = new window.GoStop.GoStopGame({
      players: active.map((p) => Object.assign({}, p, { level: p.isHuman ? 'reg' : p.level })),
      dealer: dealerIdx, carry: S.carry,
      hooks: { event: (t, d) => onEvent(t, d, sess), decide: (p, k, c) => decide(p, k, c, sess) },
    });
    S.game = g;
    S.hoverId = null; S.hoverMonth = null;
    buildPanels();
    updateHud();
    addLog(`— ${S.gameNo}번째 판 (선: ${nameOf(g.players[dealerIdx])}${S.carry > 1 ? `, ×${S.carry}` : ''})`, 'h');
    const res = await g.play();
    setActive(null);
    help('');
    if (sess !== S.session) throw new AbortErr();
    if (res.nagari) {
      S.carry = Math.min(res.carry, 8);
      updateHud();
      await wait(600, sess);
      return;
    }
    S.carry = 1;
    // 정산
    const pv = S.stage.pointValue;
    const wr = S.roster.find((p) => p.id === res.winner.id);
    const transfers = res.losers.map((l) => {
      const lr = S.roster.find((p) => p.id === l.player.id);
      const amount = Math.min(l.pay * pv, lr.money);
      lr.money -= amount; wr.money += amount;
      return { l, lr, amount };
    });
    S.dealerId = res.winner.id;
    // 연출
    const wp = res.winner;
    S.panels[wp.id] && S.panels[wp.id].classList.add('winner');
    setMood(wp, 'happy');
    res.losers.forEach((l) => setMood(l.player, 'sad'));
    S.revealAll = true; render();
    const total = transfers.reduce((s, t) => s + t.amount, 0);
    const r = S.panels[wp.id].getBoundingClientRect();
    FX.coins(wp.isHuman ? 60 : 24, r.left + 30, r.top + 30);
    A.sfx(wp.isHuman ? 'win' : 'chips');
    if (wp.isHuman) V.say(`${playerName()}님 승리! ${fmt(total)}원 획득!`, 'dealer', { priority: true });
    else {
      const line = wp.lines ? wp.lines.win[Math.floor(Math.random() * wp.lines.win.length)] : '';
      bubble(wp, line, 'stop', 2400);
      V.say(line, wp, { priority: true });
    }
    const flagsAny = res.losers.some((l) => l.flags.pibak || l.flags.gwangbak || l.flags.meongbak || l.flags.gobak);
    if (flagsAny) {
      const names = [];
      res.losers.forEach((l) => {
        if (l.flags.pibak) names.push('피박'); if (l.flags.gwangbak) names.push('광박');
        if (l.flags.gobak) names.push('고박');
      });
      if (res.losers[0].flags.meongbak) names.push('멍박');
      const uniq = [...new Set(names)];
      setTimeout(() => { if (sess === S.session) { banner(uniq.join(' · '), '배수 적용!', 'bad', 1600); V.say(uniq.join(', ') + '!', 'dealer'); } }, 900);
    }
    if (wp.isHuman && total >= pv * 15) { FX.coinRain(100); }
    updatePanels();
    await wait(1800, sess);
    await showResult(res, transfers, sess);
    S.revealAll = false;
  }

  function showResult(res, transfers, sess) {
    return new Promise((resolve, reject) => {
      if (sess !== S.session) return reject(new AbortErr());
      const ws = res.ws, wp = res.winner, pv = S.stage.pointValue;
      const rows = [];
      if (res.reason === 'chongtong') rows.push(['총통', '10점']);
      else if (res.reason === 'threePpeok') rows.push(['쓰리뻑', '7점']);
      else {
        if (ws.gwangPts) rows.push([`광 ${ws.nG}장`, ws.gwangPts + '점']);
        if (ws.godori) rows.push(['고도리', '5점']);
        if (ws.yulPts) rows.push([`열끗 ${ws.nYul}장`, ws.yulPts + '점']);
        if (ws.hongdan) rows.push(['홍단', '3점']);
        if (ws.cheongdan) rows.push(['청단', '3점']);
        if (ws.chodan) rows.push(['초단', '3점']);
        if (ws.ttiPts) rows.push([`띠 ${ws.nTti}장`, ws.ttiPts + '점']);
        if (ws.piPts) rows.push([`피 ${ws.piCount}장${ws.kookjinAsPi ? ' (국진→쌍피)' : ''}`, ws.piPts + '점']);
        if (res.goBonus) rows.push([`${res.go}고 보너스`, '+' + res.goBonus + '점']);
        if (res.goMul > 1) rows.push([`${res.go}고 배수`, '×' + res.goMul]);
      }
      const mults = [];
      if (res.shakeMul > 1) mults.push(`흔들기/폭탄 ×${res.shakeMul}`);
      if (res.carry > 1) mults.push(`나가리 ×${res.carry}`);
      const pays = transfers.map((t) => {
        const f = t.l.flags, tags = [];
        if (f.pibak) tags.push('피박'); if (f.gwangbak) tags.push('광박'); if (f.meongbak) tags.push('멍박');
        if (f.gobak) tags.push(S.game.n === 2 ? '고박' : (t.l.paysFor ? '고박(독박)' : '고박 면제'));
        const pts = t.l.pay;
        return `<div class="pay-line"><span>${nameOf(t.l.player)} ${tags.map((x) => `<span class="tag go">${x}</span>`).join(' ')}</span>
          <span>${pts}점 × ${won(pv)} = <b class="minus">−${won(t.amount)}</b>${t.amount < pts * pv ? ' <small>(잔액 부족)</small>' : ''}</span></div>`;
      }).join('');
      const total = transfers.reduce((s, t) => s + t.amount, 0);
      const title = wp.isHuman ? 'YOU WIN!' : 'LOSE';
      const reasonKo = { stop: '스톱', chongtong: '총통', threePpeok: '쓰리뻑' }[res.reason];
      const html = `
        <h2>${title}</h2>
        <div class="result-big">
          <p><b>${nameOf(wp)}</b> ${reasonKo}${res.go ? ` · ${res.go}고` : ''} — 기본 ${res.pts}점</p>
          <table class="breakdown">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}
          <tr class="total"><td>최종 점수</td><td>${res.pts}점</td></tr></table>
          <div class="mults">${mults.map((m) => `<span>${m}</span>`).join('') || '<span class="n">추가 배수 없음</span>'}</div>
          ${pays}
          <div class="pay-line"><span><b>${nameOf(wp)}</b> 획득</span><b class="plus">+${won(total)}</b></div>
          <p style="margin-top:10px">${S.roster.map((p) => `${nameOf(p)} <b style="color:#ffd166">${won(p.money)}</b>`).join(' · ')}</p>
        </div>`;
      const go = () => { if (sess === S.session) resolve(); else reject(new AbortErr()); };
      modal(html, [{ label: '로비로', cls: 'secondary', fn: () => quitToLobby() }, { label: '다음 판 ▶', cls: 'primary', fn: go }]);
      if (wp.isHuman) addLog(`🏆 승리 +${won(total)}`, 'h'); else addLog(`💸 ${nameOf(wp)} 승리 (내 손실 ${won((transfers.find((t) => t.lr.isHuman) || { amount: 0 }).amount)})`, 'h');
      if (S.autoPlay) setTimeout(() => { closeModal(); go(); }, 2500);
    });
  }

  function stageClear(st, sess) {
    A.play('victory');
    A.sfx('fanfare');
    FX.fireworks(12, 260); FX.confetti(220);
    const bonus = 1000 * st.id;
    if (!S.autoPlay) {
      save.cleared[st.id] = true;
      save.unlocked = Math.max(save.unlocked, Math.min(R.STAGES.length, st.id + 1));
      persist();
    }
    addVip(bonus, `${st.venue} 클리어`);
    const last = st.id === R.STAGES.length;
    if (last) { FX.slot('CHAMPION'); FX.coinRain(220); }
    V.say(last ? `축하합니다! ${playerName()}님, 라스베가스 고스톱 챔피언입니다!` : `축하합니다! ${st.venueKo} 정복! 다음 등급 테이블이 열렸습니다.`, 'dealer', { priority: true });
    setTimeout(() => {
      if (sess !== S.session) return;
      modal(`
        <h2>${last ? 'CHAMPION!' : 'STAGE CLEAR'}</h2>
        <div class="result-big">
          <p>${st.venue} · <b>${st.grade}</b> 테이블 정복 🏆</p>
          <p>최종 판돈 <span class="pts">${won(human().money)}</span></p>
          <p>${last ? '하수·중수·고수를 모두 꺾고 <b>라스베가스 고스톱 챔피언</b>이 되었습니다!' : `다음 등급 <b>${R.STAGES[st.id].grade}</b> — ${R.STAGES[st.id].venue} 가 열렸습니다.`}</p>
          <p>클리어 보너스 <span class="pts">+${fmt(bonus)}</span> VIP · 총 <span class="pts">${fmt(save.vip)}</span></p>
        </div>`, last
        ? [{ label: '로비로', cls: 'secondary', fn: goLobby }, { label: '다시 플레이', cls: 'primary', fn: () => startStage(st.id) }]
        : [{ label: '로비로', cls: 'secondary', fn: goLobby }, { label: '다음 스테이지 ▶', cls: 'primary', fn: () => startStage(st.id + 1) }]);
    }, last ? 3500 : 2200);
  }

  function gameOver(st, sess) {
    A.play('gameover');
    V.say('판돈을 모두 잃었습니다. 다시 도전해 보세요.', 'dealer', { priority: true });
    setTimeout(() => {
      if (sess !== S.session) return;
      modal(`
        <h2>GAME OVER</h2>
        <div class="result-big">
          <p>${st.venue} · ${st.grade} 테이블에서 파산했습니다</p>
          <p>플레이한 판: ${S.gameNo}</p>
          <p>VIP 포인트 <span class="pts">${fmt(save.vip)}</span></p>
        </div>`, [{ label: '로비로', cls: 'secondary', fn: goLobby }, { label: '다시 도전', cls: 'primary', fn: () => startStage(st.id) }]);
    }, 1800);
  }

  function quitToLobby() {
    S.session++;
    if (S.pending) { const p = S.pending; S.pending = null; p.reject(new AbortErr()); }
    goLobby();
  }
  function goLobby() {
    S.session++;
    closeModal();
    V.stop();
    S.game = null;
    showScreen('lobby');
    renderLobby();
    A.play('lounge');
  }

  /* ============================================================
   * 시작
   * ============================================================ */
  function boot() {
    buildSkyline();
    FX.init();
    V.init();
    V.on = save.voice;
    A.bgmOn = save.bgm; A.sfxOn = save.sfx;
    bindLobby();
    renderLobby();
    syncToggles();
    const q = new URLSearchParams(location.search);
    S.autoPlay = q.get('auto') === '1';
    if (q.get('mode')) save.mode = q.get('mode') === '2' ? 2 : 3;
    if (q.get('stage')) {
      $('#startOverlay').remove();
      startStage(Math.max(1, Math.min(R.STAGES.length, +q.get('stage') || 1)));
      return;
    }
    $('#startOverlay').onclick = () => {
      A.init();
      A.setBgm(save.bgm); A.setSfx(save.sfx);
      A.play('lounge');
      $('#startOverlay').remove();
      V.load();
      V.say('라스베가스에 오신 것을 환영합니다. 고스톱 한 판 하시죠.', 'dealer', { priority: true });
    };
  }
  boot();
})();
