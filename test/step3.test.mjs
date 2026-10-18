// 3단계 시험: 외부 패키지 없이 돌아갑니다(토큰 검사기와 저장소는 가짜로 바꿔 끼웁니다).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createNotesApi, isUuid } from '../src/notes-api.mjs';
import { createSupabaseNotesStore } from '../src/notes-runtime.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const TOKENS = { 'Bearer token-a': USER_A, 'Bearer token-b': USER_B };
const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));

function fakeResponse() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function memoryStore() {
  // 4단계부터 모든 메모에 주인이 있습니다(가상 메모 4건은 A에게 연결됨).
  const rows = new Map([['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { ownerId: USER_A, title: '가상', body: 'A의 가상 메모' }]]);
  const calls = [];
  let counter = 0;
  return {
    rows, calls,
    async list(userId) {
      calls.push(['list', userId]);
      return [...rows].filter(([, r]) => r.ownerId === userId)
        .map(([id, r]) => ({ id, title: r.title, body: r.body }));
    },
    async get(id) { calls.push(['get', id]); const r = rows.get(id); return r ? { id, title: r.title, body: r.body, ownerId: r.ownerId } : null; },
    async create(input) {
      calls.push(['create', input]);
      const id = input.id ?? `bbbbbbbb-bbbb-4bbb-8bbb-${String(++counter).padStart(12, '0')}`;
      if (rows.has(id)) throw Object.assign(new Error('x'), { code: 'ID_EXISTS' });
      rows.set(id, { ownerId: input.ownerId, title: input.title, body: input.body });
      return { id };
    },
    async update(id, userId, fields) {
      calls.push(['update', id, userId, fields]);
      const r = rows.get(id);
      if (!r || r.ownerId !== userId) return null;
      Object.assign(r, fields);
      return { id, title: r.title, body: r.body, ownerId: r.ownerId };
    },
    async remove(id, userId) {
      calls.push(['remove', id, userId]);
      const r = rows.get(id);
      return Boolean(r && r.ownerId === userId && rows.delete(id));
    },
  };
}

function setup() {
  const store = memoryStore();
  const verifyAuthorization = async (header) => (TOKENS[header] ? { kind: 'student', userId: TOKENS[header] } : null);
  return { store, api: createNotesApi({ verifyAuthorization, store }) };
}

const call = async (handler, { method = 'GET', token, query, body } = {}) => {
  const request = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, query: query ?? {}, body };
  const response = fakeResponse();
  await handler(request, response);
  return response;
};

test('로그인 없음·형식이 틀린 토큰·위조 토큰은 모든 경로와 메서드에서 자료 없이 거부된다', async () => {
  const { api, store } = setup();
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const tries = [
    [api.collection, { method: 'GET' }], [api.collection, { method: 'POST', body: { title: 't', body: 'b' } }],
    [api.item, { method: 'GET', query: { id } }], [api.item, { method: 'PUT', query: { id }, body: { title: 'x' } }],
    [api.item, { method: 'DELETE', query: { id } }],
  ];
  for (const [handler, base] of tries) {
    for (const token of [undefined, 'garbage', 'forged.jwt.value', 'token-c']) {
      const response = await call(handler, { ...base, token });
      assert.equal(response.statusCode, 401, `${base.method} ${token}`);
      assert.deepEqual(response.body, { error: 'UNAUTHORIZED' });
      assert.equal(response.headers['Cache-Control'], 'no-store');
    }
  }
  assert.equal(store.calls.length, 0, '로그인 검사 전에는 저장소를 건드리지 않는다');
  assert.equal(store.rows.size, 1);
});

test('정상 A 로그인: 추가·한 건 조회·목록·수정·삭제, 삭제 뒤 조회는 404', async () => {
  const { api } = setup();
  const created = await call(api.collection, { method: 'POST', token: 'token-a', body: { title: '제목', body: '내용' } });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(Object.keys(created.body), ['id']);
  assert.ok(isUuid(created.body.id));
  const id = created.body.id;
  const one = await call(api.item, { token: 'token-a', query: { id } });
  assert.equal(one.statusCode, 200);
  assert.deepEqual(one.body, { id, title: '제목', body: '내용' });
  const list = await call(api.collection, { token: 'token-a' });
  assert.equal(list.statusCode, 200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.some((note) => note.id === id && note.body === '내용'));
  const edited = await call(api.item, { method: 'PUT', token: 'token-a', query: { id }, body: { title: '새 제목', body: '새 내용' } });
  assert.deepEqual(edited.body, { id, title: '새 제목', body: '새 내용' });
  const removed = await call(api.item, { method: 'DELETE', token: 'token-a', query: { id } });
  assert.equal(removed.statusCode, 200);
  assert.equal((await call(api.item, { token: 'token-a', query: { id } })).statusCode, 404);
  assert.equal((await call(api.item, { method: 'DELETE', token: 'token-a', query: { id } })).statusCode, 404);
  assert.equal((await call(api.item, { method: 'PUT', token: 'token-a', query: { id }, body: { title: 'x' } })).statusCode, 404);
});

test('소유자는 검사가 끝난 토큰의 사용자 ID뿐이고 브라우저가 보낸 userId·role·owner_id는 무시한다', async () => {
  const { api, store } = setup();
  const response = await call(api.collection, {
    method: 'POST', token: 'token-a',
    body: { title: '제목', body: '내용', userId: USER_B, owner_id: USER_B, ownerId: USER_B, role: 'admin' },
  });
  assert.equal(response.statusCode, 201);
  const [, input] = store.calls.find(([name]) => name === 'create');
  assert.deepEqual(input, { id: undefined, ownerId: USER_A, title: '제목', body: '내용' });
  // 목록은 로그인한 사용자 기준(4단계부터 본인 메모만): B는 A의 메모를 하나도 보지 못한다.
  const listB = await call(api.collection, { token: 'token-b' });
  assert.deepEqual(listB.body, []);
});

test('POST의 id는 UUID일 때만 받고 이미 있으면 덮어쓰지 않는다', async () => {
  const { api } = setup();
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const first = await call(api.collection, { method: 'POST', token: 'token-a', body: { id, title: 't', body: 'b' } });
  assert.deepEqual([first.statusCode, first.body], [201, { id }]);
  const again = await call(api.collection, { method: 'POST', token: 'token-a', body: { id, title: 'x', body: 'y' } });
  assert.deepEqual([again.statusCode, again.body], [409, { error: 'ID_EXISTS' }]);
  assert.equal((await call(api.item, { token: 'token-a', query: { id } })).body.title, 't');
  const bad = await call(api.collection, { method: 'POST', token: 'token-a', body: { id: 'not-a-uuid', title: 't', body: 'b' } });
  assert.deepEqual([bad.statusCode, bad.body], [400, { error: 'INVALID_ID' }]);
});

test('입력 검사와 고정 오류 코드', async () => {
  const { api } = setup();
  const post = (body) => call(api.collection, { method: 'POST', token: 'token-a', body });
  assert.equal((await post({ title: '', body: 'b' })).body.error, 'INVALID_TITLE');
  assert.equal((await post({ title: 'x'.repeat(201), body: 'b' })).body.error, 'INVALID_TITLE');
  assert.equal((await post({ title: 't', body: 5 })).body.error, 'INVALID_BODY');
  assert.equal((await post({ title: 't' })).body.error, 'INVALID_BODY');
  assert.equal((await post(undefined)).body.error, 'INVALID_JSON');
  assert.equal((await post('{깨진 json')).body.error, 'INVALID_JSON');
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal((await call(api.item, { method: 'PUT', token: 'token-a', query: { id }, body: {} })).body.error, 'NOTHING_TO_UPDATE');
  assert.equal((await call(api.item, { token: 'token-a', query: { id: 'not-a-uuid' } })).statusCode, 404);
  const patch = await call(api.collection, { method: 'PATCH', token: 'token-a' });
  assert.deepEqual([patch.statusCode, patch.headers.Allow], [405, 'GET, POST']);
  // 본문을 읽는 순간 예외가 나는 요청(Vercel은 깨진 JSON을 이렇게 알립니다)
  const throwing = { method: 'POST', headers: { authorization: 'Bearer token-a' }, query: {}, get body() { throw new Error('bad json'); } };
  const broken = fakeResponse();
  await api.collection(throwing, broken);
  assert.deepEqual([broken.statusCode, broken.body], [400, { error: 'INVALID_JSON' }]);
});

test('저장소·검사기 오류는 고정 코드로만 알리고 내부 내용을 싣지 않는다', async () => {
  const log = console.error;
  console.error = () => {};
  try {
    const failingStore = new Proxy({}, { get: () => async () => { throw Object.assign(new Error('secret detail'), { code: '42501' }); } });
    const broken = createNotesApi({ verifyAuthorization: async () => ({ kind: 'student', userId: USER_A }), store: failingStore });
    const response = await call(broken.collection, { token: 'x' });
    assert.deepEqual([response.statusCode, response.body], [502, { error: 'NOTES_STORE_FAILED' }]);
    const noVerifier = createNotesApi({ verifyAuthorization: async () => { throw new Error('boom'); }, store: memoryStore() });
    const unavailable = await call(noVerifier.collection, { token: 'x' });
    assert.deepEqual([unavailable.statusCode, unavailable.body], [503, { error: 'AUTH_UNAVAILABLE' }]);
  } finally {
    console.error = log;
  }
});

function fakeSupabase(result) {
  const calls = [];
  const builder = {};
  for (const name of ['select', 'or', 'order', 'eq', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
    builder[name] = (...args) => { calls.push([name, ...args]); return builder; };
  }
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return { calls, from(table) { calls.push(['from', table]); return builder; } };
}

test('Supabase 저장소는 content↔body를 바꾸고 owner_id를 저장하며 owner_id를 응답에 싣지 않는다', async () => {
  const list = fakeSupabase({ data: [{ id: 'i1', title: 't', content: 'c', owner_id: USER_A }], error: null });
  const notes = await createSupabaseNotesStore(list).list(USER_A);
  assert.deepEqual(notes, [{ id: 'i1', title: 't', body: 'c' }]);
  assert.deepEqual(list.calls.find(([name]) => name === 'eq'), ['eq', 'owner_id', USER_A]);
  assert.equal(list.calls.some(([name]) => name === 'or'), false, '4단계부터 주인 없는 행을 함께 돌려주지 않는다');
  await assert.rejects(createSupabaseNotesStore(fakeSupabase({ data: [], error: null })).list("x'),owner_id.not.is.null,(y"));

  const insert = fakeSupabase({ data: { id: 'new-id' }, error: null });
  assert.deepEqual(await createSupabaseNotesStore(insert).create({ ownerId: USER_A, title: 't', body: 'b' }), { id: 'new-id' });
  assert.deepEqual(insert.calls.find(([name]) => name === 'insert'), ['insert', { owner_id: USER_A, title: 't', content: 'b' }]);
  const withId = fakeSupabase({ data: { id: 'x' }, error: null });
  await createSupabaseNotesStore(withId).create({ id: 'given', ownerId: USER_A, title: 't', body: 'b' });
  assert.equal(withId.calls.find(([name]) => name === 'insert')[1].id, 'given');
  const conflict = fakeSupabase({ data: null, error: { code: '23505' } });
  await assert.rejects(createSupabaseNotesStore(conflict).create({ ownerId: USER_A, title: 't', body: 'b' }), { code: 'ID_EXISTS' });

  const update = fakeSupabase({ data: { id: 'i1', title: 'n', content: 'm' }, error: null });
  assert.deepEqual(await createSupabaseNotesStore(update).update('i1', USER_A, { body: 'm' }), { id: 'i1', title: 'n', body: 'm', ownerId: null });
  assert.deepEqual(update.calls.find(([name]) => name === 'update'), ['update', { content: 'm' }]);
  assert.equal(await createSupabaseNotesStore(fakeSupabase({ data: null, error: null })).update('i1', USER_A, { title: 'n' }), null);
  assert.equal(await createSupabaseNotesStore(fakeSupabase({ data: null, error: null })).remove('i1', USER_A), false);
  assert.equal(await createSupabaseNotesStore(fakeSupabase({ data: { id: 'i1' }, error: null })).remove('i1', USER_A), true);
  assert.equal(await createSupabaseNotesStore(fakeSupabase({ data: null, error: null })).get('i1'), null);
});

test('aleph.config.json은 틀의 토큰 검사기가 요구하는 모양이고 비밀 값이 없다', () => {
  assert.ok(config.step >= 3, '로그인 설정은 3단계부터 필요합니다');
  const provider = config.identityProvider;
  assert.deepEqual(Object.keys(provider).sort(), ['audience', 'issuer', 'jwksUrl']);
  assert.match(provider.issuer, /^https:\/\/[a-z0-9]+\.supabase\.co\/auth\/v1$/u);
  assert.equal(provider.jwksUrl, `${provider.issuer}/.well-known/jwks.json`);
  assert.equal(provider.audience, 'authenticated');
  assert.match(config.publicAppUrl, /^https:\/\/[a-z0-9-]+\.vercel\.app$/u);
  assert.notEqual(new URL(provider.issuer).origin, new URL(config.judgeIssuer).origin);
  assert.deepEqual(config.allowedRoutes, ['GET /api/notes', 'POST /api/notes', 'GET /api/notes/:id', 'PUT /api/notes/:id', 'DELETE /api/notes/:id']);
  assert.doesNotMatch(JSON.stringify(config), /sb_secret_|service_role|eyJ|password|apikey/iu); // 저장소 이름의 'secret'은 비밀 값이 아니다
});

test('3단계 배포 식별 정보에는 시작 틀 표시가 없고 7단계는 아직 허용하지 않는다', () => {
  const env = {
    VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'Student-A', VERCEL_GIT_REPO_SLUG: 'aleph-defense',
    VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'student-defense-123.vercel.app',
  };
  const three = deploymentIdentity(env, { step: 3, judgeIssuer: config.judgeIssuer });
  assert.equal(three.step, 3);
  assert.equal(JSON.stringify(three).includes('SAMPLE_NOTE'), false);
  assert.throws(() => deploymentIdentity(env, { step: 7, judgeIssuer: config.judgeIssuer }));
});

test('3단계 자기 점검: 거부된 요청·거부되지 않은 요청·연결 실패를 구분해 기록하고 본문·토큰은 싣지 않는다', async () => {
  const original = globalThis.fetch;
  const savedEmail = process.env.ALEPH_CHECK_EMAIL;
  const savedPassword = process.env.ALEPH_CHECK_PASSWORD;
  delete process.env.ALEPH_CHECK_EMAIL; delete process.env.ALEPH_CHECK_PASSWORD;
  const seen = [];
  try {
    globalThis.fetch = async (url, init) => {
      const { pathname } = new URL(String(url));
      seen.push([init?.method ?? 'GET', pathname, Boolean(init?.headers?.Authorization)]);
      if (pathname === '/data.json') return new Response('Not Found', { status: 404 });
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
    };
    const results = await runAttackChecks({ ...config, step: 3 });
    assert.deepEqual(results.map((r) => r.attackId), ['anonymous_list_read', 'anonymous_note_create', 'forged_token_read', 'static_data_json_closed', 'student_login_crud_flow']);
    assert.match(results[0].observed, /HTTP 401, 자료 없이 거부됨/u);
    assert.equal(results[3].observed, 'HTTP 404');
    assert.match(results[4].observed, /^미실행/u);
    assert.deepEqual(seen.map(([m, p, auth]) => `${m} ${p} ${auth}`), ['GET /api/notes false', 'POST /api/notes false', 'GET /api/notes true', 'GET /data.json false']);
    assert.ok(results.every((r) => r.observed.length <= 300 && r.expected.length <= 300));

    globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'x', title: '노출', body: '노출' }]), { status: 200 });
    const open = await runAttackChecks({ ...config, step: 3 });
    assert.match(open[0].observed, /거부되지 않음 \(자료 1건\)/u);
    assert.doesNotMatch(JSON.stringify(open), /노출/u);

    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    const offline = await runAttackChecks({ ...config, step: 3 });
    assert.match(offline[0].observed, /^미실행/u);
  } finally {
    globalThis.fetch = original;
    if (savedEmail !== undefined) process.env.ALEPH_CHECK_EMAIL = savedEmail;
    if (savedPassword !== undefined) process.env.ALEPH_CHECK_PASSWORD = savedPassword;
  }
});

