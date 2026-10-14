// 3단계: GET(한 건)·PUT(수정)·DELETE(삭제). 로그인한 사용자만 쓸 수 있습니다.
// 아직 소유자 검사는 없습니다(4단계에서 추가합니다).
import { getNotesApi } from '../../src/notes-runtime.mjs';

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
  await api.item(request, response);
}
