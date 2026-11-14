import { test } from 'node:test';
import assert from 'node:assert/strict';
import engine, { parseLine, findDates, analyzeText } from '../src/engine.js';

const EMPTY = { promises: [], questions: [], undecided: [], dates: [] };

test('parseLine: 타임스탬프를 떼고 화자와 내용을 나눈다', () => {
  assert.deepEqual(parseLine('[00:12] 나: 내일까지 보낼게요'), { speaker: '나', text: '내일까지 보낼게요' });
  assert.deepEqual(parseLine('00:12 박과장: 견적서 받았어요'), { speaker: '박과장', text: '견적서 받았어요' });
  assert.deepEqual(parseLine('(14:03) 화자 1: 네 맞습니다'), { speaker: '화자 1', text: '네 맞습니다' });
  assert.deepEqual(parseLine('[01:02:05] Speaker 2 : OK'), { speaker: 'Speaker 2', text: 'OK' });
});

test('parseLine: 화자 표시가 없으면 speaker는 null', () => {
  assert.deepEqual(parseLine('그럼 그렇게 하죠'), { speaker: null, text: '그럼 그렇게 하죠' });
  assert.deepEqual(parseLine('[00:20] 다들 들어오셨나요?'), { speaker: null, text: '다들 들어오셨나요?' });
  assert.deepEqual(parseLine('오전 10:30에 만나요'), { speaker: null, text: '오전 10:30에 만나요' });
  assert.deepEqual(parseLine('https://example.com 참고'), { speaker: null, text: 'https://example.com 참고' });
  assert.deepEqual(parseLine(''), { speaker: null, text: '' });
});

test('내 약속과 기한: 오늘 중 · 내일 오전', () => {
  const today = analyzeText('나: 회의록은 오늘 중 정리해서 드릴게요.');
  assert.deepEqual(today.promises, [
    { speaker: '나', mine: true, text: '회의록은 오늘 중 정리해서 드릴게요', due: '오늘 중' },
  ]);
  const tomorrow = analyzeText('[00:31] 저: 수정본은 내일 오전까지 보내드리겠습니다.');
  assert.deepEqual(tomorrow.promises, [
    { speaker: '저', mine: true, text: '수정본은 내일 오전까지 보내드리겠습니다', due: '내일 오전' },
  ]);
});

test('상대 약속은 mine=false, 기한이 없으면 "기한 없음"', () => {
  const { promises } = analyzeText('박과장: 계약서는 제가 확인해 볼게요.');
  assert.deepEqual(promises, [{ speaker: '박과장', mine: false, text: '계약서는 제가 확인해 볼게요', due: '기한 없음' }]);
});

test('me 옵션으로 내 이름을 바꿀 수 있다', () => {
  assert.equal(analyzeText('한지우: 내일까지 보낼게요', { me: ['한지우'] }).promises[0].mine, true);
  assert.equal(analyzeText('한지우: 내일까지 보낼게요').promises[0].mine, false);
});

test('부탁·감사 인사는 약속이 아니다', () => {
  const { promises } = analyzeText('박과장: 검토 부탁드릴게요. 회신 주시면 감사하겠습니다.');
  assert.deepEqual(promises, []);
});

test('질문: 물음표로 끝나는 문장', () => {
  const { questions } = analyzeText('나: 네, 알겠습니다. 자료는 받으셨어요? 감사합니다!');
  assert.deepEqual(questions, [{ speaker: '나', text: '자료는 받으셨어요?' }]);
});

test('질문: 물음표 없이 의문 어미로 끝나는 문장', () => {
  const asked = ['언제쯤 받을 수 있나요', '제가 먼저 연락드릴까요', '자료는 다 받으셨습니까', '이게 최종본인가요',
    '금요일도 가능하세요', '내일 오후에 시간 되세요', '혹시 다른 의견 있으세요', '몇 시에 오십니까'];
  for (const sentence of asked) {
    assert.equal(analyzeText(`박과장: ${sentence}`).questions.length, 1, sentence);
  }
  const notAsked = ['좋은 하루 되세요', '그럼 내일 만나요', '네 알겠습니다', '그러니까 내일 보내드릴게요'];
  for (const sentence of notAsked) {
    assert.equal(analyzeText(`박과장: ${sentence}`).questions.length, 0, sentence);
  }
});

