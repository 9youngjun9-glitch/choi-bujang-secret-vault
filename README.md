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

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다(1단계). 2단계부터는 `/data.json`이 닫혔는지와 `/api/notes`의 비로그인 응답 건수를 확인합니다. 3단계부터는 로그인 없는 요청과 위조 토큰 요청이 거부되는지 확인하고, 환경변수로 로그인 정보를 주면 정상 A 로그인의 추가·조회·수정·삭제도 보냅니다. 4단계부터는 A·B 로그인 정보를 모두 환경변수로 주면 B가 A의 메모를 읽기·수정·삭제하려 할 때 거부되는지도 확인합니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 2단계 저장점: 자료를 코드 밖으로 옮김

기록일 2026-10-12. 이 시점에 실제로 한 일과 확인한 결과만 적습니다.

> 이 절은 2단계 시점의 기록입니다. `/api/notes`가 로그인 없이 열려 있다는 아래 내용은 3단계에서 바뀌었습니다. 지금 동작은 맨 아래 「3단계 저장점」을 보세요.

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
- 현재 배포 파일: 확인하지 못함. 배포 주소에 접근하지 못해 실행하지 못했습니다(미실행). 학생이 위 2번으로 확인한 뒤 여기에 기록합니다. (2026-10-14 학생이 2단계 제출이 통과했다고 알려 주었습니다. 심판 결과는 포털에서 확인하며, 이 저장소에서 직접 확인한 것은 아닙니다.)

옛 공개 커밋(`91514d0`)과 옛 배포에는 메모가 그대로 남아 있습니다. 옛 커밋과 옛 배포가 남아 있는 한 과거 노출은 해소되지 않았으며, 위의 0건은 최신 파일에 대한 결과일 뿐입니다.

### 공개 API의 남은 약점

- `/api/notes`가 학습용 DB의 메모를 돌려주지만 로그인과 허용 경로 검사가 없습니다. `api/ai.js`, `api/threat-intel.js`는 501을 돌려주는 시작 틀입니다.
- 3단계 로그인(`identityProvider`)과 허용 경로(`allowedRoutes`)를 넣기 전까지 `/api/notes`는 누구나 호출할 수 있습니다. 그때까지는 가상 메모만 둡니다.
- 서버 전용 키는 코드·Git에 넣지 않고 Vercel 환경변수에만 둡니다.
- 배포된 주소에 대한 점검(`/data.json`과 `/api/notes`의 비로그인 요청, `npm run bundle`의 자기 점검)은 이 기록 시점에 실행하지 않았습니다(미실행).

## 3단계 저장점: 진짜 로그인을 붙임

기록일 2026-10-14. 이 시점에 실제로 한 일과 확인한 결과만 적습니다. 실행하지 못한 것은 "미실행"으로 남깁니다.

> 이 절은 3단계 시점의 기록입니다. 아래 「남은 약점」의 소유자 검사 부재와 가상 메모 목록 노출은 4단계에서 바뀌었습니다. 지금 동작은 맨 아래 「4단계 저장점」을 보세요.

### 현재 작동하는 기능

- **화면(`public/index.html`)**: 로그인하기 전에는 이메일·비밀번호 입력칸만 보이고 자료와 메모 영역은 숨겨집니다. 로그인하면 내 이메일, 로그아웃 버튼, 메모 목록, 메모 추가·수정·삭제가 보입니다. 로그아웃하면 화면의 메모가 모두 지워지고 로그인 전 화면으로 돌아갑니다. 로그인 실패는 이유(비밀번호 불일치, 이메일 인증 전, 시도 과다, 네트워크 오류 등)를 화면에 보여 줍니다. Supabase 공식 SDK(`signInWithPassword`, `signOut`, 고정 버전 2.117.2)만 쓰고 비밀번호·JWT를 직접 만들지 않습니다. 화면에는 공개용 프로젝트 주소와 publishable 키만 있고 서버 전용 키는 없습니다.
- **서버 토큰 검사**: `api/notes.js`와 `api/notes/[id].js`는 요청마다 `Authorization: Bearer` 토큰을 틀의 `src/verify-login.mjs`로 검사합니다. 이 도우미는 고치지 않았고 새로 만들지도 않았습니다. 토큰이 없거나 검사에 실패하면 자료 없이 401로 거부합니다. 브라우저가 보낸 `userId`·`role`·`owner_id`는 읽지도 믿지도 않고, 소유자는 검사가 끝난 토큰의 사용자 ID뿐입니다. 서버 환경변수나 설정이 잘못되면 자료 없이 503입니다.
- **메모 API**(응답은 모두 `Cache-Control: no-store`):

  | 요청 | 하는 일 | 정상 응답 |
  |---|---|---|
  | `GET /api/notes` | 로그인한 사용자의 메모 목록 | 200, `[{id,title,body}]` |
  | `POST /api/notes` | 추가. 본문 `{id?,title,body}`. `id`는 UUID이며 없으면 서버가 만듭니다 | 201, `{id}` |
  | `GET /api/notes/:id` | 한 건 조회 | 200, `{id,title,body}` |
  | `PUT /api/notes/:id` | 수정. `title`·`body` 중 보낸 것만 바꿉니다 | 200, `{id,title,body}` |
  | `DELETE /api/notes/:id` | 삭제 | 200, `{id}` (지운 뒤 조회는 404) |

  없는 id는 404, 이미 있는 id로 추가하면 409(덮어쓰지 않음), 입력 오류는 400, 지원하지 않는 메서드는 405입니다. 추가할 때 검사한 사용자 ID가 `owner_id`로 저장됩니다. DB 칸 이름 `content`는 API에서 `body`로 보입니다.
