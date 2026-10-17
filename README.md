# 🎰 LAS VEGAS HOLD'EM — 라스베가스 텍사스 홀덤

라스베가스 카지노 분위기의 **노리밋 텍사스 홀덤 토너먼트** 브라우저 게임입니다.
**하수 → 중수 → 고수** 3등급 AI 테이블을 차례로 정복해 라스베가스 포커 챔피언이 되세요.

![stage](https://img.shields.io/badge/stages-3-ffd166) ![js](https://img.shields.io/badge/vanilla-JS-f7df1e) ![python](https://img.shields.io/badge/backend-Python%20(optional)-3776ab)

## ▶ 실행 방법

| 방법 | 설명 |
|---|---|
| **1. 바로 실행** | `index.html` 을 더블클릭 → 브라우저에서 바로 플레이 (설치 불필요, JS 내장 엔진) |
| **2. Python 백엔드** | `start.bat` 더블클릭 또는 `python server.py` → `http://localhost:8765` 자동 오픈. '고수' AI가 Python 몬테카를로 엔진을 사용 |
| **3. 온라인** | GitHub Pages: https://ps64070816-lang.github.io/game/ |

> 첫 화면을 클릭하면 사운드(BGM·효과음)와 한국어 음성이 켜집니다. (브라우저 자동재생 정책)
> 한국어 음성은 Windows/Chrome/Edge의 한국어 TTS 음성을 사용합니다. Edge 에서는 자연스러운 남녀 음성(InJoon/SunHi)이 지원됩니다.

## 🃏 게임 규칙 (현행 토너먼트 룰)

- 노리밋 텍사스 홀덤 **시트앤고(SNG) 토너먼트** — 전원 1,500 칩 시작, 마지막 1인이 우승
- 테이블 인원: **6인(6-Max)** 또는 **9인(풀링, 카지노 표준)** 선택 — 텍사스 홀덤은 2~10인, 라스베가스 카지노 테이블은 보통 9~10인
- 딜러 버튼 / 스몰·빅 블라인드, **헤즈업 규칙**(버튼 = SB, 프리플랍 선행동)
- 레벨 4부터 **빅 블라인드 앤티(BBA)** — 현행 WSOP/TDA 방식
- 최소 레이즈 = 직전 레이즈 폭, **불완전 올인 레이즈는 액션을 재개하지 않음**
- 언콜드 벳 반환, **사이드 팟**, 스플릿 팟, 홀수 칩은 버튼 왼쪽부터 지급
- 블라인드 레벨은 일정 핸드마다 상승

## 🤖 AI 등급

| 등급 | 무대 | 스타일 |
|---|---|---|
| **하수** | FREMONT STREET | 루즈-패시브 "콜링 스테이션". 약한 패로도 자주 콜, 강한 패일 때만 레이즈 |
| **중수** | THE STRIP | 타이트-어그레시브(TAG). Chen 공식 프리플랍, 몬테카를로 승률 + 팟 오즈, 컨티뉴에이션 벳 |
| **고수** | HIGH ROLLER ROOM | 상대 레인지 추정 몬테카를로, 포지션/스택(M) 기반 푸시·폴드, 3벳 블러프·세미블러프·체크레이즈, 사이즈 믹스, **당신의 VPIP/폴드율을 학습해 공략** |

헤드리스 시뮬레이션(6인 × 60 토너먼트, 등급 혼합) 우승률: **고수 68% · 중수 25% · 하수 7%**

## 🔍 무료 포커 엔진 조사 & 선택

| 엔진 | 언어 | 라이선스 | 비고 |
|---|---|---|---|
| [treys](https://github.com/ihendley/treys) | Python | MIT | Deuces 포팅, 5~7장 평가. 순수 Python |
| [PokerKit](https://pokerkit.readthedocs.io/) | Python | MIT | 토론토대 CPRG. 게임 시뮬레이션 + 평가, 가장 다양한 변형 지원 |
| [eval7](https://pypi.org/project/eval7/) | Python(Cython) | MIT | 빠른 평가 + 레인지 파서 + 승률 계산 |
| [pokersolver](https://github.com/goldfire/pokersolver) | JavaScript | MIT | 브라우저/Node 7장 평가, 승자 판정 |

**선택:** "브라우저에서 바로 열림(설치 0)" 요구를 위해 위 라이브러리들의 방식(비트마스크 랭크 평가, 몬테카를로 승률)을 참고하여
의존성 없는 **자체 JS 엔진**(`js/cards.js`, `js/engine.js`, `js/ai.js`)을 구현했고,
동일 알고리즘의 **Python 백엔드**(`server.py`, 표준 라이브러리만 사용)를 선택적으로 붙일 수 있게 했습니다.

## 🎉 이벤트 & 연출

- 포켓 에이스/킹/퀸/잭, 빅 슬릭 — 프리미엄 핸드 알림
- 스트레이트·플러시·풀하우스·포카드 완성 시 네온 배너 + 컨페티/불꽃놀이
- **스트레이트/로열 플러시 = 슬롯머신 JACKPOT** 연출 + 코인 레인
- **배드빗 보너스** (풀하우스 이상으로 졌을 때), **BIG POT**, **KNOCKOUT** 보너스 → VIP 포인트
- 올인 쇼다운: 카드 공개 + 실시간 승률 중계 + 긴장감 BGM
- 블라인드 업, 스테이지 클리어 불꽃놀이, 챔피언 연출

## 🎵 사운드

BGM·효과음은 모두 **Web Audio API로 실시간 합성**(외부 음원 없음 → 저작권 없음).
상황별 BGM: 로비(라운지 재즈) · 하수(보사노바) · 중수(디스코 펑크) · 고수(누아르 재즈) · 올인(긴장감) · 승리(팡파레) · 게임오버.

## 🖼 이미지 / 라이선스

- 아바타: [DiceBear "Open Peeps"](https://www.dicebear.com/styles/open-peeps/) — **CC0 1.0 (퍼블릭 도메인)**, 남녀 혼성 26명 × 표정 3종 (`assets/avatars/`)
- 카드, 테이블, 라스베가스 스카이라인: CSS/SVG 로 직접 그림
- 폰트: Google Fonts (SIL Open Font License)

## ⌨ 조작

`F` 폴드 · `C`/`Space` 체크·콜 · `R` 레이즈 · `↑`/`↓` 레이즈 금액 · 프리셋(2.5BB, ½팟, 팟, 올인…)

URL 옵션: `index.html?stage=2` 바로 시작, `&auto=1` 관전 모드(내 자리도 AI가 플레이, 기록 안 됨)

## 📁 구조

```
index.html          메인 페이지
css/style.css       라스베가스 네온 스타일
js/cards.js         덱, 7카드 족보 평가기, 몬테카를로 승률
js/engine.js        홀덤 토너먼트 규칙 엔진 (블라인드/앤티/사이드팟)
js/ai.js            하수·중수·고수 AI (+ Python 백엔드 연동)
js/characters.js    스테이지 & 캐릭터 (대사 포함)
js/audio.js         합성 BGM & 효과음
js/voice.js         한국어 음성 (Web Speech API)
js/effects.js       파티클·배너·잭팟 연출
js/main.js          화면/진행/이벤트
server.py           선택형 Python 백엔드 (정적 서버 + /api/equity)
assets/avatars/     CC0 아바타
```
