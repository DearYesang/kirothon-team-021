// 집중력 비서 화면: data/demo.json을 읽어 세 탭(오늘의 한 장 / 흩어진 연락 / 통화·회의 점검)을 그린다.
// 데이터에서 온 글자는 모두 textContent(또는 텍스트 노드)로 넣는다. innerHTML은 쓰지 않는다.
// 비서는 아무것도 보내지 않는다. 네트워크 요청은 같은 출처의 데이터 파일 하나뿐이다.

const DEFAULT_DATA = 'data/demo.json';
const LOAD_ERROR_TEXT = '데이터를 불러오지 못했어요. 로컬에서는 python3 -m http.server로 열어 주세요';
const ENGINE_ERROR_TEXT = '점검 엔진을 불러오지 못했어요';
const EMPTY_PASTE_TEXT = '점검할 내용을 붙여넣어 주세요';
const COPIED_TEXT = '복사했어요. 원래 앱에서 보내세요';
const COPY_FALLBACK_TEXT = 'Ctrl/Cmd+C로 복사하세요';

const TYPE_LABELS = { conflict: '충돌', promise: '잊힌 약속', unanswered: '답 안 한 질문', gap: '빈칸' };
const WEIGHT_LABELS = { '2min': '2분', think: '생각 필요', later: '나중' };
const WEIGHT_ORDER = { '2min': 0, think: 1, later: 2 };
const STYLE_ORDER = ['정중하게', '간결하게'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const TAB_KEYS = { today: 'tab-today', inbox: 'tab-inbox', checks: 'tab-checks' };

const state = {
  data: null,
  idx: null,
  analyzeText: null,
  filter: 'all',
  byPerson: false,
  lastFocus: null,
};

// ---------- 작은 도구 ----------

const $ = (id) => document.getElementById(id);

// h('p', { class: 'x', text: '글자' }, 자식...) : 글자는 항상 텍스트 노드로 들어간다.
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'hidden') node.hidden = true;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

function warnMissing(kind, id, where) {
  console.warn(`[집중력 비서] ${where}: ${kind} "${id}"를 찾을 수 없어 그 부분을 숨겨요.`);
}

function getMessage(id, where) {
  const msg = state.idx.messages.get(id);
  if (!msg) warnMissing('메시지', id, where);
  return msg || null;
}

function getPerson(id, where) {
  const person = state.idx.people.get(id);
  if (!person) warnMissing('사람', id, where);
  return person || null;
}

function getDraft(id, where) {
  const draft = state.idx.drafts.get(id);
  if (!draft) warnMissing('초안', id, where);
  return draft || null;
}

function parseTime(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ''));
  return m ? { y: +m[1], mo: +m[2], d: +m[3], hh: m[4], mm: m[5] } : null;
}

// "2026-11-13T09:12" → "11/13 09:12"
function formatTime(value) {
  const t = parseTime(value);
  if (!t) return String(value || '');
  return t.hh ? `${t.mo}/${t.d} ${t.hh}:${t.mm}` : `${t.mo}/${t.d}`;
}

// "2026-11-13" → "2026년 11월 13일 (금)"
function formatDate(value) {
  const t = parseTime(value);
  if (!t) return String(value || '');
  const weekday = WEEKDAYS[new Date(Date.UTC(t.y, t.mo - 1, t.d)).getUTCDay()];
  return `${t.y}년 ${t.mo}월 ${t.d}일 (${weekday})`;
}

function sourceLabel(key) {
  return state.idx.sources[key]?.label || String(key || '출처 없음');
}

function sourceKind(key) {
  return state.idx.sources[key]?.kind || 'other';
}

function personLabel(person) {
  return person ? [person.name, person.title].filter(Boolean).join(' ') : '알 수 없는 사람';
}

function firstLine(msg) {
  if (msg.subject) return msg.subject;
  return String(msg.text || '').split('\n').find((line) => line.trim()) || '';
}

function sourceBadge(key) {
  return h('span', { class: `badge src src-${sourceKind(key)} src-${key}`, text: sourceLabel(key) });
}

