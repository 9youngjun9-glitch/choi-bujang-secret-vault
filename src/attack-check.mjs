// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (config.step === 2) return runStepTwoChecks(app);
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}

// 2단계: 옛 공개 경로는 닫혔는지, 서버 API는 아직 열려 있는지 비로그인으로 직접 요청해 봅니다.
// 메모 본문은 읽지도 기록하지도 않고 건수만 셉니다.
async function readNoteCount(app, path) {
  const response = await fetch(new URL(path, app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let count = null;
  if (response.ok) {
    try {
      const data = await response.json();
      if (Array.isArray(data?.notes)) count = data.notes.length;
    } catch {
      // A non-JSON response is not a note list.
    }
  }
  return { status: response.status, count };
}

async function runStepTwoChecks(app) {
  const staticRead = await readNoteCount(app, '/data.json');
  const apiRead = await readNoteCount(app, '/api/notes');
  return [
    { attackId: 'static_data_json_read', expected: '비로그인으로 /data.json을 요청해도 가상 메모가 나오지 않음',
      observed: staticRead.count > 0
        ? `HTTP ${staticRead.status}, 비로그인 요청에서 메모 ${staticRead.count}건이 보임`
        : `HTTP ${staticRead.status}, 비로그인 요청에서 메모가 보이지 않음` },
    { attackId: 'anonymous_api_notes_read', expected: '비로그인 서버 API 호출이 아직 막히지 않은 약점을 관찰',
      observed: apiRead.count > 0
        ? `HTTP ${apiRead.status}, 비로그인 요청에서 메모 ${apiRead.count}건 수신 (아직 열려 있음, 본문은 기록하지 않음)`
        : `HTTP ${apiRead.status}, 메모를 받지 못함 (서버 환경변수와 DB 연결 확인 필요)` },
  ];
}
