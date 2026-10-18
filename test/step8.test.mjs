// 8단계 자원 구분 시험: 메모와 강사 공지는 서로 다른 자원 ID를 받고, 알 수 없는 경로는 ID가 없다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNotesApi } from '../src/notes-api.mjs';
import { RESOURCE_IDS, resourceForPath } from '../src/resources.mjs';

const ID = '11111111-2222-4333-8444-555555555555';

test('메모와 강사 공지는 서로 다른 자원 ID를 가진다', () => {
  assert.notEqual(RESOURCE_IDS.memo, RESOURCE_IDS.announcement);
  assert.equal(resourceForPath('/api/notes'), 'notes.memo');
  assert.equal(resourceForPath(`/api/notes/${ID}`), 'notes.memo');
  assert.equal(resourceForPath(`/api/notes/${ID}?x=1`), 'notes.memo', '쿼리는 자원을 바꾸지 못한다');
  assert.equal(resourceForPath('/notes'), 'notes.memo', '판정 요청의 path 모양도 같다');
  assert.equal(resourceForPath('/api/announcements'), 'notes.announcement');
  assert.equal(resourceForPath(`/announcements/${ID.toUpperCase()}`), 'notes.announcement');
});

test('목록에 없거나 경로를 흉내 낸 값은 자원 ID가 없다', () => {
  for (const path of ['/api/notes/', '/api/notes/abc', '/api/notes/..', `/api/notes/${ID}/x`, '/api/notesx',
    '//api/notes', '/api/%6eotes', '/API/notes', '/api/announcements/x', '', undefined, null, 5, '/'.repeat(400)]) {
    assert.equal(resourceForPath(path), null, String(path));
  }
});

const store = { list: async () => [], get: async () => null, create: async (n) => n, update: async () => null, remove: async () => false };
const api = createNotesApi({ verifyAuthorization: async () => ({ userId: ID }), store });
async function call(handler, request) {
  const out = { status: 0, body: null, headers: {} };
  const response = { setHeader: (k, v) => { out.headers[k] = v; }, status(code) { out.status = code; return this; }, json(body) { out.body = body; } };
  await handler({ headers: { authorization: 'Bearer t' }, query: {}, ...request }, response);
  return out;
}

test('서버는 요청마다 자원 ID를 구별하고 메모만 처리한다', async () => {
  assert.equal(api.resourceOf({ url: '/api/notes' }), 'notes.memo');
  assert.equal(api.resourceOf({ url: '/api/announcements' }), 'notes.announcement');
  assert.equal(api.resourceOf({ url: '/api/other' }), null, '목록에 없는 경로는 자원 ID가 없다');
  assert.equal(api.resourceOf({}), null);
  const memo = await call(api.collection, { method: 'GET', url: '/api/notes' });
  assert.equal(memo.status, 200);
  for (const url of ['/api/announcements', `/api/announcements/${ID}`]) {
    const other = await call(api.collection, { method: 'GET', url });
    assert.equal(other.status, 404, url);
    assert.deepEqual(other.body, { error: 'NOT_FOUND' });
  }
  const item = await call(api.item, { method: 'GET', url: `/api/announcements/${ID}`, query: { id: ID } });
  assert.equal(item.status, 404);
});
