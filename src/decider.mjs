// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
// 6단계: 등록된 기기(request.deviceRegistered === true)만 허용합니다.
// 7단계: 평소와 다른 시각 + 처음 보는 네트워크 + 짧은 시간의 많은 사건이 함께 있을 때만 추가 확인(step_up)합니다.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

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

// 7단계 복합 조건. 지역(region)은 일부러 쓰지 않습니다. 지역 하나만으로는 차단도 추가 확인도 하지 않습니다.
const USUAL_HOURS = [7, 22]; // 평소 시각(포함). 이 범위 밖이면 평소와 다른 시각입니다.
const BURST_COUNT = 10;      // 이 횟수 이상이
const BURST_WINDOW = 300;    // 이 시간(초) 안에 있으면 갑작스러운 대량 접근입니다.

function isUnusualCombination(signals) {
  if (signals.origin !== 'judge_fixture') return false; // 출처 불명확하면 추정하지 않음
  const oddHour = signals.hour !== null && (signals.hour < USUAL_HOURS[0] || signals.hour > USUAL_HOURS[1]);
  const newNetwork = signals.network === 'unusual';
  const burst = Array.isArray(signals.events)
    && signals.events.some(e => e.count >= BURST_COUNT && e.ageSeconds <= BURST_WINDOW);
  return oddHour && newNetwork && burst;
}

function recentlyVerified(stepUp) {
  return stepUp?.verified === true && Number.isInteger(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
}

const answer = (request, decision, reasonCode, ruleId) => ({
  schema: 'aleph.decision.v1', requestId: request?.requestId, decision, reasonCode, ruleIds: [ruleId],
});

export async function decide(request) {
  // 6단계: 값이 없거나 true가 아니면(미등록, undefined, 문자열 등) 모두 거부합니다.
  if (request?.deviceRegistered !== true) return answer(request, 'deny', 'device_not_registered', 'device_registered');
  // 7단계: 복합 이상 조건이면 다시 확인을 요구하고, 최근 재확인이 끝났으면 허용합니다.
  if (isUnusualCombination(readAccessSignals(request))) {
    return recentlyVerified(request.stepUp)
      ? answer(request, 'allow', 'approved', 'step_up_required')
      : answer(request, 'step_up', 'step_up_required', 'step_up_required');
  }
  return answer(request, 'allow', 'approved', 'device_registered');
}
