// 3단계: GET(목록)·POST(추가). 로그인한 사용자만 쓸 수 있습니다.
// 요청 처리 규칙은 src/notes-api.mjs, 토큰 검사는 틀의 src/verify-login.mjs입니다.
import { getNotesApi } from '../src/notes-runtime.mjs';

export default async function handler(request, response) {
  let api;
  try {
    api = await getNotesApi();
  } catch (error) {
    console.error('서버 설정 오류', error?.message ?? 'unknown');
    response.setHeader('Cache-Control', 'no-store');
    response.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
    return;
  }
  await api.collection(request, response);
}
