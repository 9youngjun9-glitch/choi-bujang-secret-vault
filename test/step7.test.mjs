// 7단계 입력 검사 시험: 출처를 구분하고, 없거나 불명확한 값은 정상값으로 채우지 않는다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { decide, readAccessSignals } from '../src/decider.mjs';

const { normal, suspicious } = fixtureRequests();

test('심판 가상 요청은 judge_fixture 출처로 읽고 실제 위치 증거로는 취급하지 않는다', () => {
  const read = readAccessSignals(suspicious);
  assert.deepEqual(read, { origin: 'judge_fixture', realEvidence: false, region: 'foreign',
    network: 'unusual', hour: 3, events: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }] });
  assert.equal(readAccessSignals(normal).events.length, 0);
});

test('출처가 none이거나 없으면 정상값으로 채우지 않고 null로 둔다', () => {
  for (const signals of [{ source: 'none', region: 'unknown', network: 'unknown', hour: 14 }, undefined, null, 'x', []]) {
    const read = readAccessSignals({ ...normal, signals });
    assert.deepEqual([read.origin, read.region, read.network, read.hour, read.events],
      ['unverified', null, null, null, null]);
  }
  assert.equal(readAccessSignals(undefined).origin, 'unverified');
});

test('위조한 헤더·지역·역할 필드와 클라이언트 출처는 신뢰 정보로 올라가지 않는다', () => {
  const forged = { ...normal, headers: { 'x-forwarded-for': '1.1.1.1', 'x-geo-region': 'local' }, geo: { region: 'local' },
    ip: '10.0.0.1', role: 'teacher', signals: { source: 'client', region: 'local', network: 'usual', hour: 14 } };
  const read = readAccessSignals(forged);
  assert.equal(read.origin, 'unverified');
  assert.equal(read.region, null);
  assert.equal(read.network, null);
  assert.equal(read.hour, null);
  assert.equal(read.realEvidence, false);
  assert.equal(JSON.stringify(read).includes('1.1.1.1'), false);
});

test('모양이 틀린 값은 버리고 임의의 정상값으로 바꾸지 않는다', () => {
  const bad = readAccessSignals({ ...normal, signals: { source: 'judge_fixture', region: 'Local!', network: 7, hour: 25 },
    recentEvents: [{ kind: 'risk_signal', ageSeconds: -1, count: 2 }] });
  assert.deepEqual([bad.region, bad.network, bad.hour, bad.events], [null, null, null, null]);
  assert.equal(readAccessSignals({ ...normal, recentEvents: new Array(13).fill({ kind: 'a', ageSeconds: 1, count: 1 }) }).events, null);
  assert.equal(readAccessSignals({ ...normal, signals: { ...normal.signals, region: 'unknown' } }).region, null);
});

test('입력 검사만 바뀌었고 6단계 판정은 그대로다', async () => {
  assert.equal((await decide(normal)).decision, 'allow');
  const denied = await decide({ ...normal, deviceRegistered: false });
  assert.deepEqual([denied.decision, denied.reasonCode], ['deny', 'device_not_registered']);
});

test('복합 이상 사건은 step_up, 정상 사건은 allow이고 재확인 뒤에는 allow', async () => {
  const { randomUUID } = await import('node:crypto');
  const flagged = await decide(suspicious);
  assert.deepEqual([flagged.decision, flagged.reasonCode, flagged.ruleIds], ['step_up', 'step_up_required', ['step_up_required']]);
  assert.equal((await decide(normal)).decision, 'allow');
  const again = await decide({ ...suspicious, requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } });
  assert.equal(again.decision, 'allow');
  const stale = await decide({ ...suspicious, stepUp: { verified: true, authAgeSeconds: 5000 } });
  assert.equal(stale.decision, 'step_up');
});

test('지역 하나만, 또는 조건 일부만으로는 추가 확인하지 않는다', async () => {
  const sig = (patch) => ({ ...suspicious, signals: { ...suspicious.signals, ...patch } });
  assert.equal((await decide({ ...normal, signals: { ...normal.signals, region: 'foreign' } })).decision, 'allow');
  assert.equal((await decide(sig({ region: 'local' }))).decision, 'step_up', '지역은 판단에 쓰지 않는다');
  assert.equal((await decide(sig({ hour: 14 }))).decision, 'allow');
  assert.equal((await decide(sig({ network: 'usual' }))).decision, 'allow');
  assert.equal((await decide({ ...suspicious, recentEvents: [] })).decision, 'allow');
  assert.equal((await decide({ ...suspicious, recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 3 }] })).decision, 'allow');
});

test('출처가 불명확하거나 위조된 신호는 추가 확인으로 올라가지도 정상으로 채워지지도 않는다', async () => {
  const unverified = await decide({ ...suspicious, signals: { ...suspicious.signals, source: 'client' } });
  assert.equal(unverified.decision, 'allow');
  assert.equal((await decide({ ...suspicious, deviceRegistered: false })).reasonCode, 'device_not_registered');
});
