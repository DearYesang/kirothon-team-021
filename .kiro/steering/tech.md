---
inclusion: always
---
# 기술 기준

- 빌드 도구 없는 정적 웹앱: HTML + CSS + 바닐라 JavaScript(ES 모듈). GitHub Pages에서 그대로 배포한다.
- 외부 라이브러리·CDN·웹폰트 없음. 네트워크 요청은 같은 출처의 `data/demo.json` 하나뿐이다.
- `src/engine.js`는 브라우저와 Node 양쪽에서 import 되는 순수 함수만 둔다. DOM에 접근하지 않는다.
- 테스트는 Node 내장 테스트 러너(`node --test`)를 쓴다. `npm test`로 실행하고 설치할 의존성은 없다.
- 로컬 실행: `python3 -m http.server 8000 --bind 127.0.0.1` 후 http://127.0.0.1:8000 을 연다. (ES 모듈과 fetch 때문에 파일을 더블클릭해서 열면 동작하지 않는다.)
- 비밀 정보 금지: API 키, 비밀번호, 토큰, `.env`, 실제 사람의 연락처나 메시지를 커밋하지 않는다. 샘플 데이터의 인물·기관은 모두 가상이다.
- 글꼴: `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`
- 접근성: 누르는 것은 모두 `<button>`, 배지는 색과 글자를 함께 쓴다, 키보드만으로 모든 기능을 쓸 수 있다, 390px 폭에서도 한 열로 읽힌다.