// ?data=tests/fixtures/mini.json 처럼 같은 사이트 안의 상대 경로(.json)만 허용한다.
function getDataUrl(search = window.location.search) {
  const value = new URLSearchParams(search).get('data');
  if (!value) return DEFAULT_DATA;
  const safe = /^[A-Za-z0-9_-][A-Za-z0-9_./-]*\.json$/.test(value) && !value.includes('..') && !value.includes('//');
  if (!safe) {
    console.warn('[집중력 비서] data 주소는 같은 사이트 안의 상대 경로(.json)만 쓸 수 있어요. 기본 데이터를 씁니다:', value);
    return DEFAULT_DATA;
  }
  return value;
}

// ---------- 불러오기 ----------

async function loadData(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  const data = await res.json();
  if (!data || typeof data !== 'object' || !Array.isArray(data.messages)) {
    throw new Error('데이터 형식이 맞지 않아요 (messages 배열 없음)');
  }
  return data;
}

async function loadEngine() {
  try {
    const { analyzeText } = await import('./engine.js');
    if (typeof analyzeText !== 'function') throw new Error('analyzeText 함수가 없어요');
    return analyzeText;
  } catch (err) {
    console.warn(`[집중력 비서] ${ENGINE_ERROR_TEXT}:`, err);
    return null;
  }
}

function buildIndex(data) {
  const byId = (list) => new Map((Array.isArray(list) ? list : []).map((x) => [x.id, x]));
  return {
    people: byId(data.people),
    messages: byId(data.messages),
    drafts: byId(data.drafts),
    sources: data.sources && typeof data.sources === 'object' ? data.sources : {},
  };
}

// ---------- 상단: 인물·날짜·집중력 막대 ----------

function renderHeader() {
  const { meta = {}, persona = {}, onePage = {}, messages = [] } = state.data;
  $('persona-name').textContent = persona.name || '';
  $('persona-role').textContent = persona.role || '';
  $('persona-date').textContent = meta.date ? `${formatDate(meta.date)}의 연락` : '';
  $('inbox-count').textContent = String(messages.length);
  $('meta-note').textContent = meta.note || '모든 인물·기관·내용은 가상입니다.';
  renderFocusMeter(onePage.items || [], Number(persona.focusBudget) || 100);
  $('today-box').hidden = false;
}

function renderFocusMeter(items, budget) {
  const used = items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
  const ratio = budget > 0 ? used / budget : 0;
  const track = $('meter-track');
  track.setAttribute('aria-valuemax', String(budget));
  track.setAttribute('aria-valuenow', String(used));
  track.setAttribute('aria-valuetext', `${budget} 중 ${used}`);
  $('meter-fill').style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
  $('meter-value').textContent = `${used} / ${budget}`;
  const over = used > budget;
  $('focus-meter').classList.toggle('is-over', over);
  $('meter-hint').textContent = over
    ? `하루 예산보다 ${used - budget} 많아요. '나중' 항목을 내일로 넘기세요.`
    : `오늘 항목 ${items.length}개를 처리해도 ${budget - used}이 남아요.`;
}

// ---------- 탭 ----------

function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (tab, { focus = false, remember = false } = {}) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    if (remember) {
      const key = Object.keys(TAB_KEYS).find((k) => TAB_KEYS[k] === tab.id);
      history.replaceState(null, '', `#${key}`);
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab, { remember: true }));
    tab.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (event.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (event.key === 'Home') next = tabs[0];
      else if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        select(next, { focus: true, remember: true });
      }
    });
  });
  const fromHash = TAB_KEYS[window.location.hash.slice(1)];
  if (fromHash) select($(fromHash));
}

// ---------- 원문 대화상자 ----------

function setupDialog() {
  const dialog = $('source-dialog');
  $('dialog-close').addEventListener('click', () => dialog.close());
  // 바깥(어두운 배경)을 누르면 닫는다. 안쪽 내용은 .dialog-inner가 덮고 있다.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    const back = state.lastFocus;
    state.lastFocus = null;
    if (back && document.contains(back)) back.focus();
  });
}

