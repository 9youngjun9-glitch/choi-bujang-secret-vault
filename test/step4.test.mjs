// 4단계 시험: 실제 저장소 코드(createSupabaseNotesStore)와 API를 이어 붙이고, DB만 가짜로 바꿉니다.
// 가짜 DB는 .eq() 조건을 실제로 적용하므로, 소유자 조건이 빠지면 남의 메모가 보이거나 바뀌어 시험이 실패합니다.
// 외부 패키지와 네트워크가 필요 없습니다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createNotesApi } from '../src/notes-api.mjs';
import { createSupabaseNotesStore } from '../src/notes-runtime.mjs';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const TOKENS = { 'Bearer token-a': USER_A, 'Bearer token-b': USER_B };
const NOTE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const NOTE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const NOTE_NONE = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const MISSING = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));

// ---- 가짜 DB: select·insert·update·delete와 .eq() 조건만 흉내 냅니다 ----
function fakeDb(seed) {
  let serial = 0;
  const rows = seed.map((row) => ({ created_at: ++serial, ...row }));
  const log = [];
  const pick = (row, cols) => {
    const names = cols === '*' ? Object.keys(row) : cols.split(',').map((name) => name.trim());
    return Object.fromEntries(names.map((name) => [name, row[name]]));
  };
  function query() {
    const q = { op: 'select', cols: '*', filters: [], payload: null, mode: 'many' };
    const run = () => {
      log.push({ op: q.op, filters: q.filters.map(([column]) => column) });
      const matches = rows.filter((row) => q.filters.every(([column, value]) => row[column] === value));
      let hit;
      if (q.op === 'insert') {
        if (q.payload.id !== undefined && rows.some((row) => row.id === q.payload.id)) {
          return { data: null, error: { code: '23505' } };
        }
        const row = {
          id: q.payload.id ?? crypto.randomUUID(), owner_id: q.payload.owner_id ?? null,
          title: q.payload.title, content: q.payload.content, created_at: ++serial,
        };
        rows.push(row);
        hit = [row];
      } else if (q.op === 'update') {
        for (const row of matches) Object.assign(row, q.payload);
        hit = matches;
      } else if (q.op === 'delete') {
        for (const row of matches) rows.splice(rows.indexOf(row), 1);
        hit = matches;
      } else {
        hit = [...matches].sort((x, y) => x.created_at - y.created_at);
      }
      const out = hit.map((row) => pick(row, q.cols));
      if (q.mode === 'many') return { data: out, error: null };
      if (out.length > 1) return { data: null, error: { code: 'PGRST116' } };
      return { data: out[0] ?? null, error: null };
    };
    const builder = {
      select(cols = '*') { q.cols = cols; return builder; },
      insert(payload) { q.op = 'insert'; q.payload = payload; return builder; },
      update(payload) { q.op = 'update'; q.payload = payload; return builder; },
      delete() { q.op = 'delete'; return builder; },
      eq(column, value) { q.filters.push([column, value]); return builder; },
      order() { return builder; },
      maybeSingle() { q.mode = 'maybe'; return builder; },
      single() { q.mode = 'one'; return builder; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return builder;
  }
  return { rows, log, from(table) { assert.equal(table, 'vault_notes'); return query(); } };
}

function fakeResponse() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function setup() {
  const db = fakeDb([
    { id: NOTE_A, owner_id: USER_A, title: 'A의 제목', content: 'A의 내용' },
    { id: NOTE_B, owner_id: USER_B, title: 'B의 제목', content: 'B의 내용' },
    { id: NOTE_NONE, owner_id: null, title: '주인 없음', content: '주인 없는 내용' },
  ]);
  const verifyAuthorization = async (header) => (TOKENS[header] ? { kind: 'student', userId: TOKENS[header] } : null);
  const store = createSupabaseNotesStore(db);
  return { db, store, api: createNotesApi({ verifyAuthorization, store }) };
}

const call = async (handler, { method = 'GET', token, query, body } = {}) => {
  const request = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, query: query ?? {}, body };
  const response = fakeResponse();
  await handler(request, response);
  return response;
};
const rowOf = (db, id) => db.rows.find((row) => row.id === id);

test('A와 B는 각자 자기 메모를 읽고 추가하고 고치고 지울 수 있다', async () => {
  const { api } = setup();
  for (const [token, own, title] of [['token-a', NOTE_A, 'A의 제목'], ['token-b', NOTE_B, 'B의 제목']]) {
    const list = await call(api.collection, { token });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.body.map((note) => note.title), [title], '목록에는 본인 메모만 있다');

    const one = await call(api.item, { token, query: { id: own } });
    assert.equal(one.statusCode, 200);
    assert.deepEqual(Object.keys(one.body).sort(), ['body', 'id', 'title'], 'owner_id는 응답에 싣지 않는다');

    const created = await call(api.collection, { method: 'POST', token, body: { title: '새 제목', body: '새 내용' } });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(Object.keys(created.body), ['id']);
    const id = created.body.id;

    const edited = await call(api.item, { method: 'PUT', token, query: { id }, body: { title: '고친 제목', body: '고친 내용' } });
    assert.deepEqual([edited.statusCode, edited.body], [200, { id, title: '고친 제목', body: '고친 내용' }]);

    const removed = await call(api.item, { method: 'DELETE', token, query: { id } });
    assert.deepEqual([removed.statusCode, removed.body], [200, { id }]);
    assert.equal((await call(api.item, { token, query: { id } })).statusCode, 404, '지운 뒤 조회는 404');
  }
});

