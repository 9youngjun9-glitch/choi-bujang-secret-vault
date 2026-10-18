// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
// 6단계: 등록된 기기(request.deviceRegistered === true)만 허용합니다.
export const RULE_IDS = Object.freeze(['device_registered']);

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