// 본문 안의 quote를 <mark>로 감싼 조각을 만든다. quote가 없으면 그대로 둔다.
function highlightQuote(text, quote) {
  const frag = document.createDocumentFragment();
  const at = quote ? text.indexOf(quote) : -1;
  if (at < 0) {
    if (quote) console.warn('[집중력 비서] 인용 문장을 원문에서 찾지 못했어요:', quote);
    frag.append(text);
    return { frag, mark: null };
  }
  const mark = h('mark', { text: quote });
  frag.append(text.slice(0, at), mark, text.slice(at + quote.length));
  return { frag, mark };
}

function openMessage(messageId, quote, opener) {
  const msg = getMessage(messageId, '원문 보기');
  if (!msg) return;
  const dialog = $('source-dialog');
  const person = state.idx.people.get(msg.personId);
  $('dialog-title').textContent = msg.subject || `${sourceLabel(msg.source)} 원문`;
  $('dialog-meta').replaceChildren(...[
    sourceBadge(msg.source),
    msg.direction === 'out' ? h('span', { class: 'badge badge-out', text: '내가 보냄' }) : null,
    h('span', { class: 'dialog-who', text: person ? `${personLabel(person)}${person.org ? ` · ${person.org}` : ''}` : '알 수 없는 사람' }),
    h('time', { class: 'dialog-time', datetime: msg.time, text: formatTime(msg.time) }),
  ].filter(Boolean));
  const { frag, mark } = highlightQuote(String(msg.text || ''), quote);
  const body = $('dialog-body');
  body.replaceChildren(frag);
  body.scrollTop = 0;
  state.lastFocus = opener || document.activeElement;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  $('dialog-close').focus();
  if (mark) mark.scrollIntoView({ block: 'center' });
}

// ---------- 알림(토스트) ----------

let toastTimer = 0;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = '';
  // 같은 문구를 다시 띄워도 화면 읽기 프로그램이 읽도록 잠깐 비웠다가 넣는다.
  window.setTimeout(() => {
    toast.textContent = message;
    toast.classList.add('is-visible');
  }, 30);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600);
}

async function copyText(text, sourceEl) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(COPIED_TEXT);
      return true;
    } catch (err) {
      console.warn('[집중력 비서] 클립보드에 넣지 못했어요:', err);
    }
  }
  // 클립보드 API가 없으면 초안을 선택 상태로 만들고 직접 복사하도록 안내한다.
  sourceEl.focus();
  const range = document.createRange();
  range.selectNodeContents(sourceEl);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  showToast(COPY_FALLBACK_TEXT);
  return false;
}

// ---------- 탭1: 오늘의 한 장 ----------

// 바로(urgent) 먼저, 그다음 2min → think → later. 같으면 데이터 순서.
function sortItems(items) {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) =>
      (b.item.urgent === true) - (a.item.urgent === true)
      || (WEIGHT_ORDER[a.item.weight] ?? 9) - (WEIGHT_ORDER[b.item.weight] ?? 9)
      || a.i - b.i)
    .map((x) => x.item);
}

function weightText(item) {
  const label = WEIGHT_LABELS[item.weight] || String(item.weight || '');
  return `${label} · 집중력 ${Number(item.cost) || 0}`;
}

function renderOnePage() {
  const onePage = state.data.onePage || {};
  const items = sortItems(Array.isArray(onePage.items) ? onePage.items : []);
  const cards = items.length
    ? h('ol', { class: 'cards', 'aria-label': '오늘 결정할 것' }, items.map((item) => h('li', {}, renderItemCard(item))))
    : h('p', { class: 'empty', text: '오늘 결정할 것이 없어요.' });
  $('panel-today').replaceChildren(
    h('div', { class: 'panel-head' },
      h('h2', { text: onePage.headline || '오늘의 한 장' }),
      h('p', { class: 'panel-sub', text: '바로 처리할 것부터 위에 있어요. 근거를 누르면 원문을 볼 수 있어요.' })),
    h('div', { class: 'today-grid' }, cards, renderLater(Array.isArray(onePage.later) ? onePage.later : [])),
  );
}

