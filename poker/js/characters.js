/* ============================================================
 * characters.js — 스테이지(등급)와 상대 캐릭터 (남녀 혼성)
 * 아바타: DiceBear "Open Peeps" (CC0 1.0, 퍼블릭 도메인)
 * ============================================================ */
(function (global) {
  'use strict';

  const STAGES = [
    {
      id: 1, level: 'fish', grade: '하수', gradeEn: 'ROOKIE',
      venue: 'FREMONT STREET', venueKo: '프리몬트 스트리트',
      desc: '올드 라스베가스 다운타운의 네온 아케이드. 관광객과 초보자들이 모이는 저스테이크 테이블.',
      bgm: 'fremont', buyIn: 1500, felt: '#0f6b3a', accent: '#ffd166',
      blindsEvery: 10,
    },
    {
      id: 2, level: 'reg', grade: '중수', gradeEn: 'REGULAR',
      venue: 'THE STRIP', venueKo: '더 스트립',
      desc: '스트립 한복판 메이저 카지노의 포커룸. 타이트하고 공격적인 레귤러들이 기다린다.',
      bgm: 'strip', buyIn: 1500, felt: '#14406e', accent: '#4cc9f0',
      blindsEvery: 10,
    },
    {
      id: 3, level: 'pro', grade: '고수', gradeEn: 'HIGH ROLLER',
      venue: 'HIGH ROLLER ROOM', venueKo: '하이롤러 룸',
      desc: '펜트하우스 VIP 룸. 몬테카를로 엔진으로 계산하고 당신의 습관을 읽는 프로들과의 최종 승부.',
      bgm: 'highroller', buyIn: 1500, felt: '#5a0f1f', accent: '#d4af37',
      blindsEvery: 9,
    },
  ];

  // style: 플레이 성향 미세 조정 (looseness, aggression, bluff 0..1)
  const CHARACTERS = {
    1: [
      { id: 'minsu', name: '김민수', gender: 'M', title: '첫 라스베가스 여행객', style: { loose: 0.75, aggr: 0.2, bluff: 0.05 },
        lines: { win: ['우와, 이게 되네요!', '초심자의 행운이죠!'], lose: ['아... 이럴 수가', '포커 어렵네요'], allin: ['에라 모르겠다, 올인!'] } },
      { id: 'jenny', name: 'Jenny', gender: 'F', title: '휴가 나온 간호사', style: { loose: 0.7, aggr: 0.3, bluff: 0.1 },
        lines: { win: ['Yay! 제 칩이에요!', '오늘 운이 좋네요~'], lose: ['흥, 다음엔 안 져요', '어머, 아까워라'], allin: ['올인! 두근두근!'] } },
      { id: 'jieun', name: '박지은', gender: 'F', title: '유튜브로 포커 배운 대학생', style: { loose: 0.6, aggr: 0.35, bluff: 0.08 },
        lines: { win: ['영상에서 본 대로 했어요!', '앗싸!'], lose: ['영상이랑 다르잖아요...', '흑흑'], allin: ['인생은 한 방! 올인!'] } },
      { id: 'bob', name: 'Bob', gender: 'M', title: '텍사스에서 온 목장주', style: { loose: 0.8, aggr: 0.25, bluff: 0.06 },
        lines: { win: ['Yeehaw! 내 칩이다!', '하하, 고마워요 친구'], lose: ['소 한 마리 날아갔네', '이런 젠장'], allin: ['카우보이는 물러서지 않지! 올인!'] } },
      { id: 'sujin', name: '이수진', gender: 'F', title: '신혼여행 중인 회계사', style: { loose: 0.55, aggr: 0.15, bluff: 0.03 },
        lines: { win: ['계산대로네요', '남편한테 자랑해야지'], lose: ['확률이 안 맞잖아요', '음... 손해네요'], allin: ['딱 한 번만 올인할게요'] } },
      { id: 'tony', name: 'Tony', gender: 'M', title: '수다쟁이 택시기사', style: { loose: 0.85, aggr: 0.3, bluff: 0.12 },
        lines: { win: ['봤지? 내가 뭐랬어!', '오늘 택시비 벌었다!'], lose: ['이건 사기야, 사기!', '딜러 바꿔요!'], allin: ['올인이다 이 친구야!'] } },
      { id: 'hana', name: '최하나', gender: 'F', title: '슬롯머신 마니아', style: { loose: 0.8, aggr: 0.2, bluff: 0.07 },
        lines: { win: ['잭팟 느낌!', '꺄~ 이겼다!'], lose: ['슬롯이나 할걸...', '에잇'], allin: ['잭팟을 향해! 올인!'] } },
      { id: 'mike', name: 'Mike', gender: 'M', title: '총각파티 중인 신랑', style: { loose: 0.75, aggr: 0.35, bluff: 0.1 },
        lines: { win: ['총각파티 자금 확보!', 'Let’s go!'], lose: ['신부한테 혼나겠다', 'Oh no...'], allin: ['What happens in Vegas! 올인!'] } },
    ],
    2: [
      { id: 'taeho', name: '강태호', gender: 'M', title: '주말 토너먼트 레귤러', style: { loose: 0.4, aggr: 0.6, bluff: 0.15 },
        lines: { win: ['교과서대로죠', '좋은 콜 감사합니다'], lose: ['배드빗이네요', '흠, 쿨러군요'], allin: ['밸류 올인입니다'] } },
      { id: 'sophia', name: 'Sophia', gender: 'F', title: '라스베가스 현지 딜러 출신', style: { loose: 0.45, aggr: 0.55, bluff: 0.18 },
        lines: { win: ['이 테이블은 제 홈이에요', 'Thank you, darling'], lose: ['Nice hand', '운이 좋으셨네요'], allin: ['All in, honey'] } },
      { id: 'seoa', name: '윤서아', gender: 'F', title: '데이터 분석가', style: { loose: 0.35, aggr: 0.5, bluff: 0.12 },
        lines: { win: ['기댓값대로입니다', 'EV 플러스'], lose: ['분산의 영역이네요', '표본이 부족했어요'], allin: ['수학적으로 올인이 맞아요'] } },
      { id: 'marco', name: 'Marco', gender: 'M', title: '이탈리아 레스토랑 사장', style: { loose: 0.5, aggr: 0.65, bluff: 0.2 },
        lines: { win: ['Mamma mia! 맛있다!', 'Bellissimo!'], lose: ['Mamma mia...', '오늘 요리는 실패군'], allin: ['Tutto! 올인!'] } },
      { id: 'serin', name: '오세린', gender: 'F', title: '온라인 포커 그라인더', style: { loose: 0.42, aggr: 0.7, bluff: 0.2 },
        lines: { win: ['GG', '너무 쉬운데요?'], lose: ['리버 실화?', '틸트 오네...'], allin: ['쉽게 안 접어요. 올인'] } },
      { id: 'daniel', name: 'Daniel', gender: 'M', title: '전직 NFL 선수', style: { loose: 0.45, aggr: 0.6, bluff: 0.15 },
        lines: { win: ['터치다운!', '팀플레이 승리죠'], lose: ['태클 당했네', '다음 쿼터에 보자'], allin: ['풀 블리츠! 올인!'] } },
      { id: 'chaewon', name: '임채원', gender: 'F', title: '프로 지망 바둑기사', style: { loose: 0.3, aggr: 0.5, bluff: 0.1 },
        lines: { win: ['수읽기 성공', '한 수 배웠습니다'], lose: ['패착이었네요', '복기해야겠어요'], allin: ['승부수입니다'] } },
      { id: 'carlos', name: 'Carlos', gender: 'M', title: '멕시코시티 사업가', style: { loose: 0.5, aggr: 0.6, bluff: 0.18 },
        lines: { win: ['¡Olé!', '사업도 포커도 타이밍'], lose: ['¡Ay, caramba!', '손절합니다'], allin: ['¡Vamos! 올인!'] } },
    ],
    3: [
      { id: 'yuna', name: '서윤아', gender: 'F', title: '"포커 퀸" 브레이슬릿 2회 우승', style: { loose: 0.4, aggr: 0.75, bluff: 0.25 },
        lines: { win: ['퀸에게 도전하셨나요?', '예상대로예요'], lose: ['오, 제법인데요', '흥미롭네요'], allin: ['당신 레인지는 다 읽혔어요. 올인'] } },
      { id: 'victor', name: 'Victor', gender: 'M', title: '"더 샤크" 하이스테이크 캐시 전설', style: { loose: 0.38, aggr: 0.8, bluff: 0.25 },
        lines: { win: ['상어 앞에서 피를 흘리면 안 되지', 'Too easy'], lose: ['...인정하지', 'Well played'], allin: ['Shark attack. 올인'] } },
      { id: 'dohyun', name: '백도현', gender: 'M', title: 'GTO 솔버 연구자', style: { loose: 0.36, aggr: 0.7, bluff: 0.22 },
        lines: { win: ['솔버가 승인한 라인입니다', '균형 잡힌 전략이죠'], lose: ['혼합 전략의 대가군요', '편차 허용 범위입니다'], allin: ['인디퍼런스 포인트, 올인'] } },
      { id: 'natalia', name: 'Natalia', gender: 'F', title: '모스크바 체스 그랜드마스터', style: { loose: 0.35, aggr: 0.7, bluff: 0.2 },
        lines: { win: ['Checkmate', '세 수 앞을 봤죠'], lose: ['흥미로운 오프닝이군요', 'Hmm...'], allin: ['Za zdorovie, 올인'] } },
      { id: 'seorin', name: '문서린', gender: 'F', title: '"얼음여왕" 무표정 블러퍼', style: { loose: 0.42, aggr: 0.75, bluff: 0.3 },
        lines: { win: ['...', '표정 관리 하세요'], lose: ['...좋은 패네요', '다음 판'], allin: ['올인.'] } },
      { id: 'hiro', name: 'Hiro', gender: 'M', title: '도쿄 하이롤러 투자자', style: { loose: 0.4, aggr: 0.72, bluff: 0.22 },
        lines: { win: ['계획대로', '스미마셍, 제 팟이네요'], lose: ['오모시로이...', '좋은 승부였소'], allin: ['전부 걸겠습니다'] } },
      { id: 'jihyuk', name: '류지혁', gender: 'M', title: '아시안 포커투어 챔피언', style: { loose: 0.45, aggr: 0.78, bluff: 0.28 },
        lines: { win: ['챔피언은 다르죠', '이게 프로의 클래스'], lose: ['운빨이네요 ㅋ', '다음엔 안 봐줍니다'], allin: ['올인. 콜 하실 수 있겠어요?'] } },
      { id: 'elena', name: 'Elena', gender: 'F', title: '은퇴한 카지노 매니저', style: { loose: 0.33, aggr: 0.65, bluff: 0.18 },
        lines: { win: ['이 업계 40년이에요', '하우스는 항상 이기죠'], lose: ['오랜만에 젊은 피네요', '훌륭해요'], allin: ['마지막 승부, 올인'] } },
    ],
  };

  const avatarSrc = (id, mood) => `../assets/avatars/${id}_${mood || 'calm'}.svg`;

  global.Roster = { STAGES, CHARACTERS, avatarSrc };
})(typeof window !== 'undefined' ? window : globalThis);
