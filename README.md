# TEACHMi

AI 학생에게 개념을 설명하면서 배우는 모바일 웹 서비스.

## 기술 스택

- React + Vite (JavaScript)
- CSS Modules
- React Router

## 시작하기

Node.js 설치

```bash
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
npm run dev
```

터미널에 표시되는 주소(보통 `http://localhost:5173`)를 브라우저에서 엶.

## 환경 변수

| 이름               | 설명                                     |
| ------------------ | ---------------------------------------- |
| `API_PROXY_TARGET` | 개발 중 `/api` 요청을 전달할 백엔드 주소 |

프론트엔드는 API를 `/api/v1`로 호출.

## 명령어

| 명령어            | 설명                |
| ----------------- | ------------------- |
| `npm run dev`     | 개발 서버 실행      |
| `npm run build`   | 배포용 빌드         |
| `npm run lint`    | 코드 규칙 검사      |
| `npm test`        | 대체 API 회귀 테스트 |
| `npm run preview` | 빌드 결과 미리 보기 |

## 폴더 구조

```text
public/            그대로 배포되는 파일 (파비콘 등)
src/
  assets/          아이콘, 캐릭터 이미지
  components/      여러 화면에서 함께 쓰는 컴포넌트
  hooks/           공통 React 훅
  pages/           화면 단위 컴포넌트
  styles/          디자인 토큰과 전역 스타일
  App.jsx          화면 경로(라우팅) 설정
  main.jsx         앱 시작 지점
```

## AI 생성 오류와 상태 복원

모드 선택·요약 페이지는 라우터에 남은 옛 상태만 신뢰하지 않고 현재 학습을 GET으로 확인합니다. 생성 중에는 중복 실행을 즉시 차단하고 시작·모드 변경 버튼을 잠급니다.

- `review_required` / `AI_GENERATION_UNCERTAIN`, `limit_reached` / `AI_ATTEMPT_LIMIT`, `check_configuration`은 재생성·모드 변경을 차단합니다. 기다리거나 새 요청 키로 해제하지 않습니다.
- `wait`, 통신 오류 또는 분류되지 않은 서버 오류도 자동 생성하지 않습니다. '저장 상태 확인' 버튼은 GET만 수행합니다. 기존 terminal 오류는 GET 결과에 recovery가 없다는 이유만으로 해제하지 않습니다.
- 명시적으로 재전송할 수 있는 같은 작업에는 기존 Idempotency-Key를 유지합니다. 네트워크 실패 뒤에는 먼저 저장 상태를 확인합니다.
- 서버가 응답한 UUID `X-Teachmi-Request-Id`를 문의 번호로 표시하며, 재접속으로 원래 문의 번호를 잃었을 때도 본인 세션의 학습 번호를 표시합니다. 구버전 서버에 헤더가 없어도 오류 처리는 동작합니다. 원문·답변·쿠키·키를 문의 문구에 넣지 않습니다.
- 요약/첫 질문 준비 단계에서는 아직 사용자 설명이 없을 수 있으므로 '답변이 저장됐다'고 단정하지 않습니다.

`npm test`는 실제 운영 API·Gemini를 호출하지 않는 대체 API와 DOM 테스트입니다. 빠른 중복 클릭, terminal 오류 직후/재접속의 버튼 잠금, 저장 상태 GET, 같은 키 유지, 잘못된 문의 헤더를 검증합니다. CI에서는 테스트·lint·빌드를 실행합니다. 실제 브라우저와 실모델 검증은 별도이며 이 변경에 배포·Gemini 호출은 포함하지 않습니다.

백엔드 읽기 전용 원장 확인·제한 설정·문의 헤더는 [동반 백엔드 PR #60](https://github.com/RTAman/TEACHMi/pull/60)과 [타임아웃 대응 문서](https://github.com/RTAman/TEACHMi/blob/fix/b-gemini-timeout-observability/backend/GEMINI_TIMEOUT_RECOVERY.md)를 참고합니다. 구버전 백엔드에 문의 헤더가 없어도 생성 차단과 학습 번호 표시는 동작합니다.

## 사용자 확인 후 동일 답안 재채점

문제 풀이 페이지는 현재 세션과 `GET /sessions/{id}/grading-recovery`를 먼저 조회합니다. 미채점 답안이 있으면 원래 문제·답안·풀이·요청 키를 복원하고 일반 제출과 답안 편집을 잠급니다. 조회만으로 AI를 호출하거나 동의하지 않습니다.

- 서버가 `retry_available`을 반환한 경우 **동일 답안 재채점** → 추가 AI 사용량 가능성 안내 → **확인하고 1회 재채점** 순서로 진행합니다. 운영자 승인은 필요하지 않습니다.
- 확인 버튼은 먼저 `POST .../grading-recovery/consent`로 동의를 기록한 뒤, 원래 답안/풀이(공백 포함)와 Idempotency-Key로 기존 C 답안 제출 API를 호출합니다. `X-Teachmi-Recovery-Authorization`에 동의 ID를 전달합니다. 새로운 시도 ID나 요청 키를 만들지 않습니다.
- 연속 클릭은 즉시 차단합니다. 502·503·통신 실패 후 자동 재전송하지 않습니다. **저장 상태 확인**은 GET만 수행합니다. 이미 실행한 추가 호출이 실패했으면 더 재시도할 수 없습니다.
- `result_available`/`completed`에서는 사용자가 **저장된 채점 복원**을 선택해 기존 캐시/판정을 복원합니다. 이 경로는 새 AI 호출을 허용하지 않습니다. correct/wrong/pending_review는 서버 결과대로 표시합니다.
- 이 기능은 **C의 저장된 미채점 답안만** 대상으로 합니다. B 최초 질문이나 C 문제 생성의 보류를 일괄 해제하지 않습니다. 기존 사용량·Google 한도를 초기화하지 않으며, 재시도 성공을 보장하지 않습니다.
- 백엔드의 추가 복구 API·Flyway V15를 먼저 배포해야 합니다. 새 상태 조회 실패 시 생성 버튼을 잠그고 수동 상태 확인을 제공합니다. 배포 순서는 백엔드 정상 기동 확인 → 프론트엔드입니다.

## 디자인 규칙

- 색상과 라디우스는 `src/styles/tokens.css`의 변수를 사용.
- 화면 기준 크기는 390×844.