function renderItemCard(item) {
  const where = `항목 ${item.id}`;
  const type = TYPE_LABELS[item.type] ? item.type : 'other';
  const titleId = `item-${item.id}-title`;
  const people = (item.personIds || []).map((id) => getPerson(id, where)).filter(Boolean);

  const evidence = (item.evidence || []).map((ev) => {
    const msg = getMessage(ev.messageId, `${where} 근거`);
    if (!msg) return null;
    const label = `${sourceLabel(msg.source)} · ${formatTime(msg.time)}`;
    return h('li', { class: 'evidence-item' },
      h('button', {
        type: 'button',
        class: 'chip chip-evidence',
        'aria-label': `원문 보기: ${label}`,
        onclick: (event) => openMessage(msg.id, ev.quote, event.currentTarget),
      }, h('span', { class: `dot dot-${sourceKind(msg.source)} dot-${msg.source}`, 'aria-hidden': 'true' }), label),
      ev.quote ? h('q', { class: 'evidence-quote', text: ev.quote }) : null);
  }).filter(Boolean);

  const drafts = (item.draftIds || []).map((id) => getDraft(id, where)).filter(Boolean);
  let actions = null;
  let panel = null;
  if (drafts.length) {
    const panelId = `draft-${item.id}`;
    panel = h('section', { class: 'draft-panel', id: panelId, hidden: true, 'aria-label': `${item.title} 답장 초안` });
    const button = h('button', {
      type: 'button',
      class: 'btn btn-primary btn-draft',
      'aria-expanded': 'false',
      'aria-controls': panelId,
      onclick: () => toggleDraftPanel(button, panel, drafts),
    }, '답장 초안');
    actions = h('div', { class: 'card-actions' }, button);
  }

  return h('article', { class: `card item-card type-${type}${item.urgent ? ' is-urgent' : ''}`, 'aria-labelledby': titleId },
    h('div', { class: 'card-badges' },
      h('span', { class: `badge badge-type badge-${type}`, text: TYPE_LABELS[item.type] || String(item.type || '') }),
      item.urgent ? h('span', { class: 'badge badge-urgent', text: '바로' }) : null,
      h('span', { class: `chip-weight weight-${item.weight}`, text: weightText(item) })),
    h('h3', { class: 'card-title', id: titleId, text: item.title || '' }),
    h('p', { class: 'card-advice', text: item.advice || '' }),
    people.length
      ? h('p', { class: 'card-people' },
        h('span', { class: 'field-label', text: '관련' }),
        people.map((p) => h('span', { class: 'person-pill', text: personLabel(p) })))
      : null,
    evidence.length
      ? h('div', { class: 'card-evidence' },
        h('span', { class: 'field-label', text: '근거' }),
        h('ul', { class: 'evidence-list' }, evidence))
      : null,
    actions,
    panel);
}

function toggleDraftPanel(button, panel, drafts) {
  const open = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(open));
  if (open && !panel.hasChildNodes()) renderDraftPanel(panel, drafts);
  panel.hidden = !open;
}

function renderDraftPanel(panel, drafts) {
  const styles = [...new Set(drafts.map((d) => d.style))].sort((a, b) => {
    const ia = STYLE_ORDER.indexOf(a);
    const ib = STYLE_ORDER.indexOf(b);
    return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
  });
  const body = h('div', { class: 'draft-body' });
  const switcher = h('div', { class: 'segmented', role: 'group', 'aria-label': '말투 고르기' });
  const show = (style) => {
    for (const b of switcher.children) b.setAttribute('aria-pressed', String(b.dataset.style === style));
    const draft = drafts.find((d) => d.style === style) || drafts[0];
    body.replaceChildren(...renderDraft(draft));
  };
  for (const style of styles) {
    switcher.append(h('button', {
      type: 'button',
      class: 'seg',
      'aria-pressed': 'false',
      dataset: { style },
      onclick: () => show(style),
    }, style));
  }
  panel.append(
    h('div', { class: 'draft-head' }, h('h4', { class: 'draft-title', text: '답장 초안' }), switcher),
    body,
    h('p', { class: 'draft-note', text: '비서는 직접 보내지 않아요. 복사해서 원래 앱에서 보내세요.' }),
  );
  show(styles[0]);
}

