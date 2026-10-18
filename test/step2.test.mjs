import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const judgeIssuer = 'https://aleph-judge-production.up.railway.app/defense/judge';
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('step 2 deployment identity has no starter marker; step 1 keeps it', () => {
  const two = deploymentIdentity(env, { step: 2, judgeIssuer });
  assert.equal(two.step, 2);
  assert.equal('sampleMarker' in two, false);
  assert.equal(JSON.stringify(two).includes('SAMPLE_NOTE'), false);
  const one = deploymentIdentity(env, { step: 1, judgeIssuer, sampleMarker: 'SAMPLE_NOTE_1' });
  assert.equal(one.sampleMarker, 'SAMPLE_NOTE_1');
  assert.throws(() => deploymentIdentity(env, { step: 6, judgeIssuer }));
});

test('step 2 attack check records the closed static path and the still-open API', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  try {
    globalThis.fetch = async (url) => {
      seen.push(new URL(String(url)).pathname);
      return new URL(String(url)).pathname === '/api/notes'
        ? new Response(JSON.stringify({ notes: [{}, {}, {}, {}] }), { status: 200 })
        : new Response('Not Found', { status: 404 });
    };
    const results = await runAttackChecks({ step: 2, publicAppUrl: 'https://student-defense.vercel.app' });
    assert.deepEqual(seen, ['/data.json', '/api/notes']);
    assert.deepEqual(results.map(item => item.attackId), ['static_data_json_read', 'anonymous_api_notes_read']);
    assert.match(results[0].observed, /HTTP 404.*보이지 않음/u);
    assert.match(results[1].observed, /메모 4건 수신/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
