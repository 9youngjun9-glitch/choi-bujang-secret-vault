// 이 시험은 @supabase/supabase-js 설치(npm ci)가 필요합니다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/notes.js';

function fakeResponse() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function withEnv(values, run) {
  const saved = {};
  for (const key of Object.keys(values)) {
    saved[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
  }
  try { await run(); } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}

const fakeServer = { SUPABASE_URL: 'https://example-project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key' };

test('api/notes refuses non-GET and reports a missing server configuration', async () => {
  await withEnv({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }, async () => {
    const post = fakeResponse();
    await handler({ method: 'POST' }, post);
    assert.equal(post.statusCode, 405);
    const get = fakeResponse();
    await handler({ method: 'GET' }, get);
    assert.equal(get.statusCode, 503);
    assert.equal(get.headers['Cache-Control'], 'no-store');
  });
});

test('api/notes returns only title and content from the database and never the key', async () => {
  const originalFetch = globalThis.fetch;
  let requested;
  try {
    globalThis.fetch = async (url) => {
      requested = String(url);
      return new Response(JSON.stringify([{ title: '가상 제목', content: '가상 내용' }]), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    await withEnv(fakeServer, async () => {
      const response = fakeResponse();
      await handler({ method: 'GET' }, response);
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.body, { notes: [{ title: '가상 제목', content: '가상 내용' }] });
      assert.match(requested, /\/rest\/v1\/vault_notes\?/u);
      assert.equal(JSON.stringify(response.body).includes('not-a-real-key'), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api/notes hides database errors behind a fixed code', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  try {
    console.error = () => {};
    globalThis.fetch = async () => new Response(JSON.stringify({ code: '42501', message: 'permission denied' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
    await withEnv(fakeServer, async () => {
      const response = fakeResponse();
      await handler({ method: 'GET' }, response);
      assert.equal(response.statusCode, 502);
      assert.deepEqual(response.body, { error: 'NOTES_READ_FAILED' });
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});