function renderDraft(draft) {
  const to = getPerson(draft.to, `초안 ${draft.id}`);
  const textEl = h('div', { class: 'draft-text', tabindex: '0', 'aria-label': '초안 본문', text: draft.text || '' });
  const meta = h('dl', { class: 'draft-meta' },
    to ? h('div', {}, h('dt', { text: '받는 사람' }), h('dd', { text: `${personLabel(to)}${to.org ? ` · ${to.org}` : ''}` })) : null,
    h('div', {}, h('dt', { text: '채널' }), h('dd', {}, sourceBadge(draft.channel))),
    draft.subject ? h('div', {}, h('dt', { text: '제목' }), h('dd', { class: 'draft-subject', text: draft.subject })) : null);
  return [
    meta,
    textEl,
    h('p', { class: 'draft-why' }, h('strong', { text: '왜 이 말투인지' }), ' ', draft.why || ''),
    h('div', { class: 'draft-actions' },
      h('button', { type: 'button', class: 'btn btn-copy', onclick: () => copyText(draft.text || '', textEl) }, '복사')),
  ];
}

function renderLater(later) {
  const rows = later.map((entry) => {
    const msg = getMessage(entry.messageId, '넘겨도 되는 것');
    if (!msg) return null;
    const person = state.idx.people.get(msg.personId);
    return h('li', { class: 'later-item' },
      h('button', { type: 'button', class: 'later-open', onclick: (event) => openMessage(msg.id, null, event.currentTarget) },
        h('span', { class: 'later-meta' },
          sourceBadge(msg.source),
          h('span', { text: [person ? personLabel(person) : null, formatTime(msg.time)].filter(Boolean).join(' · ') })),
        h('span', { class: 'later-summary', text: firstLine(msg) })),
      h('p', { class: 'later-reason', text: entry.reason || '' }));
  }).filter(Boolean);
  return h('aside', { class: 'later', 'aria-labelledby': 'later-title' },
    h('h3', { class: 'later-title', id: 'later-title', text: '오늘은 넘겨도 되는 것' }),
    rows.length ? h('ul', { class: 'later-list' }, rows) : h('p', { class: 'empty', text: '넘길 연락이 없어요.' }));
}

// ---------- 탭2: 흩어진 연락 ----------

