// 5단계 설정 시험: 원본 자료 경로가 올바른 모양이고, 화면이 자료 저장소를 직접 부르지 않는지 봅니다.
// 외부 패키지와 네트워크가 필요 없습니다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));

test('originalApiUrl은 로그인 발급자와 같은 Supabase 프로젝트의 vault_notes를 가리키는 쿼리 없는 HTTPS 경로다', () => {
  const url = new URL(config.originalApiUrl);
  assert.ok(config.originalApiUrl.startsWith('https://'), 'scripts/bundle.mjs가 요구하는 HTTPS 주소');
  assert.equal(url.protocol, 'https:');
  assert.equal(url.origin, new URL(config.identityProvider.issuer).origin);
  assert.equal(url.pathname, '/rest/v1/vault_notes');
  assert.deepEqual([url.search, url.hash, url.username, url.password, url.port], ['', '', '', '', '']);
  assert.equal(config.originalApiUrl, `${url.origin}${url.pathname}`, '끝의 /·? 같은 덧붙임이 없다');
  assert.doesNotMatch(config.originalApiUrl, /apikey|sb_|eyJ|service_role|token|password/iu);
});

test('화면 코드는 자료 저장소를 직접 부르지 않고 /api/notes 서버 함수만 쓴다(로그인 Auth 호출은 그대로)', async () => {
  const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /\.from\(|\.rpc\(|\/rest\/v1|vault_notes|\.storage\b/u);
  assert.match(page, /signInWithPassword/u);
  assert.match(page, /signOut/u);
  assert.match(page, /\/api\/notes/u);
  assert.doesNotMatch(page, /sb_secret_|service_role/iu, '서버 전용 키는 화면에 없다');
});

test('aleph.config.json은 5단계이고 5단계 배포 식별을 허용하며 6단계는 아직 허용하지 않는다', async () => {
  const { deploymentIdentity } = await import('../scripts/deployment-identity.mjs');
  const env = {
    VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'Student-A', VERCEL_GIT_REPO_SLUG: 'aleph-defense',
    VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'student-defense-123.vercel.app',
  };
  assert.equal(config.step, 5);
  assert.equal(deploymentIdentity(env, { step: 5, judgeIssuer: config.judgeIssuer }).step, 5);
  assert.throws(() => deploymentIdentity(env, { step: 6, judgeIssuer: config.judgeIssuer }));
});

test('자기 점검의 직접 요청 확인: 쿼리 없이 originalApiUrl만 부르고 상태·건수만 기록한다', async () => {
  const { runAttackChecks } = await import('../src/attack-check.mjs');
  const originalFetch = globalThis.fetch;
  const run = async (respond) => {
    const seen = [];
    globalThis.fetch = async (url, init) => {
      const u = new URL(String(url));
      if (u.origin === new URL(config.originalApiUrl).origin) {
        seen.push({ href: u.href, headers: init?.headers });
        return respond();
      }
      return new Response('Not Found', { status: 404 });
    };
    const results = await runAttackChecks({ ...config });
    return { seen, last: results.find(r => r.attackId === 'original_api_direct_anon') };
  };
  try {
    const denied = await run(() => new Response(JSON.stringify({ message: 'permission denied' }), { status: 401 }));
    assert.match(denied.last.observed, /^HTTP 401, 자료 없이 거부됨$/u);
    assert.ok(denied.seen.length >= 1);
    assert.ok(denied.seen.every(item => item.href === config.originalApiUrl), '쿼리·덧붙임 없음');

    const open = await run(() => new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), { status: 200 }));
    assert.match(open.last.observed, /거부되지 않음 \(자료 2건\)/u);
    assert.doesNotMatch(JSON.stringify(open.last), /"id"|eyJ|sb_/u, '본문·키는 기록하지 않는다');

    const offline = await run(() => { throw new TypeError('fetch failed'); });
    assert.match(offline.last.observed, /^미실행/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
