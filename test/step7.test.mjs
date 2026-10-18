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