function renderInbox() {
  const messages = [...state.data.messages].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const counts = new Map();
  for (const msg of messages) counts.set(msg.source, (counts.get(msg.source) || 0) + 1);
  const known = Object.keys(state.idx.sources).filter((key) => counts.has(key));
  const unknown = [...counts.keys()].filter((key) => !known.includes(key));

  const filters = h('div', { class: 'filters', role: 'group', 'aria-label': '출처로 거르기' });
  const addFilter = (key, label, count) => filters.append(h('button', {
    type: 'button',
    class: 'filter',
    'aria-pressed': String(state.filter === key),
    dataset: { key },
    onclick: () => { state.filter = key; update(); },
  }, key === 'all' ? null : h('span', { class: `dot dot-${sourceKind(key)} dot-${key}`, 'aria-hidden': 'true' }),
  label, h('span', { class: 'filter-count', text: String(count) })));
  addFilter('all', '전체', messages.length);
  for (const key of [...known, ...unknown]) addFilter(key, sourceLabel(key), counts.get(key));

  const personToggle = h('button', {
    type: 'button',
    class: 'switch',
    'aria-pressed': String(state.byPerson),
    onclick: () => { state.byPerson = !state.byPerson; update(); },
  }, h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-thumb' })), '사람별로 보기');

  const status = h('p', { class: 'inbox-status', role: 'status', 'aria-live': 'polite' });
  const list = h('div', { class: 'inbox-list' });

  function update() {
    for (const b of filters.children) b.setAttribute('aria-pressed', String(b.dataset.key === state.filter));
    personToggle.setAttribute('aria-pressed', String(state.byPerson));
    const shown = state.filter === 'all' ? messages : messages.filter((m) => m.source === state.filter);
    const where = state.filter === 'all' ? '모든 출처' : sourceLabel(state.filter);
    status.textContent = `${where} · 연락 ${shown.length}개${state.byPerson ? ' · 사람별' : ' · 시간순'}`;
    list.replaceChildren(state.byPerson ? renderGroups(shown) : renderRows(shown));
  }

  $('panel-inbox').replaceChildren(
    h('div', { class: 'panel-head' },
      h('h2', { text: '흩어진 연락' }),
      h('p', { class: 'panel-sub', text: '메일·메신저·통화·회의록을 한곳에 시간순으로 모았어요. 줄을 누르면 본문이 펼쳐져요.' })),
    h('div', { class: 'toolbar' }, filters, personToggle),
    status,
    list,
  );
  update();
}

function renderRows(messages) {
  if (!messages.length) return h('p', { class: 'empty', text: '이 출처의 연락이 없어요.' });
  return h('ul', { class: 'msg-list' }, messages.map(renderMessageRow));
}

function renderMessageRow(msg) {
  const person = state.idx.people.get(msg.personId);
  if (!person && msg.personId) warnMissing('사람', msg.personId, `메시지 ${msg.id}`);
  const bodyId = `msg-body-${msg.id}`;
  const body = h('div', { class: 'msg-body', id: bodyId, hidden: true },
    msg.subject ? h('p', { class: 'msg-subject', text: msg.subject }) : null,
    h('p', { class: 'msg-text', text: msg.text || '' }));
  const row = h('button', {
    type: 'button',
    class: 'msg-row',
    'aria-expanded': 'false',
    'aria-controls': bodyId,
    onclick: () => {
      const open = row.getAttribute('aria-expanded') !== 'true';
      row.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
    },
  },
  h('span', { class: 'msg-src' }, sourceBadge(msg.source)),
  h('span', { class: 'msg-who' },
    h('span', { class: 'msg-name', text: personLabel(person) }),
    msg.direction === 'out' ? h('span', { class: 'badge badge-out', text: '내가 보냄' }) : null),
  h('span', { class: 'msg-preview', text: firstLine(msg) }),
  h('time', { class: 'msg-time', datetime: msg.time, text: formatTime(msg.time) }));
  return h('li', { class: `msg${msg.direction === 'out' ? ' is-out' : ''}` }, row, body);
}

function renderGroups(messages) {
  if (!messages.length) return h('p', { class: 'empty', text: '이 출처의 연락이 없어요.' });
  const groups = new Map();
  for (const msg of messages) {
    const key = msg.personId || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(msg);
  }
  const order = (state.data.people || []).map((p) => p.id);
  const rank = (key) => (order.includes(key) ? order.indexOf(key) : order.length);
  const keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b));
  return h('div', { class: 'groups' }, keys.map((key) => {
    const person = state.idx.people.get(key);
    const list = groups.get(key);
    const channels = [...new Set(list.map((m) => m.source))];
    const headingId = `group-${key || 'unknown'}`;
    return h('section', { class: 'group', 'aria-labelledby': headingId },
      h('div', { class: 'group-head' },
        h('div', { class: 'group-who' },
          h('h3', { class: 'group-title', id: headingId, text: personLabel(person) }),
          person?.relation ? h('span', { class: 'group-relation', text: person.relation }) : null,
          person?.org ? h('span', { class: 'group-org', text: person.org }) : null),
        h('div', { class: 'group-channels' },
          h('span', { class: 'visually-hidden', text: '쓴 채널:' }),
          channels.map(sourceBadge),
          h('span', { class: 'group-count', text: `${list.length}개` }))),
      renderRows(list));
  }));
}

// ---------- 탭3: 통화·회의 점검 ----------

function renderChecks() {
  const checks = Array.isArray(state.data.checks) ? state.data.checks : [];
  $('panel-checks').replaceChildren(
    h('div', { class: 'panel-head' },
      h('h2', { text: '통화·회의 점검' }),
      h('p', { class: 'panel-sub', text: '녹음과 회의록을 다시 듣지 않아도 정해진 것, 빈칸, 내 약속을 볼 수 있어요.' })),
    checks.length
      ? h('div', { class: 'checks' }, checks.map(renderCheckCard))
      : h('p', { class: 'empty', text: '점검할 통화·회의가 없어요.' }),
    renderPasteBox(),
  );
}

