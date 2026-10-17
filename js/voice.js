/* ============================================================
 * voice.js — 한국어 음성 (Web Speech API, ko-KR)
 *  남/녀 캐릭터별로 다른 한국어 음성·피치를 사용합니다.
 * ============================================================ */
(function (global) {
  'use strict';
  const synth = global.speechSynthesis;
  const MALE = /injoon|hyunsu|bongjin|gookmin|minsu|male|남/i;
  const FEMALE = /sunhi|heami|jimin|seohyeon|soonbok|yujin|google|female|여/i;

  const Voice = {
    on: true, voices: [], male: null, female: null, queue: 0,

    load() {
      if (!synth) return;
      const all = synth.getVoices().filter((v) => /^ko/i.test(v.lang));
      this.voices = all;
      // 자연스러운(Online/Natural) 음성 우선
      const rank = (v) => (/natural|online/i.test(v.name) ? 0 : 1);
      all.sort((a, b) => rank(a) - rank(b));
      this.male = all.find((v) => MALE.test(v.name)) || null;
      this.female = all.find((v) => FEMALE.test(v.name)) || all[0] || null;
      if (!this.male) this.male = this.female;
    },
    init() {
      if (!synth) return;
      this.load();
      if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => this.load();
    },
    /**
     * @param text 한국어 문장
     * @param who {gender:'M'|'F', pitch?} 또는 'dealer'
     * @param opt {priority:boolean}
     */
    say(text, who, opt) {
      if (!this.on || !synth || !text) return;
      opt = opt || {};
      if (opt.priority) synth.cancel();
      else if (synth.pending && this.queue > 2) return; // 밀린 대사는 건너뜀
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      let gender = 'F', pitch = 1.1, rate = 1.08;
      if (who === 'dealer') { gender = 'F'; pitch = 1.0; rate = 1.0; }
      else if (who) {
        gender = who.gender;
        const h = hash(who.id || who.name || '');
        pitch = gender === 'M' ? 0.7 + (h % 25) / 100 : 1.15 + (h % 30) / 100;
        rate = 1.0 + (h % 15) / 100;
      }
      const v = gender === 'M' ? this.male : this.female;
      if (v) u.voice = v;
      // 남성 음성이 따로 없으면 피치를 더 낮춰 구분
      if (gender === 'M' && this.male === this.female) pitch = Math.min(pitch, 0.65);
      u.pitch = pitch; u.rate = rate; u.volume = 1;
      this.queue++;
      u.onend = u.onerror = () => { this.queue = Math.max(0, this.queue - 1); };
      synth.speak(u);
    },
    stop() { if (synth) synth.cancel(); this.queue = 0; },
  };
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  global.Voice = Voice;
})(window);
