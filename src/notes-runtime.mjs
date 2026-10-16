// 3단계: 실제 토큰 검사기(src/verify-login.mjs)와 Supabase 저장소를 notes-api에 연결합니다.
// 서버 전용 키는 Vercel 환경변수 SUPABASE_SERVICE_ROLE_KEY에서만 읽습니다. 코드·Git·화면에는 넣지 않습니다.
// 4단계: 서버 키는 RLS를 거치지 않으므로, 목록·수정·삭제 쿼리에 owner_id 조건을 직접 겁니다.
//        한 건 조회(get)는 owner_id를 함께 돌려주어 notes-api가 검사한 사용자 ID와 비교합니다.
import config from '../aleph.config.json' with { type: 'json' };
import { createNotesApi } from './notes-api.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const LIST_COLUMNS = 'id, title, content';
const COLUMNS = `${LIST_COLUMNS}, owner_id`;
const toNote = (row) => ({ id: row.id, title: row.title, body: row.content });
// 서버 안에서만 쓰는 모양입니다. notes-api가 비교한 뒤 owner_id를 떼고 응답합니다.
const toOwned = (row) => ({ ...toNote(row), ownerId: row.owner_id ?? null });

function storeError(error) {
  return Object.assign(new Error('notes_store_failed'), { code: error?.code ?? 'unknown' });
}

function requireUser(userId) {
  if (typeof userId !== 'string' || !UUID.test(userId)) throw storeError({ code: 'bad_user_id' });
}

// DB 칸 이름은 content, API 이름은 body입니다.
export function createSupabaseNotesStore(supabase) {
  return {
    async list(userId) {
      requireUser(userId);
      // 이 사용자의 메모만 돌려줍니다. 주인이 없는(owner_id 없음) 행은 아무에게도 보이지 않습니다.
      const { data, error } = await supabase.from('vault_notes').select(LIST_COLUMNS)
        .eq('owner_id', userId)
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      if (error) throw storeError(error);
      return data.map(toNote);
    },
    async get(id) {
      const { data, error } = await supabase.from('vault_notes').select(COLUMNS)
        .eq('id', id).maybeSingle();
      if (error) throw storeError(error);
      return data ? toOwned(data) : null;
    },
    async create({ id, ownerId, title, body }) {
      requireUser(ownerId);
      const row = { owner_id: ownerId, title, content: body };
      if (id) row.id = id;
      const { data, error } = await supabase.from('vault_notes').insert(row).select('id').single();
      if (error) {
        throw error.code === '23505'
          ? Object.assign(new Error('id_exists'), { code: 'ID_EXISTS' }) : storeError(error);
      }
      return { id: data.id };
    },
    async update(id, userId, { title, body }) {
      requireUser(userId);
      // owner_id는 patch에 넣지 않고, 이 사용자의 행일 때만 바꿉니다.
      const patch = {};
      if (title !== undefined) patch.title = title;
      if (body !== undefined) patch.content = body;
      const { data, error } = await supabase.from('vault_notes').update(patch)
        .eq('id', id).eq('owner_id', userId).select(COLUMNS).maybeSingle();
      if (error) throw storeError(error);
      return data ? toOwned(data) : null;
    },
    async remove(id, userId) {
      requireUser(userId);
      const { data, error } = await supabase.from('vault_notes').delete()
        .eq('id', id).eq('owner_id', userId).select('id').maybeSingle();
      if (error) throw storeError(error);
      return Boolean(data);
    },
  };
}

let cached;

// 서버 런타임에서 한 번만 만듭니다. 환경변수나 설정이 잘못되면 던지고, 호출한 쪽은 503으로 거부합니다.
export async function getNotesApi() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('missing_server_configuration');
  const [{ createClient }, { createLoginVerifier }] = await Promise.all([
    import('@supabase/supabase-js'), import('./verify-login.mjs'),
  ]);
  const verifyAuthorization = createLoginVerifier({ config, supabaseSecretKey: key });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  cached = createNotesApi({ verifyAuthorization, store: createSupabaseNotesStore(supabase) });
  return cached;
}