test('정상 A 로그인 점검은 환경변수가 있을 때만 보내고 비밀번호·토큰을 기록하지 않는다', async () => {
  const original = globalThis.fetch;
  process.env.ALEPH_CHECK_EMAIL = 'a@example.com';
  process.env.ALEPH_CHECK_PASSWORD = 'pw-for-test-only';
  let created = false;
  try {
    globalThis.fetch = async (url, init) => {
      const { pathname } = new URL(String(url));
      const method = init?.method ?? 'GET';
      const authed = init?.headers?.Authorization === 'Bearer token-from-login';
      if (pathname === '/auth/v1/token') return new Response(JSON.stringify({ access_token: 'token-from-login' }), { status: 200 });
      if (!authed) return new Response('{}', { status: 401 });
      if (pathname === '/api/notes' && method === 'POST') { created = true; return new Response(JSON.stringify({ id: 'n-1' }), { status: 201 }); }
      if (pathname === '/api/notes/n-1' && method === 'GET') {
        return created ? (created = false, new Response(JSON.stringify({ id: 'n-1' }), { status: 200 })) : new Response('{}', { status: 404 });
      }
      if (pathname === '/api/notes/n-1' && method === 'PUT') return new Response('{}', { status: 200 });
      if (pathname === '/api/notes/n-1' && method === 'DELETE') return new Response(JSON.stringify({ id: 'n-1' }), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    const flow = (await runAttackChecks({ ...config, step: 3 })).at(-1);
    assert.equal(flow.attackId, 'student_login_crud_flow');
    assert.equal(flow.observed, '추가 성공(201), 조회 성공(200), 수정 성공(200), 삭제 성공(200), 삭제 뒤 조회 404 성공(404)');
    assert.doesNotMatch(JSON.stringify(flow), /pw-for-test-only|token-from-login/u);
  } finally {
    globalThis.fetch = original;
    delete process.env.ALEPH_CHECK_EMAIL; delete process.env.ALEPH_CHECK_PASSWORD;
  }
});
