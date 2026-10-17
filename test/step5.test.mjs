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
