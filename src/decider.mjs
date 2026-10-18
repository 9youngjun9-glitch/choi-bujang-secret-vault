// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
// 6단계: 등록된 기기(request.deviceRegistered === true)만 허용합니다.
export const RULE_IDS = Object.freeze(['device_registered']);

// 7단계 입력 검사: 엔진이 넘긴 request.signals·request.recentEvents만 읽고, 출처를 구분해 돌려줍니다.
// - 'judge_fixture': 심판이 보낸 가상 접속 사건. 연습·시험에만 쓰며 실제 위치 증거가 아닙니다.
// - 'none' 또는 그 밖의 값, 없음: 출처 불명확. 지역·시각·네트워크·행동을 정상값으로 채우지 않고 null로 둡니다.
// 브라우저 헤더, request.headers·geo·ip 같은 계약에 없는 값은 읽지 않으므로 신뢰 정보로 올라가지 않습니다.
const LABEL = /^[a-z][a-z0-9_]{0,31}$/u;
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

function readEvents(list) {
  if (!Array.isArray(list) || list.length > 12) return null;
  const events = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.kind !== 'string' || !LABEL.test(item.kind)
        || !isInt(item.ageSeconds, 0, 86400) || !isInt(item.count, 1, 100000)) return null;
    events.push({ kind: item.kind, ageSeconds: item.ageSeconds, count: item.count });
  }
  return events;
}

export function readAccessSignals(request) {
  const signals = request?.signals;
  const virtual = signals && typeof signals === 'object' && !Array.isArray(signals)
    && signals.source === 'judge_fixture';
  const events = virtual ? readEvents(request.recentEvents) : null;
  if (!virtual) {
    return { origin: 'unverified', realEvidence: false, region: null, network: null, hour: null, events };
  }
  return {
    origin: 'judge_fixture', realEvidence: false,
    region: typeof signals.region === 'string' && LABEL.test(signals.region) && signals.region !== 'unknown' ? signals.region : null,
    network: typeof signals.network === 'string' && LABEL.test(signals.network) && signals.network !== 'unknown' ? signals.network : null,
    hour: isInt(signals.hour, 0, 23) ? signals.hour : null,
    events,
  };
}

export async function decide(request) {
  // 값이 없거나 true가 아니면(미등록, undefined, 문자열 등) 모두 거부합니다.
  const registered = request?.deviceRegistered === true;
  return {
    schema: 'aleph.decision.v1',
    requestId: request?.requestId,
    decision: registered ? 'allow' : 'deny',
    reasonCode: registered ? 'approved' : 'device_not_registered',
    ruleIds: [RULE_IDS[0]],
  };
}