test('미정 사항, 한 문장이 여러 목록에 들어갈 수 있다', () => {
  const result = analyzeText([
    '박과장: 장소는 아직 미정이에요.',
    '나: 세부 일정은 추후에 공유할게요.',
    '나: 그건 다시 정리해서 드릴게요.',
    '박과장: 예산은 보류했어요.',
  ].join('\n'));
  assert.deepEqual(result.undecided, [
    { speaker: '박과장', text: '장소는 아직 미정이에요' },
    { speaker: '나', text: '세부 일정은 추후에 공유할게요' },
    { speaker: '박과장', text: '예산은 보류했어요' },
  ]);
  assert.deepEqual(result.promises.map((p) => p.text), ['세부 일정은 추후에 공유할게요', '그건 다시 정리해서 드릴게요']);
});

test('findDates: 가장 긴 표현 하나만 ("다음 주 화요일", "오후 3시")', () => {
  assert.deepEqual(findDates('다음 주 화요일 오후 3시에 회의해요'), ['다음 주 화요일', '오후 3시']);
  assert.deepEqual(findDates('내일 오전 10시까지 드릴게요'), ['내일', '오전 10시']);
  assert.deepEqual(findDates('11월 20일까지 보내 주세요'), ['11월 20일']);
});

test('findDates: 중복은 한 번만, 띄어쓰기가 달라도 같은 표현', () => {
  assert.deepEqual(findDates('내일 보내고, 내일 다시 확인해요. 다음주 화요일, 다음 주 화요일'), ['내일', '다음주 화요일']);
});

test('findDates: 지원하는 날짜·시각 표현', () => {
  const text = '모레, 이번 주 금요일, 11월 17일, 11/20, 25일까지, 오전 10시 30분, 4시 반, 오늘 중으로, 퇴근 전, 점심 전, 주말, 월말';
  assert.deepEqual(findDates(text), ['모레', '이번 주 금요일', '11월 17일', '11/20', '25일까지', '오전 10시 30분', '4시 반',
    '오늘 중으로', '퇴근 전', '점심 전', '주말', '월말']);
  assert.deepEqual(findDates('회의는 3시간쯤 걸려요'), []);
  assert.deepEqual(findDates(''), []);
  assert.deepEqual(findDates(undefined), []);
});

test('문장 나누기: 소수점은 자르지 않고 물음표는 남긴다', () => {
  const result = analyzeText('나: 네, 알겠습니다. 자료는 3.5버전으로 내일까지 보내드릴게요! 혹시 장소는 정해졌나요?');
  assert.deepEqual(result.promises.map((p) => [p.text, p.due]), [['자료는 3.5버전으로 내일까지 보내드릴게요', '내일']]);
  assert.deepEqual(result.questions.map((q) => q.text), ['혹시 장소는 정해졌나요?']);
});

test('빈 입력은 모든 목록이 비어 있다', () => {
  assert.deepEqual(analyzeText(''), EMPTY);
  assert.deepEqual(analyzeText('   \n \n'), EMPTY);
  assert.deepEqual(analyzeText(), EMPTY);
});

test('실제 같은 6줄 통화 전사를 끝까지 점검한다', () => {
  const transcript = [
    '[00:02] 박과장: 지우 씨, 견적서 수정본은 언제쯤 받을 수 있나요?',
    '[00:09] 나: 오늘 중으로 정리해서 드릴게요.',
    '[00:15] 박과장: 좋아요. 미팅 날짜는 아직 미정이라 확인 후 다시 정하죠.',
    '[00:24] 나: 그럼 다음 주 화요일 오후 3시는 어떠세요?',
    '[00:31] 박과장: 내부 일정 확인해 볼게요. 내일 오전까지 연락드리겠습니다.',
    '[00:40] 나: 네, 감사합니다!',
  ].join('\n');
  assert.deepEqual(analyzeText(transcript), {
    promises: [
      { speaker: '나', mine: true, text: '오늘 중으로 정리해서 드릴게요', due: '오늘 중으로' },
      { speaker: '박과장', mine: false, text: '내부 일정 확인해 볼게요', due: '기한 없음' },
      { speaker: '박과장', mine: false, text: '내일 오전까지 연락드리겠습니다', due: '내일 오전' },
    ],
    questions: [
      { speaker: '박과장', text: '지우 씨, 견적서 수정본은 언제쯤 받을 수 있나요?' },
      { speaker: '나', text: '그럼 다음 주 화요일 오후 3시는 어떠세요?' },
    ],
    undecided: [{ speaker: '박과장', text: '미팅 날짜는 아직 미정이라 확인 후 다시 정하죠' }],
    dates: ['오늘 중으로', '다음 주 화요일', '오후 3시', '내일 오전'],
  });
});

test('default export에 세 함수가 있다', () => {
  assert.equal(engine.parseLine, parseLine);
  assert.equal(engine.findDates, findDates);
  assert.equal(engine.analyzeText, analyzeText);
});
