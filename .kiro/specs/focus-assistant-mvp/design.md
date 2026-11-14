# 설계: 집중력 비서 MVP

## 개요
빌드 도구 없는 정적 웹앱이다. `index.html`이 `src/app.js`(ES 모듈)를 불러오고, `app.js`가 `data/demo.json`을 fetch 해서 화면 세 개를 그린다. 붙여넣기 점검은 `src/engine.js`의 순수 함수가 브라우저 안에서 처리한다. 분석 결과(오늘의 한 장, 초안, 점검)는 Kiro가 `.kiro/steering/assistant-rules.md` 규칙으로 샘플 연락을 분석해 `demo.json`에 저장한 것이다.

```
[메일 4종 · 카톡 · 슬랙 · 에이닷 · 회의록]  →  data/demo.json (messages)
                                              │  Kiro 분석 (assistant-rules.md)
                                              ▼
                       data/demo.json (onePage · drafts · checks)
                                              │ fetch
                                              ▼
 index.html ─ src/app.js ─┬─ 탭1 오늘의 한 장 (카드 · 근거 · 초안)
                          ├─ 탭2 흩어진 연락 (출처 필터 · 사람별 보기)
                          └─ 탭3 통화·회의 점검 (샘플 점검 + 붙여넣기 → src/engine.js)
```

## 화면
상단: 서비스 이름 "집중력 비서", 한 줄 소개, 인물·날짜, 집중력 막대(오늘 항목 cost 합계 / persona.focusBudget). 그 아래 탭 버튼 3개(오늘의 한 장 / 흩어진 연락 N / 통화·회의 점검). 기본 탭은 오늘의 한 장. 맨 아래에 "모든 인물·기관·내용은 가상" 안내(meta.note).

### 탭1 오늘의 한 장
- `onePage.headline`을 제목으로 쓴다.
- 카드 정렬: `urgent: true` 먼저, 그다음 weight 순서 `2min` → `think` → `later`.
- 카드 내용: 유형 배지(충돌·잊힌 약속·답 안 한 질문·빈칸), `바로` 배지(urgent), 제목, 조언 문장, 관련 인물 이름·직함, 무게 칩("2분 · 집중력 5"), 근거 칩("출처 라벨 · 11/13 09:12"), `답장 초안` 버튼(draftIds가 있을 때).
- 근거 칩을 누르면 대화상자(`<dialog>`)에 원문 전체(출처, 사람, 시각, 제목, 본문)를 보여준다. 인용 문장(quote)이 본문에 있으면 `<mark>`로 강조한다.
- `답장 초안`을 누르면 카드 아래에 초안 패널이 열린다: `정중하게`/`간결하게` 전환 버튼, 받는 사람·채널, 제목(메일), 본문, "왜 이 말투인지", `복사` 버튼. 복사 후 "복사했어요. 원래 앱에서 보내세요" 알림(aria-live).
- 카드 아래에 "오늘은 넘겨도 되는 것"(`onePage.later`) 목록: 원문 요약 한 줄 + 이유.

### 탭2 흩어진 연락
- 출처 필터 칩(전체 + 실제 등장하는 출처, 개수 표시). 
- `사람별로 보기` 토글: 켜면 personId로 묶고 묶음 제목에 이름·직함·관계, 묶음 안 채널 배지 목록을 보여준다.
- 연락 한 줄: 출처 배지, 사람 이름, 시각, 제목 또는 본문 첫 줄. 누르면 펼쳐서 본문 전체. `direction: "out"`은 "내가 보냄" 표시.

### 탭3 통화·회의 점검
- `checks`마다 카드: 제목, 네 목록(정해진 것 / 안 정해진 것 / 내 약속(기한) / 상대 요청), 연결(다른 연락으로 가는 칩 + 설명).
- 그 아래 "직접 붙여넣어 점검하기": `<textarea>`, `예시 넣기` 버튼(샘플 통화 전사 텍스트를 채움), `점검` 버튼. 결과는 내 약속 / 상대 약속 / 질문 / 미정 / 날짜·시각 다섯 목록. 빈 입력이면 "점검할 내용을 붙여넣어 주세요". "입력한 내용은 이 브라우저 밖으로 나가지 않아요" 안내.

### 색과 배지 (색만으로 구분하지 않고 글자도 함께)
| 유형 | 글자 | 색 계열 |
|---|---|---|
| conflict | 충돌 | 빨강 |
| promise | 잊힌 약속 | 주황 |
| unanswered | 답 안 한 질문 | 파랑 |
| gap | 빈칸 | 보라 |

출처 배지: 메일(gmail·naver·naverworks·outlook)은 회색 계열, 메신저(kakao·slack)는 노랑·자주, 통화(adot)는 초록, 회의록(clova·tiro·daglo)은 청록. 배지 글자는 `sources[key].label`.