function checkBlock(title, cls, items) {
  return h('section', { class: `check-block ${cls}` },
    h('h4', { text: title }),
    items.length ? h('ul', {}, items) : h('p', { class: 'empty', text: '없음' }));
}

function renderCheckCard(check) {
  const where = `점검 ${check.messageId}`;
  const msg = getMessage(check.messageId, where);
  const text = (list) => (Array.isArray(list) ? list : []).map((x) => h('li', { text: x }));
  const promises = (check.myPromises || []).map((p) => h('li', {},
    h('span', { text: p.text || '' }), ' ', h('span', { class: 'due', text: p.due || '기한 없음' })));
  const links = (check.links || []).map((link) => {
    const target = getMessage(link.messageId, `${where} 연결`);
    if (!target) return null;
    const person = state.idx.people.get(target.personId);
    const label = `${sourceLabel(target.source)} · ${formatTime(target.time)}`;
    return h('li', { class: 'link-item' },
      h('button', {
        type: 'button',
        class: 'chip chip-evidence',
        'aria-label': `연결된 연락 보기: ${label}${person ? ` · ${personLabel(person)}` : ''}`,
        onclick: (event) => openMessage(target.id, null, event.currentTarget),
      }, h('span', { class: `dot dot-${sourceKind(target.source)} dot-${target.source}`, 'aria-hidden': 'true' }), label),
      h('span', { class: 'link-note', text: link.note || '' }));
  }).filter(Boolean);

  return h('article', { class: 'card check-card' },
    h('div', { class: 'check-head' },
      msg ? sourceBadge(msg.source) : null,
      h('h3', { class: 'check-title', text: check.title || '' }),
      msg ? h('button', { type: 'button', class: 'btn btn-small', onclick: (event) => openMessage(msg.id, null, event.currentTarget) }, '원문 보기') : null),
    h('div', { class: 'check-grid' },
      checkBlock('정해진 것', 'is-decided', text(check.decided)),
      checkBlock('안 정해진 것', 'is-undecided', text(check.undecided)),
      checkBlock('내 약속(기한)', 'is-promises', promises),
      checkBlock('상대 요청', 'is-requests', text(check.theirRequests))),
    links.length
      ? h('div', { class: 'check-links' }, h('h4', { text: '연결' }), h('ul', { class: 'link-list' }, links))
      : null);
}

function renderPasteBox() {
  const textarea = h('textarea', {
    id: 'paste-input',
    class: 'paste-input',
    rows: '9',
    spellcheck: 'false',
    placeholder: '예) 나: 금요일까지 보내드릴게요\n상대: 장소는 아직 미정이에요',
  });
  const status = h('p', { class: 'paste-status', role: 'status', 'aria-live': 'polite' });
  const results = h('div', { class: 'paste-results', 'aria-label': '점검 결과' },
    h('p', { class: 'paste-placeholder', text: '점검 결과가 여기에 나와요: 내 약속, 상대 약속, 질문, 미정, 날짜·시각.' }));
  const runButton = h('button', {
    type: 'button',
    class: 'btn btn-primary',
    onclick: () => runPasteCheck(textarea, status, results),
  }, '점검');
  const sampleButton = h('button', {
    type: 'button',
    class: 'btn',
    onclick: () => {
      textarea.value = state.data.pasteSample || '';
      textarea.focus();
    },
  }, '예시 넣기');
  if (!state.data.pasteSample) sampleButton.disabled = true;
  if (!state.analyzeText) {
    runButton.disabled = true;
    status.textContent = ENGINE_ERROR_TEXT;
    status.classList.add('is-error');
  }

  return h('section', { class: 'paste card', 'aria-labelledby': 'paste-title' },
    h('h3', { class: 'paste-title', id: 'paste-title', text: '직접 붙여넣어 점검하기' }),
    h('p', { class: 'paste-note' },
      h('span', { class: 'lock', 'aria-hidden': 'true' }),
      '입력한 내용은 이 브라우저 밖으로 나가지 않아요'),
    h('div', { class: 'paste-grid' },
      h('div', { class: 'paste-form' },
        h('label', { class: 'field-label', for: 'paste-input', text: '통화·회의 전사 (한 줄에 "화자: 내용")' }),
        textarea,
        h('div', { class: 'paste-actions' }, sampleButton, runButton),
        status),
      results));
}

