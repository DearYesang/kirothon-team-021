// 붙여넣기 점검 엔진: 통화·회의 전사 텍스트에서 약속, 질문, 미정 사항, 날짜·시각 표현을 찾는다.
// 순수 함수만 둔다. DOM·네트워크에 접근하지 않으며 브라우저와 Node에서 같은 파일을 import 한다.

// ---------------------------------------------------------------------------
// 줄 파싱: "[00:12] 나: 내용" → { speaker: "나", text: "내용" }
// ---------------------------------------------------------------------------

const CLOCK = '\\d{1,2}:\\d{2}(?::\\d{2})?';
// 줄 앞 타임스탬프: [00:12] · (14:03) · 00:12 (괄호 없는 형태는 뒤에 공백이 있을 때만)
const TIMESTAMP_RE = new RegExp(`^\\s*(?:\\[\\s*${CLOCK}\\s*\\]|\\(\\s*${CLOCK}\\s*\\)|${CLOCK}(?=\\s|$))\\s*`);
// 화자 이름: 글자로 시작, 한글·영문·숫자·공백 12자 이내. 콜론 뒤에 숫자(10:30)나 //(https://)가 오면 화자가 아니다.
const SPEAKER_RE = /^([A-Za-z가-힣][A-Za-z0-9가-힣 ]{0,11}?)\s*[:：](?!\d|\/\/)\s*([\s\S]*)$/;
const MAX_SPEAKER_SPACES = 2;

export function parseLine(line) {
  const rest = (typeof line === 'string' ? line : '').replace(TIMESTAMP_RE, '');
  const match = SPEAKER_RE.exec(rest);
  if (match) {
    const speaker = match[1].trim();
    if ((speaker.match(/ /g) || []).length <= MAX_SPEAKER_SPACES) {
      return { speaker, text: match[2].trim() };
    }
  }
  return { speaker: null, text: rest.trim() };
}

// ---------------------------------------------------------------------------
// 날짜·시각 표현: 등장 순서, 중복 제거, 겹치면 먼저 시작하고 더 긴 표현이 이긴다.
// ---------------------------------------------------------------------------

const SP = '[ \\t\\u00a0]*'; // 줄은 넘지 않는 공백
const JUNG = '중(?!요|간|심|국|단)(?:으로|에)?'; // "중", "중으로", "중에" (중요·중간 제외)
// 날 뒤에 붙는 오전/오후: 바로 뒤에 시각 숫자가 오면 붙이지 않는다 ("내일" + "오전 10시"로 나눔).
const DAY_PART = `(?:${SP}(?:오전|오후)(?:${SP}${JUNG})?(?!${SP}\\d))?`;
const WEEKDAY = '[월화수목금토일]요일';

const DATE_PATTERNS = [
  `(?:오늘|내일|모레)(?:${SP}${JUNG})?${DAY_PART}`,
  `(?:이번|다음)${SP}주(?:${SP}${WEEKDAY}${DAY_PART}|말|${SP}${JUNG}|${SP}초(?!안|대|과|청))?`,
  `${WEEKDAY}${DAY_PART}`,
  `\\b\\d{1,2}${SP}월${SP}\\d{1,2}${SP}일${DAY_PART}`,
  `\\b\\d{1,2}${SP}월${SP}(?:초|중순|말)`,
  `\\b(?:1[0-2]|0?[1-9])\\/(?:3[01]|[12]\\d|0?[1-9])(?![\\d/])${DAY_PART}`,
  `\\b\\d{1,2}${SP}일${SP}까지`,
  `(?:(?:오전|오후)${SP})?\\b\\d{1,2}${SP}시(?!간)(?:${SP}(?:반|\\d{1,2}${SP}분))?`,
  `(?:오전|오후)${SP}${JUNG}`,
  `(?:퇴근|점심)${SP}전(?!화|달|체|송|부)`,
  '주말',
  '월말',
].map((source) => new RegExp(source, 'g'));

