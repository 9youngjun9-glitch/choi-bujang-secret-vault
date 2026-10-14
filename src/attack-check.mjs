// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (config.step === 2) return runStepTwoChecks(app);
  if (config.step === 3) return runStepThreeChecks(app, config);
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}

// 2단계: 옛 공개 경로는 닫혔는지, 서버 API는 아직 열려 있는지 비로그인으로 직접 요청해 봅니다.
// 메모 본문은 읽지도 기록하지도 않고 건수만 셉니다.
async function readNoteCount(app, path) {
  const response = await fetch(new URL(path, app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let count = null;
  if (response.ok) {
    try {
      const data = await response.json();
      if (Array.isArray(data?.notes)) count = data.notes.length;
    } catch {
      // A non-JSON response is not a note list.
    }
  }
  return { status: response.status, count };
}

async function runStepTwoChecks(app) {
  const staticRead = await readNoteCount(app, '/data.json');
  const apiRead = await readNoteCount(app, '/api/notes');
  return [
    { attackId: 'static_data_json_read', expected: '비로그인으로 /data.json을 요청해도 가상 메모가 나오지 않음',
      observed: staticRead.count > 0
        ? `HTTP ${staticRead.status}, 비로그인 요청에서 메모 ${staticRead.count}건이 보임`
        : `HTTP ${staticRead.status}, 비로그인 요청에서 메모가 보이지 않음` },
    { attackId: 'anonymous_api_notes_read', expected: '비로그인 서버 API 호출이 아직 막히지 않은 약점을 관찰',
      observed: apiRead.count > 0
        ? `HTTP ${apiRead.status}, 비로그인 요청에서 메모 ${apiRead.count}건 수신 (아직 열려 있음, 본문은 기록하지 않음)`
        : `HTTP ${apiRead.status}, 메모를 받지 못함 (서버 환경변수와 DB 연결 확인 필요)` },
  ];
}

// 3단계: 로그인 없이·위조 토큰으로 불러 보고, 로그인 정보를 환경변수로 주면 정상 A 로그인 흐름도 실제로 보냅니다.
// 기록에는 HTTP 상태와 건수만 남깁니다. 토큰·비밀번호·메모 본문·메모 id는 기록하지 않습니다.
// 서버에 닿지 못했거나 로그인 정보가 없어 보내지 못한 점검은 "미실행"으로 적습니다.
// 이 값은 공개용 publishable 키입니다(화면 코드에도 있습니다). 서버 전용 키는 넣지 않습니다.
const PUBLISHABLE_KEY = 'sb_publishable_exh9C0xtmIbWjaYalL7LRg_Ny84b-zN';
const NOT_RUN_UNREACHABLE = '미실행: 배포 주소에 연결하지 못해 요청을 보내지 못함';

async function probe(app, path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(new URL(path, app), {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(10000),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await response.json(); } catch { /* 본문이 없거나 JSON이 아님 */ }
    return { status: response.status, data };
  } catch {
    return { status: null, data: null };
  }
}

const rejected = (status) => status === 401 || status === 403;
const itemCount = (data) => (Array.isArray(data) ? data.length : 0);

function describeRefusal(result) {
  if (result.status === null) return NOT_RUN_UNREACHABLE;
  if (rejected(result.status) && itemCount(result.data) === 0) return `HTTP ${result.status}, 자료 없이 거부됨`;
  return `HTTP ${result.status}, 거부되지 않음 (자료 ${itemCount(result.data)}건)`;
}

function forgedToken(issuer) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: 'none', typ: 'JWT' })}.${part({
    iss: issuer, aud: 'authenticated', role: 'authenticated',
    sub: '00000000-0000-4000-8000-000000000000', iat: now, exp: now + 3600,
  })}.${Buffer.from('forged').toString('base64url')}`;
}

async function studentLoginFlow(app, config) {
  const email = process.env.ALEPH_CHECK_EMAIL;
  const password = process.env.ALEPH_CHECK_PASSWORD;
  const expected = '정상 A 로그인 뒤 메모 추가·조회·수정·삭제가 되고 삭제한 메모는 404';
  if (!email || !password) {
    return { attackId: 'student_login_crud_flow', expected,
      observed: '미실행: ALEPH_CHECK_EMAIL·ALEPH_CHECK_PASSWORD가 없어 정상 A 로그인 점검을 보내지 않음' };
  }
  let token;
  try {
    const login = await fetch(`${config.identityProvider.issuer}/token?grant_type=password`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await login.json().catch(() => null);
    token = login.ok && typeof data?.access_token === 'string' ? data.access_token : null;
    if (!token) return { attackId: 'student_login_crud_flow', expected, observed: `로그인 단계에서 멈춤 (HTTP ${login.status})` };
  } catch {
    return { attackId: 'student_login_crud_flow', expected, observed: '미실행: 로그인 서버에 연결하지 못함' };
  }
  const steps = [];
  const record = (name, ok, status) => { steps.push(`${name} ${ok ? '성공' : '실패'}(${status})`); return ok; };
  const created = await probe(app, '/api/notes', { method: 'POST', token, body: { title: '점검용 가상 메모', body: '점검용' } });
  const id = created.data?.id;
  if (!record('추가', created.status >= 200 && created.status < 300 && typeof id === 'string', created.status)) {
    return { attackId: 'student_login_crud_flow', expected, observed: steps.join(', ') };
  }
  const path = `/api/notes/${id}`;
  const read = await probe(app, path, { token });
  record('조회', read.status === 200 && read.data?.id === id, read.status);
  const edited = await probe(app, path, { method: 'PUT', token, body: { title: '점검용 수정', body: '수정' } });
  record('수정', edited.status === 200, edited.status);
  const removed = await probe(app, path, { method: 'DELETE', token });
  record('삭제', removed.status >= 200 && removed.status < 300, removed.status);
  const gone = await probe(app, path, { token });
  record('삭제 뒤 조회 404', gone.status === 404, gone.status);
  return { attackId: 'student_login_crud_flow', expected, observed: steps.join(', ').slice(0, 290) };
}

async function runStepThreeChecks(app, config) {
  const issuer = config.identityProvider?.issuer;
  if (typeof issuer !== 'string') throw new Error('3단계에는 aleph.config.json의 identityProvider가 필요합니다.');
  const anonymousList = await probe(app, '/api/notes');
  const anonymousCreate = await probe(app, '/api/notes', { method: 'POST', body: { title: '로그인 없는 추가', body: '거부되어야 함' } });
  const forged = await probe(app, '/api/notes', { token: forgedToken(issuer) });
  const staticFile = await probe(app, '/data.json');
  return [
    { attackId: 'anonymous_list_read', expected: '로그인 없이 /api/notes를 불러도 자료가 없고 401·403으로 거부됨',
      observed: describeRefusal(anonymousList) },
    { attackId: 'anonymous_note_create', expected: '로그인 없이 메모를 추가하려 하면 401·403으로 거부됨',
      observed: describeRefusal(anonymousCreate) },
    { attackId: 'forged_token_read', expected: '서명 없는 위조 토큰으로 불러도 자료가 없고 401·403으로 거부됨',
      observed: describeRefusal(forged) },
    { attackId: 'static_data_json_closed', expected: '/data.json은 여전히 열려 있지 않음(404)',
      observed: staticFile.status === null ? NOT_RUN_UNREACHABLE : `HTTP ${staticFile.status}` },
    await studentLoginFlow(app, config),
  ];
}