- **목록의 범위**: 로그인한 사용자 자신의 메모와, 주인이 없는(`owner_id` 없음) 실습용 가상 메모 4건이 함께 나옵니다. 가상 메모를 지우지 않고 보존하려는 선택이며, 4단계에서 정리할 수 있습니다.
- **`aleph.config.json`**: `step` 3, 실제 배포 주소 `publicAppUrl`, `identityProvider`(발급자 `…supabase.co/auth/v1`, 대상 `authenticated`, 공개키 주소 `…/.well-known/jwks.json`, 비밀 키 없음), `allowedRoutes`에 위 다섯 경로를 적었습니다. `publicAppUrl`의 호스트는 심판 토큰의 대상(audience)이 되므로 제출한 배포 주소와 같아야 합니다.
- **환경변수**: 새로 필요한 값은 없습니다. 2단계의 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 그대로 씁니다(Vercel 비밀 입력란에만 둡니다).
- 시작 틀의 함수 목록 시험(`test/package-starter.test.mjs`)이 하위 폴더도 세도록 바꾸고 `api/notes/[id].js`를 학생이 추가한 함수로 적었습니다. 운영 측 기준표 `package/baseline-functions.json`은 그대로입니다.

### 다시 실행하는 방법과 사람이 하는 확인

- 시험: 먼저 `npm ci`, 그다음 `npm run build -- --local`, `npm run test:r5`, `npm run test:package`, `npm run test:step2`, `npm run test:step3`.
- 계정: Supabase 대시보드 **Authentication → Users → Add user**에서 A 계정(이메일·비밀번호)을 만들고 **Auto Confirm User**를 켭니다. 비밀번호는 대시보드 입력란에만 쓰고 채팅·Git에 적지 않습니다. 2026-10-14 확인 시점에 이 프로젝트의 계정은 0개였습니다.
- 정상: 시크릿 창에서 배포 주소를 열면 입력칸만 보이고 메모는 없습니다. A로 로그인하면 메모가 보이고 추가·수정·삭제가 됩니다. 로그아웃하면 다시 입력칸만 보입니다.
- 거부되어야 함: 로그인 없이 `https://<배포 주소>/api/notes`를 열면 `{"error":"UNAUTHORIZED"}`(401)이고 메모가 없어야 합니다.
- 제출 묶음의 자기 점검에 정상 A 로그인 흐름까지 넣으려면 터미널에서만 `ALEPH_CHECK_EMAIL`과 `ALEPH_CHECK_PASSWORD`를 주고 `npm run bundle`을 실행합니다. 이 값은 파일에 저장되지 않습니다.

### 확인 기록 (2026-10-14)

실행함:
- 시험 `test:r5` 2건, `test:package` 3건, `test:step2` 2건, `test:step3` 11건 통과.
- 틀의 실제 `src/verify-login.mjs`를 그대로 연결하고 `jose`·`supabase-js`만 가짜로 바꿔 시험: 토큰 없음, 형식 오류, 서명 없는 위조 토큰, 다른 발급자, 대상 불일치, role 불일치, 만료, 심판 발급자 사칭은 모두 401로 자료 없이 거부되었고 정상 A 토큰은 200이었습니다. 추가한 메모의 `owner_id`는 브라우저가 보낸 값이 아니라 토큰의 사용자 ID였습니다.
- 화면을 헤드리스 브라우저로 열고 가짜 SDK로 시험: 로그인 전·후·로그아웃 후 화면 상태 차이, 실패 이유 4종, 추가·수정·삭제, 새로고침 뒤 로그인 유지, 서버 401 뒤 로그인 전 화면 복귀, 스크립트 오류 없음.
- Supabase 조회: `auth.users` 0건, `vault_notes` 4건(모두 `owner_id` 없음). 보안 점검 알림은 `vault_notes`의 "RLS 켜짐·정책 없음" 1건(정보 수준)이며, 서버 키로만 읽게 하려는 의도입니다.