export function findDates(text) {
  if (typeof text !== 'string' || text === '') return [];
  const hits = [];
  for (const pattern of DATE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      hits.push({ start: match.index, end: match.index + match[0].length, value: match[0].trim() });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);

  const found = [];
  const seen = new Set();
  let coveredUntil = -1;
  for (const hit of hits) {
    if (hit.start < coveredUntil || hit.value === '') continue; // 더 긴 표현 안에 든 것
    coveredUntil = hit.end;
    const key = hit.value.replace(/\s+/g, ''); // "다음주 화요일" = "다음 주 화요일"
    if (!seen.has(key)) {
      seen.add(key);
      found.push(hit.value);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// 문장 나누기: . ? ! 와 줄 끝 기준. 물음표는 남기고 나머지 문장부호는 뗀다.
// ---------------------------------------------------------------------------

const TERMINATORS = '.?!。？！…';

function splitSentences(body) {
  const sentences = [];
  const push = (raw, asked) => {
    const sentence = raw.trim();
    if (sentence) sentences.push(asked ? `${sentence}?` : sentence);
  };
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (!TERMINATORS.includes(ch)) continue;
    if (ch === '.' && /\d/.test(body[i - 1] ?? '') && /\d/.test(body[i + 1] ?? '')) continue; // 3.5, 11.17
    let end = i;
    while (end + 1 < body.length && TERMINATORS.includes(body[end + 1])) end += 1;
    push(body.slice(start, i), /[?？]/.test(body.slice(i, end + 1)));
    start = end + 1;
    i = end;
  }
  push(body.slice(start), false);
  return sentences;
}

// ---------------------------------------------------------------------------
// 분류 규칙 (한 문장이 여러 목록에 들어갈 수 있다)
// ---------------------------------------------------------------------------

// 약속 어미. 띄어쓰기를 지운 문장에 맞춘다 ("확인해 볼게요" = "확인해볼게요").
const PROMISE_RE = /드릴게요|드릴께요|드리겠습니다|할게요|할께요|하겠습니다|보낼게요|보낼께요|보내겠습니다|공유할게요|공유드릴게요|정리해서드릴|연락드리겠습니다|(?:확인해|검토해|알아|찾아|살펴)(?:볼게요|볼께요|보겠습니다)/;
// 약속처럼 보이지만 부탁·인사·거절인 말은 먼저 지운다.
const NOT_PROMISE_RE = /(?:부탁|못)(?:드릴게요|드릴께요|드리겠습니다|할게요|할께요|하겠습니다)|감사(?:하겠습니다|드리겠습니다)/g;

const QUESTION_END_RE = /(?:나요|까요|습니까|인가요|건가요|는가요|은가요|있으세요|되세요|가능하세요|괜찮으세요)$/;
const NOT_QUESTION_END_RE = /(?:만나요|끝나요|떠나요|지나요|생각나요|기억나요)$|(?:좋은|즐거운|행복한|편안한|멋진|건강한|따뜻한|힘찬)\s*[가-힣]*\s*되세요$|잘\s*있으세요$/;
const JONG_B = 17; // 받침 ㅂ: 습니까·입니까·됩니까·하십니까

const UNDECIDED_RE = /미정|미확정|추후|나중에|다시\s*정(?!리|확|상|말|성|직|신)|확인\s*후|정해지면|확정되면|결정되면|아직|보류/;

function isPromise(sentence) {
  const compact = sentence.replace(/\s+/g, '').replace(NOT_PROMISE_RE, '');
  return PROMISE_RE.test(compact);
}

function isQuestion(sentence) {
  if (sentence.endsWith('?')) return true;
  const core = sentence.replace(/[\s.!~…。！]+$/, '');
  if (NOT_QUESTION_END_RE.test(core)) return false;
  if (QUESTION_END_RE.test(core)) return true;
  const formal = /([가-힣])니까$/.exec(core);
  return Boolean(formal) && (formal[1].charCodeAt(0) - 0xac00) % 28 === JONG_B;
}

function isUndecided(sentence) {
  return UNDECIDED_RE.test(sentence);
}

// ---------------------------------------------------------------------------
// 붙여넣은 전사 텍스트 점검
// ---------------------------------------------------------------------------

export function analyzeText(text, { me = ['나', '저', '본인'] } = {}) {
  const result = { promises: [], questions: [], undecided: [], dates: [] };
  if (typeof text !== 'string' || text.trim() === '') return result;

  const myNames = new Set((Array.isArray(me) ? me : [me]).map((name) => String(name).trim().toLowerCase()));

  for (const line of text.split(/\r\n|\r|\n/)) {
    const { speaker, text: body } = parseLine(line);
    const mine = speaker !== null && myNames.has(speaker.toLowerCase());
    for (const sentence of splitSentences(body)) {
      if (isPromise(sentence)) {
        result.promises.push({ speaker, mine, text: sentence, due: findDates(sentence)[0] ?? '기한 없음' });
      }
      if (isQuestion(sentence)) result.questions.push({ speaker, text: sentence });
      if (isUndecided(sentence)) result.undecided.push({ speaker, text: sentence });
    }
  }

  result.dates = findDates(text);
  return result;
}

export default { parseLine, findDates, analyzeText };
