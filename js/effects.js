/* ============================================================
 * effects.js — 파티클(컨페티/코인/불꽃놀이), 네온 배너, 잭팟 연출
 * ============================================================ */
(function (global) {
  'use strict';
  const FX = {
    cv: null, g: null, parts: [], running: false,

    init() {
      this.cv = document.getElementById('fx');
      this.g = this.cv.getContext('2d');
      const rs = () => { this.cv.width = innerWidth * devicePixelRatio; this.cv.height = innerHeight * devicePixelRatio; };
      rs(); addEventListener('resize', rs);
    },
    loop() {
      if (this.running) return;
      this.running = true;
      const tick = () => {
        const g = this.g, W = this.cv.width, H = this.cv.height, dpr = devicePixelRatio;
        g.clearRect(0, 0, W, H);
        this.parts = this.parts.filter((p) => p.life > 0);
        for (const p of this.parts) {
          p.vy += p.grav; p.vx *= p.drag; p.vy *= p.drag;
          p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
          const a = Math.min(1, p.life / 30);
          g.save(); g.globalAlpha = a; g.translate(p.x * dpr, p.y * dpr); g.rotate(p.rot);
          if (p.kind === 'confetti') {
            g.fillStyle = p.color; g.fillRect(-p.size, -p.size / 2, p.size * 2, p.size * Math.abs(Math.cos(p.rot * 2)) + 1);
          } else if (p.kind === 'coin') {
            const w = p.size * dpr * Math.abs(Math.cos(p.rot));
            g.fillStyle = '#f5c518'; g.strokeStyle = '#a67c00'; g.lineWidth = 2;
            g.beginPath(); g.ellipse(0, 0, Math.max(1, w), p.size * dpr, 0, 0, Math.PI * 2); g.fill(); g.stroke();
            if (w > p.size * dpr * 0.5) { g.fillStyle = '#a67c00'; g.font = `bold ${p.size * dpr}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 1); }
          } else if (p.kind === 'spark') {
            g.fillStyle = p.color; g.shadowColor = p.color; g.shadowBlur = 12;
            g.beginPath(); g.arc(0, 0, p.size * dpr, 0, Math.PI * 2); g.fill();
          } else if (p.kind === 'chip') {
            g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, p.size * dpr, 0, Math.PI * 2); g.fill();
            g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr; g.setLineDash([3 * dpr, 3 * dpr]);
            g.beginPath(); g.arc(0, 0, p.size * dpr * 0.75, 0, Math.PI * 2); g.stroke();
          }
          g.restore();
        }
        if (this.parts.length) requestAnimationFrame(tick); else { this.running = false; g.clearRect(0, 0, W, H); }
      };
      requestAnimationFrame(tick);
    },
    add(p) { this.parts.push(Object.assign({ rot: 0, vr: 0, grav: 0.25, drag: 0.99, life: 160, size: 6 }, p)); },

    confetti(n) {
      const colors = ['#ff2d95', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ffffff', '#ff9f1c'];
      for (let i = 0; i < (n || 160); i++) {
        this.add({ kind: 'confetti', x: Math.random() * innerWidth, y: -20 - Math.random() * 200,
          vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2, grav: 0.06, drag: 0.995,
          vr: (Math.random() - 0.5) * 0.3, color: colors[i % colors.length], size: 4 + Math.random() * 4, life: 260 });
      }
      this.loop();
    },
    coins(n, x, y) {
      x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight / 2 : y;
      for (let i = 0; i < (n || 60); i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = 6 + Math.random() * 9;
        this.add({ kind: 'coin', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 0.35, vr: 0.2 + Math.random() * 0.2, size: 7 + Math.random() * 5, life: 150 });
      }
      this.loop();
    },
    coinRain(n) {
      for (let i = 0; i < (n || 120); i++) {
        this.add({ kind: 'coin', x: Math.random() * innerWidth, y: -30 - Math.random() * 600, vx: 0, vy: 2 + Math.random() * 3, grav: 0.12, vr: 0.15 + Math.random() * 0.2, size: 8 + Math.random() * 6, life: 260 });
      }
      this.loop();
    },
    firework(x, y, color) {
      const colors = color ? [color] : ['#ff2d95', '#ffd166', '#4cc9f0', '#06d6a0', '#ffffff'];
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
        this.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 0.06, drag: 0.97, size: 1.5 + Math.random() * 1.5, color: colors[i % colors.length], life: 70 + Math.random() * 40 });
      }
      this.loop();
    },
    fireworks(count, interval) {
      for (let i = 0; i < (count || 6); i++) {
        setTimeout(() => this.firework(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.12 + Math.random() * 0.4)), i * (interval || 350));
      }
    },
    chipBurst(x, y) {
      const colors = ['#e63946', '#1d3557', '#2a9d8f', '#111', '#f4a261'];
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
        this.add({ kind: 'chip', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, grav: 0.3, size: 7, color: colors[i % colors.length], life: 70 });
      }
      this.loop();
    },

    /** 네온 배너. tier: 'info' | 'good' | 'great' | 'jackpot' | 'bad' */
    banner(title, sub, tier, ms) {
      const el = document.getElementById('banner');
      el.className = 'banner show ' + (tier || 'info');
      el.querySelector('.b-title').textContent = title;
      el.querySelector('.b-sub').textContent = sub || '';
      clearTimeout(this._bt);
      this._bt = setTimeout(() => { el.className = 'banner'; }, ms || 2200);
    },
    flash(color) {
      const f = document.getElementById('flash');
      f.style.background = color || '#fff';
      f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    },
    shake() {
      const t = document.getElementById('game');
      t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake');
    },
    /** 슬롯머신 잭팟 연출 */
    slot(text) {
      const el = document.getElementById('slot');
      const reels = el.querySelectorAll('.reel');
      const syms = ['🍒', '🔔', '💎', '7', '♠', '♥', 'BAR', '⭐'];
      el.querySelector('.slot-text').textContent = text || 'JACKPOT';
      el.classList.add('show');
      reels.forEach((r, i) => {
        let n = 0;
        const iv = setInterval(() => {
          r.textContent = syms[Math.floor(Math.random() * syms.length)];
          if (++n > 12 + i * 8) { clearInterval(iv); r.textContent = '7'; r.classList.add('lock'); }
        }, 70);
      });
      setTimeout(() => { el.classList.remove('show'); reels.forEach((r) => r.classList.remove('lock')); }, 4200);
    },
  };
  global.FX = FX;
})(window);
