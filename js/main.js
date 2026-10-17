/* ============================================================
 * main.js — 화면, 테이블 연출, 진행(하수 → 중수 → 고수), 이벤트
 * ============================================================ */
(function () {
  'use strict';
  const C = window.Cards, R = window.Roster, A = window.GameAudio, V = window.Voice;
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  /* ---------------- 저장 ---------------- */
  const STORE = 'lvholdem_v1';
  const DEFAULTS = { name: '', gender: 'M', unlocked: 1, cleared: {}, vip: 0, tableSize: 6, speed: 'normal', bgm: true, sfx: true, voice: true, helper: true };
  let save = Object.assign({}, DEFAULTS);
  try { save = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* 저장소 사용 불가 */ }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* 무시 */ } };

  const SPEED = { slow: 1.45, normal: 1, fast: 0.55, turbo: 0.28 };
  const S = { session: 0, table: null, stage: null, human: null, seats: [], bets: [], pending: null, prevCat: -1, lastResults: null, totalChips: 0 };

  class AbortErr extends Error { constructor() { super('abort'); this.name = 'Abort'; } }
  const speedMul = () => {
    const h = S.human;
    return (SPEED[save.speed] || 1) * (h && (h.folded || h.out) ? 0.55 : 1);
  };
  function wait(ms, sess) {
    return new Promise((res, rej) => setTimeout(() => {
      if (sess !== undefined && sess !== S.session) rej(new AbortErr()); else res();
    }, Math.max(0, ms * speedMul())));
  }
  const playerName = () => (save.name || '플레이어').trim() || '플레이어';

  /* ============================================================
   * 스카이라인 (SVG 직접 생성)
   * ============================================================ */
  function buildSkyline() {
    const svg = $('#skyline');
    const ns = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const neon = ['#ff2d95', '#4cc9f0', '#ffd166', '#06d6a0', '#b5179e'];
    // 뒷줄 건물
    for (let x = 0; x < 1200; x += 34 + rnd() * 30) {
      const w = 30 + rnd() * 40, h = 60 + rnd() * 120;
      el('rect', { x, y: 300 - h, width: w, height: h, fill: '#140726' });
    }
    // 앞줄 건물 + 창문 + 네온 테두리
    for (let x = -10; x < 1200; x += 60 + rnd() * 50) {
      const w = 50 + rnd() * 60, h = 80 + rnd() * 140;
      const c = neon[Math.floor(rnd() * neon.length)];
      el('rect', { x, y: 300 - h, width: w, height: h, fill: '#1c0b33', stroke: c, 'stroke-width': 1.5, 'stroke-opacity': 0.8 });
      for (let wy = 300 - h + 10; wy < 290; wy += 14) for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        if (rnd() < 0.55) el('rect', { x: wx, y: wy, width: 6, height: 7, fill: rnd() < 0.7 ? '#ffd98a' : '#9be7ff', opacity: 0.75, class: rnd() < 0.15 ? 'win' : '' });
      }
    }
    // 전망 타워
    el('rect', { x: 905, y: 40, width: 10, height: 260, fill: '#2a1048', stroke: '#4cc9f0', 'stroke-width': 1 });
    el('ellipse', { cx: 910, cy: 55, rx: 34, ry: 12, fill: '#2a1048', stroke: '#ff2d95', 'stroke-width': 2 });
    el('rect', { x: 908, y: 8, width: 4, height: 34, fill: '#ff2d95' });
    // 피라미드
    el('polygon', { points: '160,300 250,170 340,300', fill: '#120622', stroke: '#ffd166', 'stroke-width': 2 });
    el('line', { x1: 250, y1: 170, x2: 250, y2: 0, stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 6 });
    // 대관람차
    const cx = 640, cy = 175, r = 85;
    el('circle', { cx, cy, r, fill: 'none', stroke: '#06d6a0', 'stroke-width': 2.5, 'stroke-opacity': 0.9 });
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      el('line', { x1: cx, y1: cy, x2: cx + r * Math.cos(a), y2: cy + r * Math.sin(a), stroke: '#06d6a0', 'stroke-opacity': 0.35 });
      el('circle', { cx: cx + r * Math.cos(a), cy: cy + r * Math.sin(a), r: 4, fill: neon[k % neon.length] });
    }
    el('polygon', { points: `${cx - 40},300 ${cx},${cy} ${cx + 40},300`, fill: 'none', stroke: '#06d6a0', 'stroke-width': 2 });
  }

  /* ============================================================
   * 로비
   * ============================================================ */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  function renderLobby() {
    $('#pName').value = save.name;
    document.querySelectorAll('.av-pick button').forEach((b) => b.classList.toggle('sel', b.dataset.g === save.gender));
    $('#optSize').value = String(save.tableSize);
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
          <span class="grade">${st.grade}</span><span class="stage-no">STAGE ${st.id} · ${st.gradeEn}</span>
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
      V.say(save.gender === 'M' ? '좋은 선택입니다, 신사분' : '좋은 선택입니다, 숙녀분', 'dealer', { priority: true });
    }));
    $('#optSize').onchange = (e) => { save.tableSize = +e.target.value; persist(); };
    $('#optSpeed').onchange = (e) => { save.speed = e.target.value; persist(); };
    $('#optBgm').onchange = (e) => { setBgm(e.target.checked); };
    $('#optSfx').onchange = (e) => { setSfx(e.target.checked); };
    $('#optVoice').onchange = (e) => { setVoice(e.target.checked); };
    $('#optHelper').onchange = (e) => { save.helper = e.target.checked; persist(); };
    $('#btnRules').onclick = showRules;
    $('#btnReset').onclick = () => confirmModal('진행 상황 초기화', '잠금 해제된 스테이지와 VIP 포인트가 모두 초기화됩니다.', () => {
      Object.assign(save, { unlocked: 1, cleared: {}, vip: 0 }); persist(); renderLobby();
    });
  }
  function setBgm(on) { save.bgm = on; persist(); A.setBgm(on); syncHudToggles(); }
  function setSfx(on) { save.sfx = on; persist(); A.setSfx(on); syncHudToggles(); }
  function setVoice(on) { save.voice = on; persist(); V.on = on; if (!on) V.stop(); syncHudToggles(); }
  function syncHudToggles() {
    $('#tBgm').classList.toggle('off', !save.bgm);
    $('#tSfx').classList.toggle('off', !save.sfx);
    $('#tVoice').classList.toggle('off', !save.voice);
  }

  /* ============================================================
   * 모달
   * ============================================================ */
  function modal(html, buttons) {
    const box = $('#modalBox');
    box.innerHTML = html + '<div class="modal-actions"></div>';
    const act = box.querySelector('.modal-actions');
    (buttons || [{ label: '닫기', cls: 'primary' }]).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = b.cls || 'secondary'; btn.textContent = b.label;
      btn.onclick = () => { A.sfx('click'); closeModal(); if (b.fn) b.fn(); };
      act.appendChild(btn);
    });
    $('#modal').classList.add('show');
  }
  const closeModal = () => $('#modal').classList.remove('show');
  function confirmModal(title, text, fn) {
    modal(`<h2 style="font-size:24px">${title}</h2><p style="text-align:center">${text}</p>`, [
      { label: '취소', cls: 'secondary' }, { label: '확인', cls: 'primary', fn },
    ]);
  }
  function showRules() {
    const rows = [
      ['로열 플러시', 'A K Q J 10 같은 무늬'], ['스트레이트 플러시', '연속된 5장 같은 무늬'], ['포카드', '같은 숫자 4장'],
      ['풀하우스', '트리플 + 원페어'], ['플러시', '같은 무늬 5장'], ['스트레이트', '연속된 숫자 5장 (A-2-3-4-5 포함)'],
      ['트리플', '같은 숫자 3장'], ['투페어', '페어 2개'], ['원페어', '같은 숫자 2장'], ['하이카드', '가장 높은 카드'],
    ].map(([a, b], i) => `<tr><td>${10 - i}. <b>${a}</b></td><td>${b}</td></tr>`).join('');
    modal(`
      <h2>HOW TO PLAY</h2>
      <h3>🎯 목표</h3>
      <p>노리밋 텍사스 홀덤 <b>시트앤고 토너먼트</b>입니다. 모든 플레이어가 같은 칩(1,500)으로 시작하며, 테이블의 상대를 전부 탈락시키면 스테이지 클리어!
      <b>하수(프리몬트 스트리트) → 중수(더 스트립) → 고수(하이롤러 룸)</b> 순서로 도전합니다.</p>
      <h3>🃏 진행</h3>
      <ul>
        <li>딜러 버튼 왼쪽이 스몰 블라인드, 그 다음이 빅 블라인드. 헤즈업(2인)에서는 버튼이 스몰 블라인드입니다.</li>
        <li>각자 2장의 홀카드 → 프리플랍 베팅 → 플랍(3장) → 턴(1장) → 리버(1장), 매 단계 베팅.</li>
        <li>내 홀카드 2장 + 공용카드 5장 중 가장 좋은 5장으로 승부합니다.</li>
        <li>레이즈는 직전 베팅/레이즈 폭 이상이어야 하며, 칩이 부족하면 올인할 수 있습니다 (사이드 팟 자동 계산).</li>
        <li>일정 핸드마다 블라인드가 오르며, 레벨 4부터 <b>빅 블라인드 앤티</b>(현행 토너먼트 방식)가 붙습니다.</li>
        <li>테이블 인원: 6인(6-Max) 또는 9인(풀링, 라스베가스 카지노 표준) 중 선택.</li>
      </ul>
      <h3>🏆 족보 (높은 순)</h3>
      <table>${rows}</table>
      <h3>🤖 상대 등급</h3>
      <ul>
        <li><b>하수</b> — 아무 패나 잘 콜하는 "콜링 스테이션". 강한 패일 때만 레이즈합니다.</li>
        <li><b>중수</b> — 타이트-어그레시브. 핸드 강도(Chen 공식)·몬테카를로 승률·팟 오즈로 판단.</li>
        <li><b>고수</b> — 상대 레인지 추정, 포지션/스택 기반 푸시·폴드, 세미블러프·체크레이즈, 당신의 플레이 습관을 학습해 공략.</li>
      </ul>
      <h3>🎰 보너스 이벤트</h3>
      <p>스트레이트 이상 완성, 하이핸드(포카드·스트레이트 플러시·로열 플러시) 잭팟, 배드빗 보너스, 빅팟, 녹아웃 등에서 VIP 포인트와 특수 연출이 나옵니다.</p>
      <h3>⌨️ 단축키</h3>
      <p>F 폴드 · C 또는 Space 체크/콜 · R 레이즈 · ↑/↓ 레이즈 금액</p>`);
  }

  /* ============================================================
   * 테이블 구성
   * ============================================================ */
  function pickOpponents(stageId, count) {
    const pool = R.CHARACTERS[stageId].slice();
    for (let tries = 0; tries < 50; tries++) {
      C.shuffle(pool);
      const sel = pool.slice(0, count);
      const m = sel.filter((c) => c.gender === 'M').length;
      if (count < 4 || (m >= 2 && count - m >= 2)) return sel;
    }
    return pool.slice(0, count);
  }

  function layoutTable() {
    const wrap = $('#tableWrap'), tb = $('#table');
    if (!wrap.offsetParent) return;
    const cs = getComputedStyle(wrap);
    const W = Math.min(wrap.clientWidth, innerWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const portrait = isPortrait();
    const ratio = portrait ? 0.72 : innerWidth < 760 ? 1.45 : 2.05;
    let w = Math.min(W, H * ratio);
    w = Math.max(260, w);
    tb.style.width = w + 'px';
    tb.style.height = (w / ratio) + 'px';
    const s = portrait ? Math.max(0.42, Math.min(0.9, w / 700)) : Math.max(0.5, Math.min(1.25, w / 1100 * (innerWidth < 760 ? 1.45 : 1)));
    tb.style.setProperty('--s', s.toFixed(3));
    $('#table').classList.toggle('portrait', portrait);
    positionSeats();
  }
  const isPortrait = () => innerWidth < 760 && innerHeight > innerWidth;

  function seatPos(i, n) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
    const [rx, ry] = isPortrait() ? [33, 43] : [45, 41];
    return { a, x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a), cos: Math.cos(a), sin: Math.sin(a) };
  }
  function positionSeats() {
    const t = S.table;
    if (!t || !S.seats.length) return;
    const portrait = isPortrait();
    t.players.forEach((p, i) => {
      const pos = seatPos(i, t.n);
      const el = S.seats[i];
      el.style.left = pos.x + '%'; el.style.top = pos.y + '%';
      el.classList.toggle('top', pos.sin < -0.25);
      const b = S.bets[i];
      const bx = 50 + (portrait ? 24 : 29) * pos.cos, by = 50 + (portrait ? 29 : 25) * pos.sin + (pos.sin < -0.25 ? 4 : 0);
      b.style.left = bx + '%'; b.style.top = by + '%';
      b.dataset.x = bx; b.dataset.y = by;
    });
    if (S.buttonIdx != null) {
      const pos = seatPos(S.buttonIdx, t.n);
      const k = portrait ? [28, 34] : [36, 31];
      $('#dealerBtn').style.left = (50 + k[0] * Math.cos(pos.a + 0.32)) + '%';
      $('#dealerBtn').style.top = (50 + k[1] * Math.sin(pos.a + 0.32)) + '%';
    }
  }

  function buildTable() {
    const t = S.table;
    const seatsEl = $('#seats'), betsEl = $('#bets');
    seatsEl.innerHTML = ''; betsEl.innerHTML = '';
    S.seats = []; S.bets = []; S.buttonIdx = null;
    t.players.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'seat' + (p.isHuman ? ' me' : '');
      const grade = p.isHuman ? 'YOU' : S.stage.grade + ' · ' + (p.gender === 'M' ? '♂' : '♀');
      el.innerHTML = `
        <div class="cards"></div>
        <div class="who">
          <div class="ava"><img src="${R.avatarSrc(p.avatar)}" alt="${p.name}"><span class="pos-tag"></span><span class="think">…</span></div>
          <div class="plate"><div class="nm"></div><div class="st"></div><div class="grade-tag">${grade}</div></div>
          <div class="eq"></div>
        </div>
        <div class="bubble"></div>
        <div class="hand-label"></div>
        ${p.isHuman ? '<div class="made-badge"></div>' : ''}`;
      el.title = p.isHuman ? playerName() : `${p.name} — ${p.title}`;
      seatsEl.appendChild(el);
      S.seats.push(el);

      const b = document.createElement('div');
      b.className = 'bet';
      b.innerHTML = '<div class="chips"></div><span class="amt"></span>';
      betsEl.appendChild(b);
      S.bets.push(b);
      renderSeat(i);
    });
    const board = $('#board');
    board.innerHTML = '';
    for (let k = 0; k < 5; k++) { const s = document.createElement('div'); s.className = 'slot'; board.appendChild(s); }
    layoutTable();
  }

  function renderSeat(i) {
    const p = S.table.players[i], el = S.seats[i];
    el.querySelector('.nm').textContent = p.isHuman ? playerName() : p.name;
    el.querySelector('.st').textContent = fmt(p.stack);
    el.classList.toggle('folded', p.folded && !p.out);
    el.classList.toggle('out', !!p.out);
  }
  const renderAll = () => S.table.players.forEach((_, i) => renderSeat(i));

  const CHIP_COLORS = [[5000, '#6a0dad'], [1000, '#ffbe0b'], [500, '#7b2cbf'], [100, '#111'], [25, '#2a9d8f'], [5, '#e63946'], [1, '#f1faee']];
  function renderBets() {
    S.table.players.forEach((p, i) => {
      const b = S.bets[i];
      if (p.bet > 0) {
        b.classList.add('show');
        b.querySelector('.amt').textContent = fmt(p.bet);
        let n = 0, html = '', amt = p.bet;
        for (const [v, col] of CHIP_COLORS) {
          while (amt >= v && n < 5) { html += `<i style="background:${col};top:${-n * 3}px"></i>`; amt -= v; n++; }
        }
        b.querySelector('.chips').innerHTML = html;
      } else b.classList.remove('show');
    });
    renderPot();
  }
  function renderPot() {
    const pot = S.table.pot();
    $('#pot').classList.toggle('show', pot > 0);
    $('#potAmt').textContent = fmt(pot);
  }
  async function collectBets(sess) {
    const shown = S.bets.filter((b) => b.classList.contains('show'));
    if (!shown.length) return;
    shown.forEach((b) => { b.style.left = '50%'; b.style.top = '30%'; b.style.opacity = '0'; });
    A.sfx('chips');
    await wait(420, sess);
    S.bets.forEach((b) => { b.classList.remove('show'); b.style.left = b.dataset.x + '%'; b.style.top = b.dataset.y + '%'; b.style.opacity = '1'; });
  }

  function cardEl(c, up) {
    const el = document.createElement('div');
    el.className = 'card' + (up ? ' up' : '');
    let front = '<div class="face front"></div>';
    if (c != null) {
      const r = C.rankOf(c), s = C.suitOf(c), sym = C.SUITS[s], rc = C.RANK_CH[r];
      el.classList.add(s === 1 || s === 2 ? 'red' : 'black');
      const center = r >= 11 && r <= 13
        ? `<div class="pip face-letter">${rc}<i>${sym}</i></div>`
        : `<div class="pip"${r === 14 ? ' style="font-size:2.9em"' : ''}>${sym}</div>`;
      front = `<div class="face front"><div class="corner tl">${rc}<span class="s">${sym}</span></div>${center}<div class="corner br">${rc}<span class="s">${sym}</span></div></div>`;
      el.dataset.card = c;
    }
    el.innerHTML = `<div class="inner">${front}<div class="face back"></div></div>`;
    return el;
  }
  function dealVector(targetEl) {
    const tb = $('#table').getBoundingClientRect(), r = targetEl.getBoundingClientRect();
    return { dx: tb.left + tb.width / 2 - (r.left + r.width / 2), dy: tb.top + tb.height * 0.3 - (r.top + r.height / 2) };
  }
  function revealSeat(p, sess) {
    const i = S.table.players.indexOf(p), box = S.seats[i].querySelector('.cards');
    if (p.isHuman) return;
    box.innerHTML = '';
    p.hole.forEach((c, k) => {
      const el = cardEl(c, false);
      box.appendChild(el);
      setTimeout(() => { if (sess === S.session) el.classList.add('up'); }, 60 + k * 120);
    });
    A.sfx('flip');
  }

  function bubble(i, text, cls, ms) {
    const b = S.seats[i].querySelector('.bubble');
    b.className = 'bubble show ' + (cls || '');
    b.textContent = text;
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('show'), ms || 1600);
  }
  function setMood(p, mood) {
    const i = S.table.players.indexOf(p);
    S.seats[i].querySelector('.ava img').src = R.avatarSrc(p.avatar, mood);
  }
  function setActive(i) {
    S.seats.forEach((s, k) => s.classList.toggle('active', k === i));
  }
  function seatCenter(i) {
    const r = S.seats[i].querySelector('.ava').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function tableMsg(t) { $('#tableMsg').textContent = t || ''; }

  function addLog(text, cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    const log = $('#log');
    log.appendChild(d);
    while (log.children.length > 400) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
  const pName = (p) => (p.isHuman ? playerName() : p.name);

  function updateHud() {
    const t = S.table;
    if (!t) return;
    const L = t.level;
    $('#hudBlinds').textContent = `${fmt(L.sb)}/${fmt(L.bb)}${L.ante ? ' (' + fmt(L.ante) + ')' : ''}`;
    const played = Math.max(0, t.handNo - 1) % t.handsPerLevel;
    $('#hudNext').textContent = t.levelIdx >= t.levels.length - 1 ? 'MAX' : `${t.handsPerLevel - played - (t.handNo ? 1 : 0)}핸드`;
    $('#hudHand').textContent = '#' + Math.max(1, t.handNo);
    $('#hudLeft').textContent = `${t.alive().length}/${t.n}`;
  }

  /* ---------------- 내 패 정보 / 승률 도우미 ---------------- */
  /**
   * 메이드(스트레이트 이상 완성) 정보: 족보 + 메이드 강도 등급 + 승률
   * 등급은 현재 보드에서 상대가 가질 수 있는 모든 홀카드 조합 중 나를 이기는 비율로 산정
   */
  function madeInfo(hole, board, numOpp) {
    if (board.length < 3) return null;
    const sc = C.evaluate(hole.concat(board));
    const cat = C.category(sc);
    if (cat < 4) return null;
    if (board.length === 5 && C.evaluate(board) === sc) return null; // 보드 그대로 플레이 = 내 메이드 아님
    const key = hole.join(',') + '|' + board.join(',') + '|' + numOpp;
    if (S.madeCache && S.madeCache.key === key) return S.madeCache.info;
    const used = new Set(hole.concat(board));
    const rest = [];
    for (let i = 0; i < 52; i++) if (!used.has(i)) rest.push(i);
    let beat = 0, total = 0;
    for (let a = 0; a < rest.length; a++) for (let b = a + 1; b < rest.length; b++) {
      total++;
      if (C.evaluate([rest[a], rest[b]].concat(board)) > sc) beat++;
    }
    const pct = beat / total;
    const grade = beat === 0 ? ['넛', 'nuts'] : pct < 0.02 ? ['최상급', 'top'] : pct < 0.08 ? ['상급', 'high']
      : pct < 0.2 ? ['중급', 'mid'] : ['하급', 'low'];
    const eq = numOpp > 0 ? C.equity(hole, board, numOpp, 1500) : 1;
    const info = { sc, cat, name: C.handName(sc), grade: grade[0], gradeCls: grade[1], beatPct: pct, eq };
    S.madeCache = { key, info };
    return info;
  }
  function renderMadeBadge(info) {
    const badge = S.seats[0] && S.seats[0].querySelector('.made-badge');
    if (!badge) return;
    if (!info) { badge.classList.remove('show'); return; }
    badge.className = 'made-badge show ' + info.gradeCls;
    badge.innerHTML = `<span class="mb-tag">MADE</span><b>${info.name}</b><span class="mb-grade">${info.grade}</span><span class="mb-eq">${Math.round(info.eq * 100)}%</span>`;
  }

  function updateMyHand() {
    const h = S.human, t = S.table;
    const el = $('#myHand');
    if (!h || h.out) { el.innerHTML = '탈락'; renderMadeBadge(null); return; }
    if (!h.hole.length) { el.innerHTML = '카드를 기다리는 중…'; renderMadeBadge(null); return; }
    if (h.folded) { el.innerHTML = `<b>폴드</b> · 다음 핸드를 기다리는 중`; renderMadeBadge(null); return; }
    let html;
    const made = madeInfo(h.hole, t.board, t.contenders().length - 1);
    renderMadeBadge(made);
    if (made) {
      el.innerHTML = `<span class="made-line">메이드: <b>${made.name}</b> · 등급 <b class="g-${made.gradeCls}">${made.grade}</b>`
        + `${made.beatPct > 0 ? ` <small>(이기는 조합 ${(made.beatPct * 100).toFixed(1)}%)</small>` : ''}</span>`
        + `<br>승률 <span class="eqv">${Math.round(made.eq * 100)}%</span> vs ${t.contenders().length - 1}명`;
      return;
    }
    if (t.board.length === 0) {
      const ch = C.chen(h.hole);
      const stars = '★'.repeat(Math.max(1, Math.min(5, Math.round(ch / 3)))) + '☆'.repeat(5 - Math.max(1, Math.min(5, Math.round(ch / 3))));
      html = `<b>${C.handCode(h.hole)}</b> · 핸드 강도 <span style="color:#ffd166">${stars}</span>`;
    } else {
      const sc = C.evaluate(h.hole.concat(t.board));
      html = `현재 패: <b>${C.handName(sc)}</b>`;
    }
    if (save.helper) {
      const opp = t.contenders().length - 1;
      if (opp > 0) {
        const eq = C.equity(h.hole, t.board, opp, 700);
        html += `<br>승률(추정) <span class="eqv">${(eq * 100).toFixed(0)}%</span> vs ${opp}명`;
      }
    }
    el.innerHTML = html;
  }

  /** 공개된 패끼리의 실제 승률 (올인 쇼다운 중계용) */
  function knownEquity(players, board, iters) {
    const used = new Set(board);
    players.forEach((p) => p.hole.forEach((c) => used.add(c)));
    const rest = []; for (let i = 0; i < 52; i++) if (!used.has(i)) rest.push(i);
    const wins = players.map(() => 0);
    const need = 5 - board.length;
    if (need === 0) iters = 1;
    for (let it = 0; it < iters; it++) {
      const d = rest.slice(), bd = board.slice();
      for (let k = 0; k < need; k++) { const j = Math.floor(Math.random() * (d.length - k)) + k; const tmp = d[k]; d[k] = d[j]; d[j] = tmp; bd.push(d[k]); }
      const sc = players.map((p) => C.evaluate(p.hole.concat(bd)));
      const best = Math.max(...sc);
      const ws = sc.filter((s) => s === best).length;
      sc.forEach((s, i) => { if (s === best) wins[i] += 1 / ws; });
    }
    return wins.map((w) => w / iters);
  }
  function showEquity() {
    const t = S.table;
    const cont = t.contenders();
    const eq = knownEquity(cont, t.board, 1500);
    cont.forEach((p, k) => {
      const e = S.seats[t.players.indexOf(p)].querySelector('.eq');
      e.textContent = Math.round(eq[k] * 100) + '%';
      e.classList.add('show');
    });
  }

  /* ============================================================
   * 액션 바 (사람)
   * ============================================================ */
  function humanTurn(ctx, sess) {
    if (S.autoPlay) { // 관전 모드: 내 자리도 중수 AI가 플레이
      return aiTurn(Object.assign({}, S.human, { level: 'reg', style: null }), ctx, sess);
    }
    return new Promise((resolve, reject) => {
      if (sess !== S.session) return reject(new AbortErr());
      S.pending = { resolve, reject, ctx, sess };
      setActive(0);
      A.sfx('turn');
      updateMyHand();
      const bar = $('#actionBar');
      bar.classList.remove('wait');
      $('#bFold').disabled = ctx.canCheck;
      $('#bCall').innerHTML = ctx.canCheck ? '체크<small>C</small>'
        : (ctx.toCall >= ctx.stack ? `콜 올인<small>${fmt(ctx.toCall)}</small>` : `콜<small>${fmt(ctx.toCall)}</small>`);
      const sl = $('#raiseSlider');
      const rb = $('#bRaise');
      const presets = $('#presets');
      presets.innerHTML = '';
      if (ctx.canRaise) {
        rb.disabled = false;
        sl.disabled = false;
        sl.min = ctx.minRaiseTo; sl.max = ctx.maxRaiseTo;
        sl.step = Math.max(1, ctx.sb >= 50 ? 25 : 5);
        sl.value = ctx.minRaiseTo;
        const opts = [];
        const potTo = (f) => (ctx.currentBet === 0 ? ctx.pot * f : ctx.currentBet + f * (ctx.pot + ctx.toCall));
        if (ctx.street === 'preflop' && ctx.raisesThisStreet === 0) {
          opts.push(['2.5BB', ctx.bb * 2.5], ['3BB', ctx.bb * 3], ['4BB', ctx.bb * 4]);
        } else if (ctx.street === 'preflop') {
          opts.push(['3배', ctx.currentBet * 3], ['½팟', potTo(0.5)], ['팟', potTo(1)]);
        } else {
          opts.push(['⅓팟', potTo(1 / 3)], ['½팟', potTo(0.5)], ['¾팟', potTo(0.75)], ['팟', potTo(1)]);
        }
        opts.push(['올인', ctx.maxRaiseTo]);
        opts.forEach(([label, v]) => {
          const b = document.createElement('button');
          b.textContent = label;
          b.onclick = () => { setRaise(v); A.sfx('click'); };
          presets.appendChild(b);
        });
        setRaise(ctx.minRaiseTo);
      } else {
        rb.disabled = true; sl.disabled = true;
        $('#raiseAmt').textContent = '-';
      }
    });
  }
  function setRaise(v) {
    const h = S.pending; if (!h) return;
    const c = h.ctx;
    v = Math.round(Math.max(c.minRaiseTo, Math.min(c.maxRaiseTo, v)));
    S.raiseVal = v;
    $('#raiseSlider').value = v;
    const allin = v >= c.maxRaiseTo;
    $('#bRaise').firstChild.textContent = allin ? '올인' : (c.currentBet === 0 ? '벳' : '레이즈');
    $('#raiseAmt').textContent = fmt(allin ? c.maxRaiseTo : v);
  }
  function submit(type) {
    const h = S.pending; if (!h) return;
    const c = h.ctx;
    if (type === 'fold' && c.canCheck) return;
    if (type === 'raise' && !c.canRaise) return;
    S.pending = null;
    $('#actionBar').classList.add('wait');
    setActive(-1);
    A.sfx('click');
    let action = { type };
    if (type === 'call') action = { type: c.canCheck ? 'check' : 'call' };
    if (type === 'raise') {
      let v = S.raiseVal || c.minRaiseTo;
      if (v >= c.maxRaiseTo) v = c.maxRaiseTo;
      action = { type: 'raise', amount: v };
    }
    h.resolve(action);
  }
  function bindActions() {
    $('#bFold').onclick = () => submit('fold');
    $('#bCall').onclick = () => submit('call');
    $('#bRaise').onclick = () => submit('raise');
    $('#raiseSlider').oninput = (e) => {
      const sl = e.target, v = +sl.value;
      setRaise(v + +sl.step > +sl.max ? +sl.max : v); // 마지막 칸 = 올인
    };
    addEventListener('keydown', (e) => {
      if (!S.pending || e.target.tagName === 'INPUT' && e.target.type === 'text') return;
      const k = e.key.toLowerCase();
      if (k === 'f') submit('fold');
      else if (k === 'c' || k === ' ') { e.preventDefault(); submit('call'); }
      else if (k === 'r') submit('raise');
      else if (k === 'arrowup' || k === 'arrowdown') {
        e.preventDefault();
        const step = S.pending.ctx.bb;
        setRaise((S.raiseVal || 0) + (k === 'arrowup' ? step : -step));
      }
    });
    $('#tBgm').onclick = () => setBgm(!save.bgm);
    $('#tSfx').onclick = () => setSfx(!save.sfx);
    $('#tVoice').onclick = () => setVoice(!save.voice);
    $('#tLog').onclick = () => $('#log').classList.toggle('show');
    $('#tRules').onclick = showRules;
    $('#tQuit').onclick = () => confirmModal('로비로 나가기', '진행 중인 토너먼트는 기록되지 않습니다.', quitToLobby);
    addEventListener('resize', layoutTable);
  }

  /* ============================================================
   * AI 차례
   * ============================================================ */
  async function aiTurn(p, ctx, sess) {
    const i = S.table.players.findIndex((q) => q.id === p.id);
    setActive(i);
    S.seats[i].classList.add('thinking');
    const t0 = performance.now();
    const decision = await window.AI.decide(p, ctx);
    const [a, b] = window.AI.thinkTime(p.level);
    const spent = performance.now() - t0;
    await wait(Math.max(150, a + Math.random() * (b - a) - spent), sess);
    S.seats[i].classList.remove('thinking');
    return decision;
  }

  /* ============================================================
   * 엔진 이벤트 → 연출
   * ============================================================ */
  const ACTION_KO = { fold: '폴드', check: '체크', call: '콜', bet: '벳', raise: '레이즈', allin: '올인!' };
  const STREET_KO = { flop: '플랍', turn: '턴', river: '리버' };
  const PREMIUM = { AA: ['POCKET ROCKETS', '포켓 에이스! 포켓 로켓!'], KK: ['COWBOYS', '포켓 킹! 카우보이!'], QQ: ['LADIES', '포켓 퀸! 레이디스!'], JJ: ['HOOKS', '포켓 잭!'], AKs: ['BIG SLICK', '빅 슬릭! 에이스 킹 수딧!'], AKo: ['BIG SLICK', '빅 슬릭!'] };
  const HIGH_HAND_BONUS = { 4: 30, 5: 50, 6: 100, 7: 500, 8: 2000, 9: 10000 };

  function addVip(n, reason) {
    if (S.autoPlay) return; // 관전 모드는 기록하지 않음
    save.vip += n; persist();
    addLog(`★ VIP +${fmt(n)} (${reason})`, 'h');
  }

  async function onEvent(type, d, sess) {
    if (sess !== S.session) throw new AbortErr();
    const t = S.table;
    switch (type) {
      case 'levelUp': {
        updateHud();
        const L = d.level;
        FX.banner('BLIND UP', `레벨 ${d.levelNo} · ${fmt(L.sb)}/${fmt(L.bb)}${L.ante ? ' · BB앤티 ' + fmt(L.ante) : ''}`, 'info', 1800);
        A.sfx('level');
        V.say(`블라인드가 ${fmt(L.sb)}, ${fmt(L.bb)}로 오릅니다`, 'dealer');
        addLog(`— 레벨 ${d.levelNo}: ${L.sb}/${L.bb} 앤티 ${L.ante}`, 'h');
        await wait(1500, sess);
        break;
      }
      case 'handStart': {
        if (A.trackName !== S.stage.bgm && A.trackName !== null) A.play(S.stage.bgm);
        S.prevCat = -1;
        $('#board').querySelectorAll('.card').forEach((c) => c.remove());
        $('#board').innerHTML = '';
        for (let k = 0; k < 5; k++) { const s = document.createElement('div'); s.className = 'slot'; $('#board').appendChild(s); }
        t.players.forEach((p, i) => {
          const el = S.seats[i];
          el.querySelector('.cards').innerHTML = '';
          el.querySelector('.hand-label').classList.remove('show');
          el.querySelector('.eq').classList.remove('show');
          el.classList.remove('winner', 'active', 'thinking');
          let tag = '';
          if (!p.out) {
            if (i === d.sb && i === d.button) tag = 'SB';
            else if (i === d.sb) tag = 'SB';
            else if (i === d.bb) tag = 'BB';
          }
          el.querySelector('.pos-tag').textContent = tag;
          if (!p.out) setMood(p, 'calm');
          renderSeat(i);
        });
        // 딜러 버튼 위치
        S.buttonIdx = d.button;
        positionSeats();
        tableMsg('');
        updateHud();
        addLog(`핸드 #${d.handNo} — 블라인드 ${d.level.sb}/${d.level.bb}`, 'h');
        renderBets();
        updateMyHand();
        await wait(350, sess);
        break;
      }
      case 'blinds': {
        renderBets(); renderAll();
        A.sfx('chip');
        addLog(`${pName(d.sb)} SB ${d.sb.bet} / ${pName(d.bb)} BB ${d.bb.bet}${d.ante ? ' + 앤티 ' + d.ante : ''}`);
        await wait(300, sess);
        break;
      }
      case 'deal': {
        const order = [];
        let i = d.order;
        const alive = t.alive();
        for (let k = 0; k < alive.length; k++) { order.push(i); i = t.nextIdx(i, (p) => !p.out); }
        for (let r = 0; r < 2; r++) {
          for (const idx of order) {
            const p = t.players[idx];
            const box = S.seats[idx].querySelector('.cards');
            const el = cardEl(p.isHuman ? p.hole[r] : null, false);
            const v = dealVector(box);
            el.style.setProperty('--dx', v.dx + 'px'); el.style.setProperty('--dy', v.dy + 'px');
            el.classList.add('deal');
            box.appendChild(el);
            if (p.isHuman) setTimeout(() => el.classList.add('up'), 380);
            A.sfx('deal');
            await wait(85, sess);
          }
        }
        await wait(350, sess);
        const h = S.human;
        if (!h.out) {
          addLog(`내 카드: ${h.hole.map(C.cardStr).join(' ')}`);
          const code = C.handCode(h.hole);
          if (PREMIUM[code]) {
            FX.banner(PREMIUM[code][0], PREMIUM[code][1], 'good', 1500);
            A.sfx('good');
            V.say(PREMIUM[code][1], 'dealer');
          }
        }
        updateMyHand();
        break;
      }
      case 'action': {
        const p = d.player, i = t.players.indexOf(p);
        let text = ACTION_KO[d.type];
        if (d.type === 'call') text += ' ' + fmt(d.amount);
        if (d.type === 'bet' || d.type === 'raise') text += ' ' + fmt(d.to);
        bubble(i, text, d.type);
        renderSeat(i); renderBets();
        addLog(`${pName(p)}: ${text}${d.type === 'allin' ? ' (' + fmt(d.to) + ')' : ''}`);
        // 사운드 & 음성
        const voiceWho = p.isHuman ? { gender: save.gender, id: 'me' } : p;
        if (d.type === 'fold') {
          A.sfx('fold');
          const box = S.seats[i].querySelector('.cards');
          const v = dealVector(box);
          box.querySelectorAll('.card').forEach((c) => { c.style.setProperty('--dx', v.dx + 'px'); c.style.setProperty('--dy', v.dy + 'px'); c.classList.remove('deal'); c.classList.add('muck'); });
          setTimeout(() => { if (!p.isHuman) box.innerHTML = ''; else box.querySelectorAll('.card').forEach((c) => { c.classList.remove('muck'); c.classList.add('dim'); }); }, 460);
          V.say('폴드', voiceWho);
        } else if (d.type === 'check') {
          A.sfx('check'); V.say('체크', voiceWho);
        } else if (d.type === 'call') {
          A.sfx('chip'); V.say('콜', voiceWho);
        } else if (d.type === 'allin') {
          A.sfx('allin'); FX.shake();
          const line = !p.isHuman && p.lines && Math.random() < 0.6 ? p.lines.allin[0] : '올인!';
          if (line !== '올인!') setTimeout(() => bubble(i, line, 'chat', 2200), 900);
          V.say(line, voiceWho, { priority: true });
        } else {
          A.sfx('chips'); V.say(`${ACTION_KO[d.type]}, ${d.to}`, voiceWho);
        }
        if (p.isHuman) updateMyHand();
        await wait(d.type === 'allin' ? 700 : 300, sess);
        break;
      }
      case 'allinReveal': {
        await collectBets(sess);
        renderBets();
        d.players.forEach((p) => revealSeat(p, sess));
        A.play('tension');
        FX.banner('ALL-IN!', '쇼다운 — 카드를 공개합니다', 'great', 1500);
        V.say('올인 쇼다운!', 'dealer', { priority: true });
        await wait(700, sess);
        showEquity();
        await wait(1200, sess);
        break;
      }
      case 'street': {
        await collectBets(sess);
        renderBets();
        const board = $('#board');
        if (d.runout) A.sfx('heartbeat');
        for (let k = 0; k < d.cards.length; k++) {
          const el = cardEl(d.cards[k], false);
          const slot = board.querySelector('.slot');
          if (slot) board.replaceChild(el, slot); else board.appendChild(el);
          A.sfx('flip');
          await wait(d.runout && d.name === 'river' ? 650 : 140, sess);
          el.classList.add('up');
        }
        V.say(STREET_KO[d.name], 'dealer');
        addLog(`[${STREET_KO[d.name]}] ${d.board.map(C.cardStr).join(' ')}`, 'h');
        if (d.runout) { showEquity(); await wait(1300, sess); }
        // 내 패 완성 이벤트
        const h = S.human;
        if (h.hole.length && !h.folded && !h.out) {
          const sc = C.evaluate(h.hole.concat(d.board));
          const cat = C.category(sc);
          const boardOnly = d.board.length === 5 ? C.category(C.evaluate(d.board)) : -1;
          if (cat >= 4 && cat > S.prevCat && cat > boardOnly) {
            const tier = cat >= 8 ? 'jackpot' : cat >= 6 ? 'great' : 'good';
            const mi = madeInfo(h.hole, d.board, t.contenders().length - 1);
            const extra = mi ? ` · ${mi.grade} · 승률 ${Math.round(mi.eq * 100)}%` : '';
            FX.banner(C.handNameEn(sc), `${C.handName(sc)} 메이드!${extra}`, tier, 2400);
            A.sfx(cat >= 8 ? 'jackpot' : 'good');
            if (cat >= 6) FX.fireworks(3, 250); else FX.confetti(60);
            V.say(`${C.handName(sc)} 완성!`, 'dealer');
          }
          S.prevCat = Math.max(S.prevCat, cat);
        }
        updateMyHand();
        await wait(450, sess);
        break;
      }
      case 'refund': {
        renderAll(); renderBets();
        if (d.amount > 0) addLog(`${pName(d.player)}에게 콜되지 않은 ${fmt(d.amount)} 반환`);
        break;
      }
      case 'showdown': {
        await collectBets(sess);
        renderBets();
        V.say('쇼다운', 'dealer');
        for (const p of d.players) {
          const i = t.players.indexOf(p);
          if (!p.isHuman && !S.seats[i].querySelector('.card.up')) revealSeat(p, sess);
          const lab = S.seats[i].querySelector('.hand-label');
          lab.textContent = C.handName(p.score);
          lab.classList.add('show');
          addLog(`${pName(p)}: ${p.hole.map(C.cardStr).join(' ')} — ${C.handName(p.score)}`);
        }
        await wait(1300, sess);
        break;
      }
      case 'win': await onWin(d, sess); break;
      case 'bust': {
        for (const p of d.players) {
          const i = t.players.indexOf(p);
          renderSeat(i);
          if (p.isHuman) {
            FX.banner('BUSTED', `${p.place}위로 탈락했습니다`, 'bad', 2600);
            A.sfx('lose');
          } else {
            const byMe = S.lastResults && S.lastResults.some((r) => r.winners.includes(S.human));
            FX.banner('KNOCKOUT!', `${p.name} 탈락${byMe ? ' — 녹아웃 보너스 +100' : ''}`, byMe ? 'great' : 'info', 1800);
            A.sfx('knockout'); FX.flash('#ff2d95');
            if (byMe) addVip(100, `${p.name} 녹아웃`);
            setMood(p, 'sad');
            if (p.lines) bubble(i, p.lines.lose[1] || p.lines.lose[0], 'chat', 2400);
            V.say(`${p.name}, 탈락`, 'dealer');
          }
          addLog(`✖ ${pName(p)} 탈락 (${p.place}위)`, 'h');
          await wait(1500, sess);
        }
        updateHud();
        break;
      }
      default: break;
    }
  }

  async function onWin(d, sess) {
    const t = S.table, h = S.human;
    S.lastResults = d.results;
    renderAll(); renderBets();
    $('#pot').classList.remove('show');
    const humanWon = d.results.some((r) => r.winners.includes(h));
    const main = d.results[0];
    let topCat = -1, topScore = 0;
    let delay = 1700;

    // 승자 하이라이트 & 코인
    const winners = new Set();
    d.results.forEach((r) => r.winners.forEach((w) => winners.add(w)));
    winners.forEach((w) => {
      const i = t.players.indexOf(w);
      S.seats[i].classList.add('winner');
      setMood(w, 'happy');
      const c = seatCenter(i);
      if (w.isHuman || d.totalPot >= t.level.bb * 10) FX.coins(w.isHuman ? 40 : 10, c.x, c.y);
    });
    A.sfx(humanWon ? 'win' : 'chips');

    if (d.showdown) {
      d.results.forEach((r) => { if (r.hand > topScore) { topScore = r.hand; } });
      topCat = C.category(topScore);
      // 승리 5장 하이라이트
      const best = d.results[0].best5 || [];
      document.querySelectorAll('#board .card, #seats .card').forEach((c) => {
        const id = c.dataset.card != null ? +c.dataset.card : -1;
        const inBest = best.includes(id);
        c.classList.toggle('win', inBest);
      });
      // 패배자 표정
      t.contenders().forEach((p) => { if (!winners.has(p)) setMood(p, 'sad'); });
    }

    // 결과 메시지
    const descr = d.results.map((r) => {
      const names = r.winners.map(pName).join(', ');
      return r.hand != null ? `${names} — ${C.handName(r.hand)} (+${fmt(r.amount)})` : `${names} (+${fmt(r.amount)})`;
    });
    descr.forEach((x) => addLog('🏆 ' + x));
    tableMsg(descr[0]);
    const mw = main.winners[0];
    const who = mw.isHuman ? playerName() + '님' : mw.name;
    if (d.showdown) V.say(`${who}, ${C.handName(main.hand)}로 승리`, 'dealer');
    else if (mw.isHuman) V.say(`${who}, 팟을 가져갑니다`, 'dealer');

    // 하이핸드 이벤트
    if (d.showdown && topCat >= 4) {
      const name = C.handNameEn(topScore), ko = C.handName(topScore);
      const winnerNames = d.results.filter((r) => r.hand === topScore).flatMap((r) => r.winners.map(pName));
      const sub = `${[...new Set(winnerNames)].join(', ')} — ${ko}!`;
      if (topCat >= 8) {
        FX.slot(topCat === 9 ? 'ROYAL FLUSH' : 'STRAIGHT FLUSH');
        FX.coinRain(160); FX.fireworks(10, 300); FX.flash('#ffd166');
        A.sfx('jackpot');
        setTimeout(() => FX.banner('JACKPOT!', sub, 'jackpot', 3000), 1800);
        V.say(topCat === 9 ? '로열 플러시! 잭팟입니다!' : '스트레이트 플러시! 잭팟!', 'dealer', { priority: true });
        delay = 4800;
      } else if (topCat >= 6) {
        FX.banner(name, sub, 'great', 2400);
        FX.fireworks(5, 280); FX.coins(50);
        A.sfx('fanfare');
        delay = 2900;
      } else {
        FX.banner(name, sub, 'good', 2000);
        FX.confetti(90);
        A.sfx('good');
        delay = 2400;
      }
      if (humanWon && winnerNames.includes(playerName()) && HIGH_HAND_BONUS[topCat]) {
        addVip(HIGH_HAND_BONUS[topCat], `하이핸드 ${ko}`);
      }
    } else if (humanWon && d.totalPot >= S.totalChips * 0.3) {
      FX.banner('BIG POT!', `${fmt(d.totalPot)} 칩 획득`, 'great', 2000);
      FX.coinRain(70); A.sfx('fanfare');
      addVip(50, '빅팟');
      delay = 2600;
    }

    // 배드빗 보너스
    if (d.showdown && !humanWon && h.score && !h.folded && t.contenders().includes(h)) {
      const myCat = C.category(h.score);
      if (myCat >= 6) {
        const bonus = myCat >= 7 ? 3000 : 1000;
        setTimeout(() => {
          FX.banner('BAD BEAT', `배드빗 보너스 +${fmt(bonus)} VIP`, 'bad', 2400);
          A.sfx('jackpot'); FX.coinRain(80);
          V.say('배드빗 보너스!', 'dealer');
        }, 1600);
        addVip(bonus, '배드빗');
        delay = Math.max(delay, 4000);
      }
    }

    // AI 대사
    winners.forEach((w) => {
      if (!w.isHuman && w.lines && Math.random() < 0.55) {
        const line = w.lines.win[Math.floor(Math.random() * w.lines.win.length)];
        setTimeout(() => { if (sess === S.session) { bubble(t.players.indexOf(w), line, 'chat', 2400); V.say(line, w); } }, 900);
      }
    });
    if (d.showdown && humanWon) {
      t.contenders().forEach((p) => {
        if (!winners.has(p) && p.lines && Math.random() < 0.4) {
          const line = p.lines.lose[Math.floor(Math.random() * p.lines.lose.length)];
          setTimeout(() => { if (sess === S.session) { bubble(t.players.indexOf(p), line, 'chat', 2400); V.say(line, p); } }, 1700);
        }
      });
    }
    if (A.trackName === 'tension') setTimeout(() => { if (sess === S.session) A.play(S.stage.bgm); }, 1500);
    $('#vipPts').textContent = fmt(save.vip);
    updateMyHand();
    await wait(delay, sess);
  }

  /* ============================================================
   * 스테이지 진행
   * ============================================================ */
  async function startStage(id) {
    A.init();
    closeModal();
    const st = R.STAGES[id - 1];
    S.stage = st;
    const sess = ++S.session;
    const n = save.tableSize === 9 ? 9 : 6;
    const opps = pickOpponents(id, n - 1);
    const human = { id: 'me', name: playerName(), gender: save.gender, isHuman: true, stack: st.buyIn, avatar: save.gender === 'F' ? 'player_f' : 'player_m', level: 'human' };
    const players = [human].concat(opps.map((c) => Object.assign({}, c, { isHuman: false, stack: st.buyIn, level: st.level, avatar: c.id })));
    S.table = new window.Engine.PokerTable({
      players,
      handsPerLevel: Math.round(st.blindsEvery * (n === 9 ? 1.3 : 1)),
      hooks: {
        event: (type, d) => onEvent(type, d, sess),
        human: (ctx) => humanTurn(ctx, sess),
        ai: (p, ctx) => aiTurn(p, ctx, sess),
      },
    });
    S.human = S.table.players[0];
    S.totalChips = st.buyIn * n;
    S.lastResults = null;
    document.documentElement.style.setProperty('--felt', st.felt);
    document.documentElement.style.setProperty('--accent', st.accent);
    $('#hudVenue').textContent = st.venue;
    $('#hudGrade').textContent = st.grade;
    $('#log').innerHTML = '';
    showScreen('game');
    buildTable();
    updateHud();
    $('#actionBar').classList.add('wait');
    A.play(st.bgm);
    FX.banner(st.venue, `STAGE ${st.id} · ${st.grade} 테이블 · ${n}인 토너먼트`, 'info', 2600);
    V.say(`${st.venueKo}에 오신 것을 환영합니다. ${st.grade} 테이블, 토너먼트를 시작합니다.`, 'dealer', { priority: true });
    try {
      await wait(2200, sess);
      while (!S.human.out && S.table.alive().length > 1) {
        await S.table.playHand();
        updateHud();
        if (S.human.out || S.table.alive().length <= 1) break;
        await wait(1500, sess);
      }
    } catch (e) {
      if (e && e.name === 'Abort') return;
      console.error(e);
      return;
    }
    if (sess !== S.session) return;
    if (!S.human.out) stageClear(st); else gameOver(st);
  }

  function stageClear(st) {
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
    if (last) {
      FX.slot('CHAMPION'); FX.coinRain(220);
      V.say(`축하합니다! ${playerName()}님, 라스베가스 하이롤러 룸을 정복한 포커 챔피언입니다!`, 'dealer', { priority: true });
    } else {
      V.say(`축하합니다! ${st.venueKo} 우승! 다음 등급 테이블이 열렸습니다.`, 'dealer', { priority: true });
    }
    setTimeout(() => {
      modal(`
        <h2>${last ? 'CHAMPION!' : 'STAGE CLEAR'}</h2>
        <div class="result-big">
          <p>${st.venue} · <b>${st.grade}</b> 테이블 우승 🏆</p>
          <p>${last ? '하수·중수·고수를 모두 꺾고 <b>라스베가스 포커 챔피언</b>이 되었습니다!' : `다음 등급 <b>${R.STAGES[st.id].grade}</b> — ${R.STAGES[st.id].venue} 가 열렸습니다.`}</p>
          <p>클리어 보너스 <span class="pts">+${fmt(bonus)}</span> VIP</p>
          <p>총 VIP 포인트 <span class="pts">${fmt(save.vip)}</span></p>
        </div>`, last
        ? [{ label: '로비로', cls: 'secondary', fn: goLobby }, { label: '다시 플레이', cls: 'primary', fn: () => startStage(st.id) }]
        : [{ label: '로비로', cls: 'secondary', fn: goLobby }, { label: `다음 스테이지 ▶`, cls: 'primary', fn: () => startStage(st.id + 1) }]);
    }, last ? 3500 : 2200);
  }

  function gameOver(st) {
    A.play('gameover');
    V.say('아쉽게도 탈락했습니다. 다시 도전해 보세요.', 'dealer', { priority: true });
    const place = S.human.place || '-';
    setTimeout(() => {
      modal(`
        <h2>GAME OVER</h2>
        <div class="result-big">
          <p>${st.venue} · ${st.grade} 테이블에서 <b>${place}위</b>로 탈락</p>
          <p>플레이한 핸드: ${S.table.handNo}</p>
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
    V.stop();
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
    bindActions();
    renderLobby();
    syncHudToggles();
    window.AI.Backend.check().then((ok) => {
      $('#engineInfo').innerHTML = ok
        ? 'AI 엔진: <b style="color:#06d6a0">Python 백엔드 연결됨</b> (고수 승률 계산)'
        : 'AI 엔진: <b style="color:#4cc9f0">브라우저 내장 JS 엔진</b>';
    });
    // URL 옵션: ?stage=1 (바로 시작), &auto=1 (관전 모드: 내 자리도 AI)
    const q = new URLSearchParams(location.search);
    S.autoPlay = q.get('auto') === '1';
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
      V.say('라스베가스에 오신 것을 환영합니다. 텍사스 홀덤 테이블이 준비되어 있습니다.', 'dealer', { priority: true });
    };
  }
  boot();
})();