function speakerLine(entry, extra) {
  return h('li', {},
    entry.speaker ? h('span', { class: 'speaker', text: entry.speaker }) : null,
    h('span', { text: entry.text || '' }),
    extra ? h('span', { class: 'due', text: extra }) : null);
}

function resultBlock(title, cls, items) {
  return h('section', { class: `result-block ${cls}` },
    h('h4', {}, title, h('span', { class: 'result-count', text: String(items.length) })),
    items.length ? h('ul', {}, items) : h('p', { class: 'empty', text: '찾은 것 없음' }));
}

function runPasteCheck(textarea, status, results) {
  status.classList.remove('is-error');
  if (!textarea.value.trim()) {
    status.textContent = EMPTY_PASTE_TEXT;
    status.classList.add('is-error');
    textarea.focus();
    return;
  }
  if (!state.analyzeText) {
    status.textContent = ENGINE_ERROR_TEXT;
    status.classList.add('is-error');
    return;
  }
  let out;
  try {
    out = state.analyzeText(textarea.value) || {};
  } catch (err) {
    console.error('[집중력 비서] 점검하다가 문제가 생겼어요:', err);
    status.textContent = '점검하다가 문제가 생겼어요. 내용을 조금 줄여서 다시 해 보세요.';
    status.classList.add('is-error');
    return;
  }
  const promises = Array.isArray(out.promises) ? out.promises : [];
  const questions = Array.isArray(out.questions) ? out.questions : [];
  const undecided = Array.isArray(out.undecided) ? out.undecided : [];
  const dates = Array.isArray(out.dates) ? out.dates : [];
  const mine = promises.filter((p) => p.mine);
  const theirs = promises.filter((p) => !p.mine);
  results.replaceChildren(
    resultBlock('내 약속', 'is-mine', mine.map((p) => speakerLine(p, p.due || '기한 없음'))),
    resultBlock('상대 약속', 'is-theirs', theirs.map((p) => speakerLine(p, p.due || '기한 없음'))),
    resultBlock('질문', 'is-questions', questions.map((q) => speakerLine(q))),
    resultBlock('미정', 'is-undecided', undecided.map((u) => speakerLine(u))),
    resultBlock('날짜·시각', 'is-dates', dates.map((d) => h('li', { class: 'date-chip', text: d }))),
  );
  status.textContent = `내 약속 ${mine.length} · 상대 약속 ${theirs.length} · 질문 ${questions.length} · 미정 ${undecided.length} · 날짜·시각 ${dates.length}개를 찾았어요.`;
}

// ---------- 오류 화면 ----------

function renderLoadError(err) {
  console.error(`[집중력 비서] ${LOAD_ERROR_TEXT}:`, err);
  $('tabs').hidden = true;
  for (const id of ['panel-today', 'panel-inbox', 'panel-checks']) $(id).hidden = true;
  const box = $('load-error');
  box.replaceChildren(
    h('h2', { text: LOAD_ERROR_TEXT }),
    h('p', { class: 'load-error-cmd' }, '예: ', h('code', { text: 'python3 -m http.server 8000 --bind 127.0.0.1' })),
  );
  box.hidden = false;
}

// 한 영역이 데이터 문제로 실패해도 나머지는 그린다.
function safeRender(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[집중력 비서] ${name}을(를) 그리지 못했어요:`, err);
  }
}

async function main() {
  setupTabs();
  setupDialog();
  const [loaded, analyzeText] = await Promise.all([
    loadData(getDataUrl()).then((data) => ({ data }), (error) => ({ error })),
    loadEngine(),
  ]);
  if (loaded.error) {
    renderLoadError(loaded.error);
    return;
  }
  state.data = loaded.data;
  state.idx = buildIndex(loaded.data);
  state.analyzeText = analyzeText;
  safeRender('상단', renderHeader);
  safeRender('오늘의 한 장', renderOnePage);
  safeRender('흩어진 연락', renderInbox);
  safeRender('통화·회의 점검', renderChecks);
  document.body.classList.add('is-ready');
}

main();
