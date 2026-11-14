// data/demo.json 정합성 검사. 파일이 아직 없으면 실패하지 않고 건너뛴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeText } from '../src/engine.js';

const DEMO_URL = new URL('../data/demo.json', import.meta.url);
const SOURCE_KEYS = ['gmail', 'naver', 'naverworks', 'outlook', 'kakao', 'slack', 'adot', 'clova', 'tiro', 'daglo'];
const WEIGHTS = ['2min', 'think', 'later'];
const TYPES = ['conflict', 'promise', 'unanswered', 'gap'];
const STYLES = ['정중하게', '간결하게'];
const DIRECTIONS = ['in', 'out'];

let data = null;
let skip = false;
let parseError = null;
try {
  const raw = await readFile(DEMO_URL, 'utf8');
  try {
    data = JSON.parse(raw);
  } catch (error) {
    parseError = error;
    skip = 'data/demo.json을 JSON으로 읽지 못해 정합성 검사를 건너뜀 (위 JSON 검사 실패 참고)';
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  skip = 'data/demo.json이 아직 없어 데이터 정합성 검사를 건너뜀';
}

if (parseError) {
  test('data/demo.json은 올바른 JSON이다', () => {
    assert.fail(`JSON 파싱 실패: ${parseError.message}`);
  });
}

const check = (name, fn) => test(name, { skip }, fn);
const list = (value) => (Array.isArray(value) ? value : []);
const byId = (items) => new Map(list(items).map((item) => [item?.id, item]));
const noProblems = (problems) => assert.deepEqual(problems, [], `문제 ${problems.length}건:\n${problems.join('\n')}`);

check('출처 10종이 모두 있고 라벨이 있다', () => {
  const problems = [];
  for (const key of SOURCE_KEYS) {
    const source = data.sources?.[key];
    if (!source) problems.push(`sources.${key} 없음`);
    else if (typeof source.label !== 'string' || source.label.trim() === '') problems.push(`sources.${key}.label 비어 있음`);
  }
  noProblems(problems);
});

check('id가 겹치지 않는다', () => {
  const problems = [];
  const groups = { people: data.people, messages: data.messages, items: data.onePage?.items, drafts: data.drafts };
  for (const [name, items] of Object.entries(groups)) {
    const seen = new Set();
    for (const item of list(items)) {
      if (typeof item?.id !== 'string' || item.id === '') problems.push(`${name}: id 없는 항목 ${JSON.stringify(item)?.slice(0, 60)}`);
      else if (seen.has(item.id)) problems.push(`${name}: id ${item.id} 중복`);
      else seen.add(item.id);
    }
  }
  noProblems(problems);
});

check('모든 연락의 출처가 sources에 있다', () => {
  const problems = list(data.messages)
    .filter((message) => !Object.hasOwn(data.sources ?? {}, message.source))
    .map((message) => `messages[${message.id}].source "${message.source}" 모르는 출처`);
  assert.ok(list(data.messages).length > 0, 'messages가 비어 있음');
  noProblems(problems);
});

check('모든 personId·messageId·draftIds·to가 실제 대상을 가리킨다', () => {
  const people = byId(data.people);
  const messages = byId(data.messages);
  const items = byId(data.onePage?.items);
  const drafts = byId(data.drafts);
  const sources = data.sources ?? {};
  const problems = [];
  const need = (map, id, where) => {
    if (!map.has(id)) problems.push(`${where}: "${id}" 없음`);
  };

  for (const message of list(data.messages)) {
    if (message.personId != null) need(people, message.personId, `messages[${message.id}].personId`);
  }
  for (const item of list(data.onePage?.items)) {
    list(item.personIds).forEach((id) => need(people, id, `items[${item.id}].personIds`));
    list(item.evidence).forEach((ev, i) => need(messages, ev?.messageId, `items[${item.id}].evidence[${i}].messageId`));
    list(item.draftIds).forEach((id) => need(drafts, id, `items[${item.id}].draftIds`));
  }
  list(data.onePage?.later).forEach((entry, i) => need(messages, entry?.messageId, `onePage.later[${i}].messageId`));
  for (const draft of list(data.drafts)) {
    need(items, draft.itemId, `drafts[${draft.id}].itemId`);
    need(people, draft.to, `drafts[${draft.id}].to`);
    if (!Object.hasOwn(sources, draft.channel)) problems.push(`drafts[${draft.id}].channel: "${draft.channel}" 모르는 출처`);
  }
  for (const [i, c] of list(data.checks).entries()) {
    need(messages, c.messageId, `checks[${i}].messageId`);
    list(c.links).forEach((link, j) => need(messages, link?.messageId, `checks[${i}].links[${j}].messageId`));
  }
  noProblems(problems);
});

check('항목마다 근거가 있고 모든 evidence.quote가 원문 text에 그대로 있다', () => {
  const messages = byId(data.messages);
  const problems = [];
  for (const item of list(data.onePage?.items)) {
    if (list(item.evidence).length === 0) problems.push(`items[${item.id}]: evidence 없음`);
    list(item.evidence).forEach((ev, i) => {
      const where = `items[${item.id}].evidence[${i}]`;
      const message = messages.get(ev?.messageId);
      if (typeof ev?.quote !== 'string' || ev.quote === '') problems.push(`${where}: quote 비어 있음`);
      else if (!message) problems.push(`${where}: 메시지 ${ev?.messageId} 없음`);
      else if (!String(message.text ?? '').includes(ev.quote)) problems.push(`${where}: ${message.id} text에 quote 없음: "${ev.quote}"`);
    });
  }
  noProblems(problems);
});

check('초안이 있는 항목은 정중하게·간결하게 초안 두 개를 가진다', () => {
  const drafts = byId(data.drafts);
  const problems = [];
  for (const item of list(data.onePage?.items)) {
    if (!Array.isArray(item.draftIds) || item.draftIds.length === 0) continue;
    const found = item.draftIds.map((id) => drafts.get(id)).filter(Boolean);
    const styles = found.map((draft) => draft.style).sort();
    if (item.draftIds.length !== 2) problems.push(`items[${item.id}]: draftIds ${item.draftIds.length}개 (2개여야 함)`);
    if (JSON.stringify(styles) !== JSON.stringify([...STYLES].sort())) {
      problems.push(`items[${item.id}]: 초안 말투 ${JSON.stringify(styles)} (정중하게·간결하게 하나씩이어야 함)`);
    }
    for (const draft of found) {
      if (draft.itemId !== item.id) problems.push(`drafts[${draft.id}].itemId "${draft.itemId}" ≠ ${item.id}`);
    }
  }
  noProblems(problems);
});

check('weight·type·style·direction 값이 정해진 목록 안에 있다', () => {
  const problems = [];
  for (const item of list(data.onePage?.items)) {
    if (!WEIGHTS.includes(item.weight)) problems.push(`items[${item.id}].weight "${item.weight}"`);
    if (!TYPES.includes(item.type)) problems.push(`items[${item.id}].type "${item.type}"`);
  }
  for (const draft of list(data.drafts)) {
    if (!STYLES.includes(draft.style)) problems.push(`drafts[${draft.id}].style "${draft.style}"`);
  }
  for (const message of list(data.messages)) {
    if (!DIRECTIONS.includes(message.direction)) problems.push(`messages[${message.id}].direction "${message.direction}"`);
  }
  noProblems(problems);
});

check('headline에 실제 항목 수와 집중력 합계가 들어 있다', () => {
  const items = list(data.onePage?.items);
  const badCost = items.filter((item) => typeof item.cost !== 'number' || !Number.isFinite(item.cost));
  assert.deepEqual(badCost.map((item) => item.id), [], 'cost가 숫자가 아닌 항목');
  const total = items.reduce((sum, item) => sum + item.cost, 0);
  const headline = String(data.onePage?.headline ?? '');
  const hasNumber = (n) => new RegExp(`(^|\\D)${n}(\\D|$)`).test(headline);
  assert.ok(hasNumber(items.length), `headline "${headline}"에 항목 수 ${items.length}이 없음`);
  assert.ok(hasNumber(total), `headline "${headline}"에 집중력 합계 ${total}이 없음`);
});

check('pasteSample이 있고 엔진이 약속·질문·날짜를 하나 이상 찾는다', () => {
  assert.equal(typeof data.pasteSample, 'string', 'pasteSample이 문자열이 아님');
  assert.ok(data.pasteSample.trim() !== '', 'pasteSample이 비어 있음');
  const result = analyzeText(data.pasteSample);
  assert.ok(result.promises.length >= 1, '약속을 하나도 못 찾음');
  assert.ok(result.questions.length >= 1, '질문을 하나도 못 찾음');
  assert.ok(result.dates.length >= 1, '날짜·시각 표현을 하나도 못 찾음');
});
