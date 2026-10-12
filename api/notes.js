// 2단계: 메모는 코드와 정적 파일 밖(Supabase)에 두고, 서버 함수가 읽어 줍니다.
// 서버 전용 키는 Vercel 환경변수에서만 읽습니다. 코드·Git·화면에는 넣지 않습니다.
// 주의: 3단계 로그인을 붙이기 전까지 이 API는 누구나 호출할 수 있습니다. 가상 메모만 둡니다.
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    response.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
    return;
  }
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('vault_notes')
      .select('title, content')
      .order('created_at', { ascending: true })
      .order('title', { ascending: true });
    if (error) {
      console.error('vault_notes 조회 실패', error.code ?? 'unknown');
      response.status(502).json({ error: 'NOTES_READ_FAILED' });
      return;
    }
    response.status(200).json({ notes: data });
  } catch {
    console.error('vault_notes 조회 중 예외');
    response.status(502).json({ error: 'NOTES_READ_FAILED' });
  }
}