미실행:
- 실제 Supabase SDK와 실제 `jose`·`getClaims`를 쓴 동작. 이 작업 환경에서는 npm 설치와 외부 스크립트 내려받기가 막혀 있어 위의 가짜 대체 시험만 했습니다.
- 배포 결과(빌드 성공 여부, `api/notes/[id].js` 경로 인식, 실제 로그인). Vercel 프로젝트에 접근하지 못해 배포 로그를 읽지 못했습니다.
- 시크릿 창과 A 로그인으로 하는 사람 확인, 심판 판정.
- B 계정이 A의 메모에 접근하는지 확인(4단계에서 기록합니다).

### 남은 약점 (4단계에서 고침)

- **소유자 검사가 없습니다.** 로그인한 B가 A의 메모 id를 알면 `GET`·`PUT`·`DELETE`로 읽고 고치고 지울 수 있습니다. 4단계에서 소유자를 서버에서 확인하게 고칩니다. 이 단계에서 B로 실제 요청을 보내 보지는 않았습니다.
- 주인 없는 실습용 가상 메모 4건은 로그인한 모든 사용자의 목록에 보입니다.
- `/api/notes`에는 요청 횟수 제한이 없습니다(로그인 시도 제한은 Supabase가 합니다).
- 옛 커밋 `91514d0`와 옛 배포에 메모가 남아 있다는 2단계의 한계는 그대로입니다.

## 4단계 저장점: 로그인해도 내 자료만 보이게 함

기록일 2026-10-17. 이 시점에 실제로 한 일과 확인한 결과만 적습니다. 실행하지 못한 것은 "미실행"으로 남깁니다.

### 현재 작동하는 기능

- **소유자 비교(`src/notes-api.mjs`)**: 서버가 검사한 사용자 ID와 DB 행의 `owner_id`가 같을 때만 읽기·수정·삭제를 허용합니다. 남의 메모, 주인 없는 메모, 없는 메모는 모두 같은 404(`NOT_FOUND`)로 답해 존재 여부도 알려 주지 않습니다. 이 비교는 본문 검사보다 먼저 합니다.
- **추가**: 본문의 `owner_id`·`userId`는 쓰지 않고 검사가 끝난 토큰의 사용자 ID만 `owner_id`로 저장합니다.
- **수정**: 수정 쿼리에도 `owner_id` 조건을 걸고, 고친 뒤 행의 소유자가 본인이 아니면 응답하지 않고 502로 막습니다. 본문에 `owner_id`·`ownerId`·`owner`·`userId`·`user_id`가 있으면 본인 ID여도 403(`OWNER_CHANGE_NOT_ALLOWED`)으로 거부하고 자료를 바꾸지 않습니다. 화면은 `{title, body}`만 보냅니다.
- **삭제·목록**: 삭제 쿼리에도 `owner_id` 조건이 붙습니다. 목록은 본인 메모만 돌려주고 주인 없는 행은 아무에게도 보이지 않습니다. 응답은 `id`·`title`·`body`만 싣고 `owner_id`는 싣지 않습니다.
- **`aleph.config.json`**: `step` 4. `allowedRoutes`는 3단계와 같은 다섯 경로이며 실제 메서드·경로와 같은지 `test:step4`가 대조합니다. `scripts/build-public.mjs`와 `scripts/deployment-identity.mjs`가 4단계를 허용합니다.
- **화면(`public/index.html`)**: 3단계의 "소유자 검사는 아직 없다" 안내를 4단계 동작에 맞게 고쳤습니다. 로그인·로그아웃·메모 추가·수정·삭제 흐름은 그대로입니다.
- **자기 점검(`src/attack-check.mjs`)**: A·B 로그인 정보를 모두 환경변수로 주면, A가 만든 점검용 메모를 B가 읽기·수정·삭제하려 할 때 거부되는지, B의 목록에 없는지, A의 메모가 그대로인지 봅니다. 기록에는 HTTP 상태와 예/아니오만 남기고 토큰·비밀번호·메모 본문·id는 남기지 않습니다. 정보가 없으면 "미실행"으로 적습니다.
- **학습 DB 자료**: 가상 메모 4건은 A 소유, B 소유의 시험 메모 1건이 있습니다(주인 없는 행 0건). 이를 만든 SQL에는 메모 문장이 들어 있어 Git에 올리지 않았습니다.

