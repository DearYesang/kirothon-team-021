# BUILD REPORT

1인 팀(오픈랩, 예성철)이 Kiro Crew 대시보드에서 Kiro CLI를 대화로 움직여 기획부터 배포까지 진행했습니다. 아래 시각은 모두 2026년 11월 14일(KST)입니다.

## Kiro 활용 내역

| 단계 | 사용한 Kiro 기능 | 무엇을 했는지 | 결과물 위치 |
|---|---|---|---|
| 기획 | Kiro CLI 기획 대화 + 웹 검색 | 16:07 참가자의 페인 포인트 5개(메일 말투, 메신저 말투, 통화 녹음 점검, AI 회의록 연계, 복합 조언)를 기능과 원칙으로 구체화했습니다. "시간이 아니라 집중력을 아낀다", 집중력이 새는 네 곳, 초안까지만 쓰기, 모든 조언에 근거 원문 붙이기를 원칙으로 정했습니다. 웹 검색으로 서비스별 연결 가능성(네이버 메일 IMAP, 네이버웍스 요금제, 슬랙 MCP 관리자 승인, Tiro MCP, 클로바노트 파일 다운로드)을 확인했습니다. | `.kiro/steering/product.md`, `README.md`의 '기존 방식과 한계' |
| 기획 | Kiro CLI 재계획 | 16:20 해커톤 규칙(공개 레포, 데모 주소, 18:00 마감)을 반영해 범위를 다시 잡았습니다. 개인 맥 비서 → 공개 웹앱 + 가상 샘플 데이터. | `.kiro/specs/focus-assistant-mvp/tasks.md` 작업 1 |
| 기획 | Spec (requirements) | 사용자 스토리 5개(한 화면에 모으기, 오늘의 한 장, 답장 초안과 말투 이유, 통화·회의 점검, 신뢰와 안전)와 EARS 형식(WHEN / IF / THE SYSTEM SHALL) 인수 조건 22개를 썼습니다. | `.kiro/specs/focus-assistant-mvp/requirements.md` |
| 설계 | Spec (design) | 화면 구성(탭 3개, 카드, 근거 원문 창, 초안 패널), `data/demo.json` 데이터 구조와 id 참조 규칙, 붙여넣기 점검 엔진의 함수(`parseLine`, `findDates`, `analyzeText`), 오류 처리, 테스트 전략을 정했습니다. | `.kiro/specs/focus-assistant-mvp/design.md` |
| 설계 | Steering (`inclusion: always`) | 모든 작업에 항상 들어가는 기준 세 개를 썼습니다. product(제품 원칙과 MVP 범위), tech(빌드 도구 없는 정적 웹앱, 의존성 없음, 비밀 정보 금지, 접근성), structure(폴더 구조, 파일 하나는 한 작업자만 고침). | `.kiro/steering/product.md`, `.kiro/steering/tech.md`, `.kiro/steering/structure.md` |
| 설계 | Steering (`inclusion: fileMatch`) | 비서 판단 규칙을 썼습니다. 장부 세 개(사람·약속·일), 조언 네 유형(충돌·잊힌 약속·답 안 한 질문·빈칸), 집중력 무게(2분·생각 필요·나중, 하루 예산 100), 말투 규칙, 하지 않는 것. `fileMatchPattern: "data/*.json"`으로 샘플 데이터를 만들 때만 적용되게 했습니다. 다음 단계에서 AI 모델을 붙일 때 그대로 프롬프트로 씁니다. | `.kiro/steering/assistant-rules.md` |
| 구현 | Spec (tasks) | 작업 8개(문제 정의, Steering, 레포·배포, 샘플 데이터, 엔진, 화면, 문서·발표자료, 통합·제출)로 나누고 하위 작업과 요구사항 번호를 연결해 체크박스로 진행을 관리했습니다. | `.kiro/specs/focus-assistant-mvp/tasks.md` |
| 구현 | Kiro CLI + gh CLI | 16:29 템플릿에서 Public 레포를 만들고 GitHub Pages를 켰습니다. `package.json`에 `npm test` 스크립트를 넣었습니다. | [GitHub 레포](https://github.com/DearYesang/kirothon-team-021), [Demo](https://dearyesang.github.io/kirothon-team-021/), `package.json` |
| 구현 | Kiro Crew 보조 에이전트 4개 병렬 실행 | 16:50 화면, 샘플 데이터·분석, 엔진·테스트, 문서·발표자료를 동시에 맡겼습니다. spec과 steering을 계약으로 삼고 파일 소유를 나눠 서로 같은 파일을 고치지 않게 했습니다. | 화면: `index.html`, `src/app.js`, `src/styles.css` / 데이터: `data/demo.json` / 엔진: `src/engine.js`, `tests/` / 문서: `README.md`, `BUILD_REPORT.md`, `slides/`, `PRESENTATION.pdf` |
| 구현 | Steering 적용 (assistant-rules.md) | 가상 인물 한지우의 하루치 연락을 만들고, 판단 규칙대로 오늘의 한 장, 답장 초안(정중하게·간결하게), 통화·회의 점검 결과를 작성했습니다. | `data/demo.json` |
| 검증 | Hooks (`fileEdited`) | 저장할 때 자동으로 도는 점검 세 개를 만들었습니다. 비밀 정보 점검(`**/*.js`, `**/*.json`, `**/*.html`, `**/*.md`, `**/*.css` 저장 시 API 키·비밀번호·실제 연락처 확인), 샘플 데이터 정합성 점검(`data/*.json` 저장 시 id 참조·인용 문장·초안 개수·합계 확인 후 `npm test`), 엔진 테스트 실행(`src/engine.js`, `tests/**/*.js` 저장 시 `npm test`). | `.kiro/hooks/secret-guard.kiro.hook`, `.kiro/hooks/demo-data-check.kiro.hook`, `.kiro/hooks/engine-test.kiro.hook` |
| 검증 | Hooks (`userTriggered`) | 제출 직전에 직접 실행하는 점검을 만들었습니다. README에 템플릿 주석만 남은 섹션, Demo 줄, BUILD_REPORT 표, `PRESENTATION.pdf`, 비밀 정보와 영상 파일, `npm test`, `git status`를 한 번에 확인합니다. | `.kiro/hooks/pre-submit-check.kiro.hook` |
| 검증 | node:test, headless Chromium | `npm test`로 엔진과 샘플 데이터를 확인하고, headless Chromium으로 화면을 캡처해 직접 봤습니다. 부모 에이전트가 보조 에이전트들의 결과를 합치고 커밋했습니다. | `tests/`, `package.json` |
| 기타 | Kiro Crew 대시보드에서 Kiro CLI 구동, headless Chromium | 발표자료를 HTML로 쓰고 headless Chromium으로 PDF로 내보냈습니다. 슬라이드 한 장에 한 가지 내용만 담았고, 로컬 서버(127.0.0.1)로 띄운 앱 첫 화면을 캡처해 데모 슬라이드에 넣었습니다. | `slides/index.html`, `slides/app.png`, `PRESENTATION.pdf` |

## 개발 과정에서 바뀐 점

- **처음 계획:** 참가자의 맥에 있는 메일 앱과 폴더를 직접 연결해, 실제 메일·메신저·통화 기록을 읽는 개인 비서를 만들려고 했습니다.
- **바꾼 계획:** 공개 웹앱 + 가상 인물의 하루치 샘플 데이터로 바꿨습니다. 실제 계정 연결은 다음 단계로 미뤘습니다.
- **이유:**
  1. 해커톤 규칙상 레포가 공개여야 하고, 심사자가 열어 볼 데모 주소가 필요하며, 마감이 18:00입니다.
  2. 실제 메일과 메신저를 데모에 쓰면 다른 사람의 개인 정보가 공개 레포에 올라갈 위험이 있습니다.
- **그래도 지킨 것:** 분석 기준은 `.kiro/steering/assistant-rules.md` 하나로 고정했습니다. 지금은 Kiro가 이 규칙으로 샘플 데이터를 분석했고, 실제 연결 뒤에도 같은 문서를 AI 모델의 프롬프트로 씁니다. 그래서 데모에서 본 조언의 기준이 실제 서비스에서도 그대로 이어집니다.

## 어려웠던 점과 해결 방법

| 어려웠던 점 | 해결 방법 |
|---|---|
| 카카오톡은 외부 프로그램이 대화를 읽는 공식 통로가 없고, 슬랙 공식 MCP 연결은 워크스페이스 관리자의 앱 승인이 필요해 자동 연결을 만들 수 없었습니다. | 데모는 샘플 데이터로 보여 주고, 사용자가 직접 가져올 수 있는 '붙여넣기 점검'(`src/engine.js`, 브라우저 안에서만 동작)을 넣었습니다. 다음 단계로 카카오톡 '대화 내용 내보내기' 파일 가져오기를 계획했습니다. |
| 커밋 서명 키에 비밀번호가 걸려 있어 Kiro의 커밋이 실패했습니다. | 사용자 승인을 받고 이 레포에서만 서명 없이 커밋하도록 했습니다. 전역 git 설정은 그대로 두었습니다. |
| 해커톤 안내 Notion 페이지가 자바스크립트로 그려지는 페이지라 Kiro가 내용을 읽어 오지 못했습니다. | 참가자가 붙여 준 규칙과 레포의 `SUBMISSION_GUIDE.md`를 기준으로 삼았고, 그 조건을 제출 전 점검 hook(`.kiro/hooks/pre-submit-check.kiro.hook`)에 넣었습니다. |
| 마감까지 짧은 시간 안에 화면, 데이터, 엔진, 문서를 모두 만들어야 했습니다. | Kiro Crew 보조 에이전트 4개를 병렬로 돌리고, spec과 steering을 공통 계약으로, `structure.md`의 "파일 하나는 한 작업자만" 규칙으로 충돌을 막았습니다. |