## 데이터 구조: `data/demo.json`
```json
{
  "meta": { "title": "집중력 비서 데모", "date": "2026-11-13", "note": "모든 인물·기관·내용은 가상입니다. 분석 결과는 Kiro가 .kiro/steering/assistant-rules.md 규칙으로 만들었습니다." },
  "persona": { "name": "한지우", "role": "대학원 석사과정, 연구실 산학과제 실무 담당", "focusBudget": 100 },
  "sources": {
    "gmail": { "label": "Gmail", "kind": "mail" },
    "naver": { "label": "네이버 메일", "kind": "mail" },
    "naverworks": { "label": "네이버웍스", "kind": "mail" },
    "outlook": { "label": "아웃룩", "kind": "mail" },
    "kakao": { "label": "카카오톡", "kind": "chat" },
    "slack": { "label": "슬랙", "kind": "chat" },
    "adot": { "label": "에이닷 통화", "kind": "call" },
    "clova": { "label": "클로바노트", "kind": "meeting" },
    "tiro": { "label": "Tiro", "kind": "meeting" },
    "daglo": { "label": "다글로", "kind": "meeting" }
  },
  "people": [
    { "id": "p-prof", "name": "오상훈", "title": "교수", "org": "OO대 바이오정보연구실", "relation": "지도교수", "tone": "격식체, 결론 먼저, 짧게" }
  ],
  "messages": [
    { "id": "m01", "source": "outlook", "personId": "p-prof", "direction": "in", "time": "2026-11-13T08:40", "subject": "메일일 때만", "text": "본문. 통화·회의는 '화자: 내용' 줄로 된 전사", "thread": "같은 일 묶음 키(선택)" }
  ],
  "onePage": {
    "headline": "오늘 결정할 것 5개 · 예상 집중력 55 / 100",
    "items": [
      {
        "id": "i1",
        "type": "conflict",
        "personIds": ["p-prof"],
        "title": "짧은 제목",
        "advice": "무슨 일 → 왜 문제 → 무엇을 하면 되는지",
        "weight": "2min",
        "cost": 5,
        "urgent": true,
        "evidence": [ { "messageId": "m01", "quote": "원문에 그대로 있는 짧은 인용" } ],
        "draftIds": ["d1a", "d1b"]
      }
    ],
    "later": [ { "messageId": "m12", "reason": "참고용 공지, 답장 불필요" } ]
  },
  "drafts": [
    { "id": "d1a", "itemId": "i1", "to": "p-prof", "channel": "outlook", "style": "정중하게", "subject": "메일일 때만", "text": "초안 본문", "why": "왜 이 말투인지 한 줄" }
  ],
  "checks": [
    {
      "messageId": "m05",
      "title": "에이닷 통화 · 이름 직함 · 14:10",
      "decided": ["정해진 것"],
      "undecided": ["안 정해진 것"],
      "myPromises": [ { "text": "내가 한 약속", "due": "기한 또는 '기한 없음'" } ],
      "theirRequests": ["상대 요청"],
      "links": [ { "messageId": "m09", "note": "이 통화와 어떻게 이어지는지" } ]
    }
  ],
  "pasteSample": "예시 넣기 버튼이 채울 통화 전사 (화자: 내용 줄)"
}
```
규칙: `weight`는 `2min | think | later`, `type`은 `conflict | promise | unanswered | gap`, `style`은 `정중하게 | 간결하게`, `direction`은 `in | out`. 모든 `messageId`·`personId`·`draftIds`·`to`는 실제로 있는 id를 가리킨다. `quote`는 해당 메시지 `text`에 그대로 들어 있는 문자열이다.

## 엔진: `src/engine.js`
```js
export function parseLine(line)            // "[00:12] 나: 내용" → { speaker: "나", text: "내용" }, 화자 없으면 speaker: null
export function findDates(text)            // 날짜·요일·시각 표현 배열(등장 순, 중복 제거)
export function analyzeText(text, { me = ["나", "저", "본인"] } = {})
// → {
//   promises:  [{ speaker, mine, text, due }],  // 약속 어미: 드릴게요·드리겠습니다·할게요·하겠습니다·보낼게요·공유할게요 등
//   questions: [{ speaker, text }],             // 물음표 또는 의문 어미: ~나요 ~까요 ~ㄹ까요 ~습니까 ~세요?
//   undecided: [{ speaker, text }],             // 미정·추후·나중에·다시 정·확인 후·정해지면·아직
//   dates:     [string]                          // findDates(text)
// }
```
- 문장 단위: 줄을 나눈 뒤 `.`, `?`, `!`, `요.` 기준으로 문장을 나눈다.
- `due`: 그 문장 안의 첫 날짜·시각 표현, 없으면 `"기한 없음"`.
- 날짜·시각 표현: 오늘(중)·내일·모레·이번 주/다음 주 + 요일, 요일, `N월 N일`, `N/N`, `N일까지`, 오전/오후 + `N시(반|N분)`, `N시`, 퇴근 전·점심 전.
- DOM·네트워크 접근 없음. Node `node --test`와 브라우저에서 같은 파일을 import 한다.

## 오류 처리
- `demo.json`을 못 불러오면 화면에 "데이터를 불러오지 못했어요. 로컬에서는 python3 -m http.server로 열어 주세요"를 보여준다.
- 데이터에서 id가 가리키는 대상이 없으면 그 칩만 숨기고 콘솔에 경고한다.
- 클립보드 API가 없으면 초안 텍스트를 선택 상태로 만들고 "Ctrl/Cmd+C로 복사하세요"라고 알린다.

## 테스트 전략
- `tests/engine.test.js`(node:test): 화자 파싱, 타임스탬프 제거, 내 약속/상대 약속 구분, 기한 추출, 질문, 미정, 날짜 중복 제거, 빈 입력.
- `demo.json` 정합성: 모든 참조 id가 존재하는지, 모든 quote가 원문에 있는지 확인하는 테스트(`tests/data.test.js`).
- 화면: 배포 주소에서 세 탭, 근거 대화상자, 초안 복사, 붙여넣기 점검을 직접 눌러 확인한다.