test('상대 메모는 읽기·수정·삭제 모두 거부되고 자료가 바뀌지 않으며, 없는 메모와 응답이 같다', async () => {
  const { api, db } = setup();
  const before = JSON.stringify(db.rows);
  for (const [token, theirs] of [['token-b', NOTE_A], ['token-a', NOTE_B]]) {
    const read = await call(api.item, { token, query: { id: theirs } });
    const edit = await call(api.item, { method: 'PUT', token, query: { id: theirs }, body: { title: '해킹', body: '해킹' } });
    const remove = await call(api.item, { method: 'DELETE', token, query: { id: theirs } });
    for (const response of [read, edit, remove]) {
      assert.deepEqual([response.statusCode, response.body], [404, { error: 'NOT_FOUND' }]);
    }
    // 존재하지 않는 id와 똑같이 답해 남의 메모가 있는지조차 알려 주지 않는다.
    const missing = await call(api.item, { token, query: { id: MISSING } });
    assert.deepEqual([read.statusCode, read.body], [missing.statusCode, missing.body]);
  }
  assert.equal(JSON.stringify(db.rows), before, '거부된 요청은 DB를 바꾸지 않는다');
});

test('주인 없는 행은 누구에게도 보이지 않고 고치거나 지울 수 없다', async () => {
  const { api, db } = setup();
  for (const token of ['token-a', 'token-b']) {
    const list = await call(api.collection, { token });
    assert.equal(list.body.some((note) => note.id === NOTE_NONE), false);
    assert.equal((await call(api.item, { token, query: { id: NOTE_NONE } })).statusCode, 404);
    assert.equal((await call(api.item, { method: 'PUT', token, query: { id: NOTE_NONE }, body: { title: 'x' } })).statusCode, 404);
    assert.equal((await call(api.item, { method: 'DELETE', token, query: { id: NOTE_NONE } })).statusCode, 404);
  }
  assert.deepEqual(rowOf(db, NOTE_NONE), { id: NOTE_NONE, owner_id: null, title: '주인 없음', content: '주인 없는 내용', created_at: 3 });
});

test('수정으로 소유자를 바꾸려는 요청은 거부되고 소유자는 그대로다', async () => {
  const { api, db } = setup();
  for (const key of ['owner_id', 'ownerId', 'owner', 'user_id', 'userId']) {
    const response = await call(api.item, {
      method: 'PUT', token: 'token-a', query: { id: NOTE_A }, body: { title: '넘기기', [key]: USER_B },
    });
    assert.deepEqual([response.statusCode, response.body], [403, { error: 'OWNER_CHANGE_NOT_ALLOWED' }], key);
  }
  const nulled = await call(api.item, { method: 'PUT', token: 'token-a', query: { id: NOTE_A }, body: { title: '비우기', owner_id: null } });
  assert.equal(nulled.statusCode, 403);
  assert.deepEqual([rowOf(db, NOTE_A).owner_id, rowOf(db, NOTE_A).title], [USER_A, 'A의 제목']);

  // B가 자기 ID를 넣어 A의 메모를 빼앗으려 해도 상대 메모는 404이고 소유자는 그대로다.
  const steal = await call(api.item, { method: 'PUT', token: 'token-b', query: { id: NOTE_A }, body: { title: '탈취', owner_id: USER_B } });
  assert.equal(steal.statusCode, 404);
  assert.equal(rowOf(db, NOTE_A).owner_id, USER_A);

  // 화면은 {title, body}만 보냅니다. 본인 ID를 그대로 실어 보내도 소유자 이름이 들어 있으면 거부하고 자료는 바꾸지 않는다.
  const same = await call(api.item, { method: 'PUT', token: 'token-a', query: { id: NOTE_A }, body: { title: '그대로', owner_id: USER_A } });
  assert.deepEqual([same.statusCode, same.body], [403, { error: 'OWNER_CHANGE_NOT_ALLOWED' }]);
  assert.deepEqual([rowOf(db, NOTE_A).owner_id, rowOf(db, NOTE_A).title], [USER_A, 'A의 제목']);

  // 소유자 이름이 없는 정상 수정 {title, body}는 그대로 된다.
  const normal = await call(api.item, { method: 'PUT', token: 'token-a', query: { id: NOTE_A }, body: { title: '고침', body: '고친 내용' } });
  assert.deepEqual([normal.statusCode, normal.body], [200, { id: NOTE_A, title: '고침', body: '고친 내용' }]);
  assert.equal(rowOf(db, NOTE_A).owner_id, USER_A);
});