### 다시 실행하는 방법과 사람이 하는 확인

- 시험: 먼저 `npm ci`, 그다음 `npm run build -- --local`, `npm run test:r5`, `npm run test:package`, `npm run test:step2`, `npm run test:step3`, `npm run test:step4`.
- 정상: 시크릿 창에서 배포 주소를 열고 A로 로그인하면 A의 가상 메모 4건이, B로 로그인하면 B의 시험 메모 1건만 보입니다. 각자 자기 메모를 추가·수정·삭제할 수 있습니다.
- 거부되어야 함: B로 로그인한 상태에서 A의 메모 id로 `GET`·`PUT`·`DELETE /api/notes/<A의 id>`를 보내면 404이고 A의 메모는 그대로여야 합니다. 로그인 없이 `/api/notes`를 열면 401입니다.
- 제출 묶음 자기 점검에 B의 타인 메모 점검까지 넣으려면 터미널에서만 `ALEPH_CHECK_EMAIL`·`ALEPH_CHECK_PASSWORD`(A)와 `ALEPH_CHECK_EMAIL_B`·`ALEPH_CHECK_PASSWORD_B`(B)를 주고 `npm run bundle`을 실행합니다. 이 값은 파일에 저장되지 않습니다.

### 확인 기록 (2026-10-17)

실행함:
- 시험 `test:r5` 2건, `test:package` 3건, `test:step2` 2건, `test:step3` 11건, `test:step4` 13건 통과. `npm run build -- --local` 성공.
- `test:step4`는 실제 저장소 코드(`createSupabaseNotesStore`)와 API를 이어 붙이고 DB만 가짜로 바꿔, A/B 본인 접근 유지와 상대 메모 읽기·수정·삭제 거부, 소유자 변경 거부, 주인 없는 행 비노출, 로그인 없는 요청 401을 확인했습니다. 가짜 DB는 `.eq()` 조건을 실제로 적용합니다.
- 사본에서 소유자 비교를 항상 참으로 바꾸거나 `update`·`delete`의 `owner_id` 조건을 빼거나 목록에 주인 없는 행을 다시 넣으면 시험이 실패하는 것을 확인했습니다(저장소 파일은 바꾸지 않음).
- 학습 DB 조회: 가상 메모 4건은 A, 시험 메모 1건은 B 소유이고 주인 없는 행과 존재하지 않는 소유자 ID는 0건입니다.
- DB 권한(GRANT·RLS) SQL 제안을 로컬의 임시 PostgreSQL 16에서 시험했습니다. 가짜 `anon`·`authenticated`·`service_role`과 `auth.uid()`를 쓴 27건이 통과했고, 같은 SQL을 두 번 적용해도 같았습니다. 실제 Supabase에서 실행한 것이 아닙니다.

미실행:
- DB 권한 SQL의 실제 학습 DB 적용. 2026-10-17 조회 시점에 정책 0개, `anon`·`authenticated` 권한 없음, `service_role`만 권한이 있었습니다. 학생이 SQL Editor에서 직접 실행한 뒤 `information_schema.role_table_grants`와 `has_table_privilege`로 대조해 여기에 기록합니다.
- 실제 Supabase SDK와 실제 로그인으로 A·B가 서로의 메모에 접근하는 요청. 이 작업 환경에서는 npm 설치와 외부 접속이 막혀 있어 가짜 대체 시험만 했습니다.
- 배포 결과(빌드 성공 여부, 배포 주소 응답). Vercel 프로젝트에 접근하지 못해 배포 로그를 읽지 못했습니다.
- `npm run bundle`의 자기 점검, 시크릿 창과 A·B 로그인으로 하는 사람 확인, 심판 판정.

### 남은 약점

- 서버는 `service_role` 키로 DB에 접속해 RLS를 거치지 않습니다. 본인 메모만 보이게 하는 보장은 서버 코드의 소유자 비교와 쿼리 조건이 맡습니다. DB 권한 SQL을 적용하면 직접 접근하는 경로에서도 본인 행만 허용됩니다.
- `/api/notes`에는 요청 횟수 제한이 없습니다(로그인 시도 제한은 Supabase가 합니다).
- 옛 커밋 `91514d0`와 옛 배포에 메모가 남아 있다는 2단계의 한계는 그대로입니다.

