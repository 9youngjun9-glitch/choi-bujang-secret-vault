// GET(한 건)·PUT(수정)·DELETE(삭제). 로그인한 사용자만 쓸 수 있고(3단계),
// 검증한 사용자 ID와 메모의 owner_id가 같은 메모에만 적용됩니다(4단계, 규칙은 src/notes-api.mjs).
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
