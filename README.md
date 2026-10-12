# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다(2단계부터는 `/data.json`이 404입니다. 아래 「2단계 저장점」 참고). 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다(1단계). 2단계부터는 `/data.json`이 닫혔는지와 `/api/notes`의 비로그인 응답 건수를 확인합니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 2단계 저장점: 자료를 코드 밖으로 옮김

기록일 2026-10-12. 이 시점에 실제로 한 일과 확인한 결과만 적습니다.

### 현재 작동하는 기능

- `data.json`과 `public/data.json`은 저장소에서 지웠고 `/data.json`은 404입니다. 정적 응답(`/data.json`, `/aleph.json`)에는 시작 틀 확인 표시를 넣지 않습니다.
- `/` 화면은 서버 함수 `/api/notes`를 불러 메모 카드를 그립니다. `api/notes.js`는 Vercel 환경변수 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`로 DB를 읽습니다. 키 값은 Vercel의 비밀 입력란에만 넣고 Git에는 넣지 않습니다. 두 환경변수를 넣고 다시 배포하기 전에는 `/api/notes`가 503을 돌려주고 화면에 오류 문구가 보입니다.
- 가상 메모 4건을 옮길 학습용 Supabase 테이블 `public.vault_notes`의 SQL을 만들었습니다. `owner_id uuid`(`auth.users` 외래키 없음), RLS 켬, `anon`·`authenticated` 권한 회수로 작성했습니다. 이 SQL에는 메모 본문이 들어 있어 Git에 올리지 않습니다. 같은 내용을 학습용 Supabase 프로젝트에 적용했고, `owner_id`는 uuid·외래키 0개·RLS 켜짐·`anon`/`authenticated` 권한 없음·메모 4건을 조회로 확인했습니다(2026-10-12).
- `aleph.config.json`의 `step`을 2로 올렸고 시작 틀 확인 표시(`sampleMarker`)를 설정에서 뺐습니다. `npm run build`는 더 이상 `data.json`을 복사하지 않고 `public/aleph.json`만 기록합니다.

다시 실행하는 방법: `npm run build -- --local`, `npm run test:r5`, `npm run test:package`, `npm run test:step2`(먼저 `npm ci`로 의존성 설치가 필요합니다).

### 가상 메모 문장 검색 (확인 절차)

메모 본문을 README에 적지 않으려고 패턴으로 검색합니다. 패턴: `실습용 가상 [가-힣]+ 기록`

1. GitHub 최신 파일: `git fetch origin main` 후 `git grep -n -I -E "실습용 가상 [가-힣]+ 기록" origin/main`. 0건이어야 합니다.
2. 현재 배포 파일: 로그인하지 않은 창에서 `https://<실제 배포 주소>/data.json`이 404인지, `/aleph.json`에 `SAMPLE_NOTE`가 없는지 봅니다. 또는 `curl -s https://<실제 배포 주소>/data.json | grep -E "실습용 가상 [가-힣]+ 기록" || echo 없음`을 실행합니다. 메모가 `/api/notes`에서 나오는 것은 정상이며, 이것이 아래 남은 약점입니다. 로그인 화면으로 넘어가면 확인을 마친 것이 아니므로 "확인하지 못함"으로 적습니다.
3. 옛 커밋: `git grep -c -I -E "실습용 가상 [가-힣]+ 기록" 91514d0`. 남아 있는 것이 정상이며, 과거 노출이 남았다는 뜻입니다.

### 검색 결과 (2026-10-12)

- GitHub 최신 파일(`origin/main`, 커밋 `12e25d5` 기준): 0건. 실행함.
- 옛 커밋 `91514d0`: `data.json` 4줄, `public/data.json` 4줄. 실행함. 메모가 남아 있습니다.
- 현재 배포 파일: 확인하지 못함. 배포 주소에 접근하지 못해 실행하지 못했습니다(미실행). 학생이 위 2번으로 확인한 뒤 여기에 기록합니다.

옛 공개 커밋(`91514d0`)과 옛 배포에는 메모가 그대로 남아 있습니다. 옛 커밋과 옛 배포가 남아 있는 한 과거 노출은 해소되지 않았으며, 위의 0건은 최신 파일에 대한 결과일 뿐입니다.

### 공개 API의 남은 약점

- `/api/notes`가 학습용 DB의 메모를 돌려주지만 로그인과 허용 경로 검사가 없습니다. `api/ai.js`, `api/threat-intel.js`는 501을 돌려주는 시작 틀입니다.
- 3단계 로그인(`identityProvider`)과 허용 경로(`allowedRoutes`)를 넣기 전까지 `/api/notes`는 누구나 호출할 수 있습니다. 그때까지는 가상 메모만 둡니다.
- 서버 전용 키는 코드·Git에 넣지 않고 Vercel 환경변수에만 둡니다.
- 배포된 주소에 대한 점검(`/data.json`과 `/api/notes`의 비로그인 요청, `npm run bundle`의 자기 점검)은 이 기록 시점에 실행하지 않았습니다(미실행).