## 5단계 저장점: 자료 요청을 서버 한곳으로 모음

> 위 2·3·4단계 기록 중 "미실행"·"남은 약점"으로 적힌 DB 권한 항목은 이 단계에서 학생이 직접 실행해 해소했습니다(아래 확인 기록).

### 현재 작동하는 기능

- 메모 읽기·추가·수정·삭제는 `/api/notes`, `/api/notes/:id` 서버 함수 한곳으로만 갑니다. 화면 코드(`public/index.html`)에는 자료 저장소를 직접 부르는 코드(`.from(`, `.rpc(`, `/rest/v1`, `vault_notes`)가 없고, 로그인·로그아웃(Auth) 호출만 그대로 있습니다.
- 서버 함수의 로그인 검사(`src/verify-login.mjs`)와 소유자 검사, 서버 전용 키 설정은 바꾸지 않았습니다.
- `aleph.config.json`의 `originalApiUrl`은 쿼리 없는 HTTPS 경로(`…/rest/v1/vault_notes`)이고, `step`은 5입니다.
- 학습 DB의 `vault_notes`는 PUBLIC·`anon`·`authenticated`의 직접 권한을 거두었습니다. 다른 테이블은 건드리지 않았습니다.
- 자기 점검에 `original_api_direct_anon`을 추가했습니다. 공개 키로 `originalApiUrl`을 직접 불러 HTTP 상태와 건수만 기록하고(본문·키 기록 없음), 연결하지 못하면 "미실행"으로 적습니다.

### 다시 실행하는 방법

```
npm ci
npm run build -- --local
npm run test:r5 && npm run test:package
npm run test:step2 && npm run test:step3 && npm run test:step4 && npm run test:step5
```

### 확인 기록 (2026-10-18)

실행함:
- 위 시험 전부 통과(가짜 DB·가짜 fetch 사용). 5단계 배포 식별 허용, 6단계 거부 포함.
- 학생이 학습 DB에서 권한 회수 SQL을 직접 실행했습니다. 이후 읽기 전용 조회로 `relacl`에 postgres와 service_role만 남고, RLS 켜짐, 정책 0개, A 메모 4건·B 메모 1건임을 확인했습니다.

미실행:
- 배포된 사이트에서의 실제 A·B 로그인 확인(시크릿 창에서 학생이 확인).
- `npm run bundle`의 자기 점검과 배포된 Data API에 대한 공개 키 직접 요청.
- 심판 판정.

## 6단계 저장점: 등록한 기기만 자료실에 들어옴 (진행 중)

### 현재 작동하는 기능

- `src/decider.mjs`의 `decide(request)`에 규칙 `device_registered`를 넣었습니다(`RULE_IDS`에는 이 이름만 있습니다).
- `request.deviceRegistered === true`이면 `allow`·`approved`, 그 외(`false`, 값 없음, 문자열 등)는 `deny`·`device_not_registered`로 거부합니다.
- 기기 등록 여부만 봅니다. 요청의 읽기·쓰기 구분과 다른 규칙은 넣지 않았습니다. 자료실 주소와 화면은 그대로입니다.
- 이번 단계에는 따로 설치할 접속 프로그램이 없고, 새 인증서·CA·서명 키도 만들지 않았습니다.

### 확인 순서

1. 저장소 폴더에서 `npm run decider:test`를 실행합니다.
2. 정상 결과: `통과 · 등록 기기의 정상 요청`(allow)과 `통과 · 미등록 기기의 가상 요청`(deny, 이유 코드 `device_not_registered`)이 모두 나오고 종료 코드가 0입니다.
3. 거부되어야 할 결과: 미등록 기기 요청이 `allow`로 나오면 시험이 `확인 필요`로 실패합니다.
4. 이 시험은 가상 요청 연습이며 심판 판정이 아닙니다. 실제 미등록 기기 공격과 판정은 심판이 맡습니다.

### 확인 기록 (2026-10-18)

실행함: `npm run decider:test`에서 위 두 건이 통과했습니다. 별도로 가상 요청을 직접 넣어 등록 기기는 `allow`·`approved`, 미등록 기기는 `deny`·`device_not_registered`가 나오는 것을 봤습니다.

미실행: 심판의 미등록 기기 공격과 판정, 반 엔진 연결.