test('추가할 때 본문의 owner_id는 무시하고 확인된 사용자 ID로 저장한다', async () => {
  const { api, db } = setup();
  const response = await call(api.collection, {
    method: 'POST', token: 'token-a',
    body: { title: '제목', body: '내용', owner_id: USER_B, ownerId: USER_B, userId: USER_B, role: 'admin' },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(rowOf(db, response.body.id).owner_id, USER_A);
  const listB = await call(api.collection, { token: 'token-b' });
  assert.equal(listB.body.some((note) => note.id === response.body.id), false);
});

test('로그인 없는 요청은 401이고 DB를 건드리지 않는다', async () => {
  const { api, db } = setup();
  for (const token of [undefined, 'garbage', 'token-c']) {
    for (const [handler, base] of [
      [api.collection, { method: 'GET' }], [api.collection, { method: 'POST', body: { title: 't', body: 'b' } }],
      [api.item, { method: 'GET', query: { id: NOTE_A } }],
      [api.item, { method: 'PUT', query: { id: NOTE_A }, body: { title: 'x' } }],
      [api.item, { method: 'DELETE', query: { id: NOTE_A } }],
    ]) {
      const response = await call(handler, { ...base, token });
      assert.deepEqual([response.statusCode, response.body], [401, { error: 'UNAUTHORIZED' }]);
    }
  }
  assert.equal(db.log.length, 0);
});

test('목록·수정·삭제 쿼리에는 owner_id 조건이 붙고, 한 건 조회는 owner_id를 받아 API가 비교한다', async () => {
  const { api, db } = setup();
  await call(api.collection, { token: 'token-a' });
  await call(api.item, { token: 'token-a', query: { id: NOTE_A } });
  await call(api.item, { method: 'PUT', token: 'token-a', query: { id: NOTE_A }, body: { title: 'x' } });
  await call(api.item, { method: 'DELETE', token: 'token-a', query: { id: NOTE_A } });
  // 요청 순서: 목록 select, 한 건 get(select), 수정(get select 뒤 update), 삭제(get select 뒤 delete)
  assert.deepEqual(db.log.map(({ op }) => op), ['select', 'select', 'select', 'update', 'select', 'delete']);
  for (const entry of db.log.filter(({ op }) => op !== 'select')) {
    assert.ok(entry.filters.includes('owner_id'), `${entry.op}에 owner_id 조건이 없다`);
  }
  assert.ok(db.log[0].filters.includes('owner_id'), '목록에 owner_id 조건이 없다');
  // 한 건 조회는 id로 찾고, 돌려받은 owner_id를 notes-api가 검사한 사용자 ID와 비교한다(위의 상대 메모 시험이 이를 확인한다).
  assert.deepEqual(db.log[1].filters, ['id']);
});

test('저장소는 UUID가 아닌 사용자 ID를 DB에 보내기 전에 거부한다', async () => {
  const { store, db } = setup();
  for (const call2 of [
    () => store.list('x'), () => store.update(NOTE_A, 'x', { title: 't' }),
    () => store.remove(NOTE_A, 'x'), () => store.update(NOTE_A, undefined, { title: 't' }),
    () => store.create({ ownerId: 'x', title: 't', body: 'b' }),
  ]) {
    await assert.rejects(call2(), { code: 'bad_user_id' });
  }
  assert.equal(db.log.length, 0);
});

test('수정한 뒤의 행도 본인 소유여야 하고, 아니면 자료 없이 저장소 오류(502)로 막는다', async () => {
  const log = console.error;
  console.error = () => {};
  try {
    // 저장소가 남의 소유 행을 돌려주는 이상 상황을 만든다(조건이 지켜졌어도 응답 직전에 한 번 더 비교한다).
    const odd = {
      get: async (id) => ({ id, title: 't', body: 'c', ownerId: USER_A }),
      update: async (id) => ({ id, title: '남의 것', body: '남의 내용', ownerId: USER_B }),
    };
    const api = createNotesApi({ verifyAuthorization: async () => ({ kind: 'student', userId: USER_A }), store: odd });
    const response = await call(api.item, { method: 'PUT', token: 'x', query: { id: NOTE_A }, body: { title: 't' } });
    assert.deepEqual([response.statusCode, response.body], [502, { error: 'NOTES_STORE_FAILED' }]);
    assert.doesNotMatch(JSON.stringify(response.body), /남의/u);
  } finally {
    console.error = log;
  }
});

test('allowedRoutes는 이 API가 실제로 받는 메서드·경로와 같다', async () => {
  const { api } = setup();
  const routes = [];
  const collection = await call(api.collection, { method: 'PATCH', token: 'token-a' });
  for (const method of collection.headers.Allow.split(', ')) routes.push(`${method} /api/notes`);
  const item = await call(api.item, { method: 'PATCH', token: 'token-a', query: { id: NOTE_A } });
  for (const method of item.headers.Allow.split(', ')) routes.push(`${method} /api/notes/:id`);
  assert.deepEqual([...routes].sort(), [...config.allowedRoutes].sort());
  for (const file of ['../api/notes.js', '../api/notes/[id].js']) await readFile(new URL(file, import.meta.url), 'utf8');
});
