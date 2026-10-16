// 3단계: 로그인한 사용자만 쓰는 가상 메모 API의 요청 처리 규칙입니다.
// 토큰 검사는 이 파일이 아니라 틀의 src/verify-login.mjs가 합니다(notes-runtime.mjs에서 연결).
// 브라우저가 보낸 userId·role·owner_id는 읽지도 믿지도 않습니다. 소유자는 검사가 끝난 토큰의 사용자 ID뿐입니다.
// 4단계: 읽기·수정·삭제는 검사한 사용자 ID와 DB 행의 owner_id가 같을 때만 허용합니다.
//        주인이 없거나 다른 사람 것이면 없는 메모와 똑같이 404로 답해 존재 여부도 알려 주지 않습니다(기본 거부).
//        목록은 본인 메모만 돌려주고, 수정 본문에 소유자를 바꾸려는 이름이 있으면 거부합니다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TITLE_MAX = 200;
const BODY_MAX = 5000;
// 수정 본문에 이 이름이 하나라도 있으면 소유자 변경 시도로 보고 거부합니다.
const OWNER_FIELDS = ['owner_id', 'ownerId', 'owner', 'userId', 'user_id'];

export const isUuid = (value) => typeof value === 'string' && UUID.test(value);
const sameUser = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
// 응답에는 id·title·body만 싣습니다. owner_id는 내보내지 않습니다.
const publicNote = (note) => ({ id: note.id, title: note.title, body: note.body });

function send(response, status, body, headers = {}) {
  response.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.status(status).json(body);
}

function readObject(request) {
  let body;
  try { body = request.body; } catch { return { error: 'INVALID_JSON' }; }
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return { error: 'INVALID_JSON' }; }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { error: 'INVALID_JSON' };
  return { value: body };
}

// title·body만 읽습니다. 다른 이름(userId, role, owner_id 등)은 있어도 값으로 쓰지 않습니다.
function readFields(input, { requireAll }) {
  const fields = {};
  if (requireAll || Object.hasOwn(input, 'title')) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > TITLE_MAX) {
      return { error: 'INVALID_TITLE' };
    }
    fields.title = input.title;
  }
  if (requireAll || Object.hasOwn(input, 'body')) {
    if (typeof input.body !== 'string' || input.body.length > BODY_MAX) return { error: 'INVALID_BODY' };
    fields.body = input.body;
  }
  if (!requireAll && !Object.keys(fields).length) return { error: 'NOTHING_TO_UPDATE' };
  return { value: fields };
}

export function createNotesApi({ verifyAuthorization, store }) {
  if (typeof verifyAuthorization !== 'function' || !store) throw new TypeError('invalid_notes_api_configuration');

  // 메서드 확인 → 로그인 확인. 로그인하지 못하면 자료·존재 여부·검증 오류를 하나도 알려 주지 않습니다.
  async function guard(request, response, allowed) {
    if (!allowed.includes(request.method)) {
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' }, { Allow: allowed.join(', ') });
      return null;
    }
    let auth;
    try {
      auth = await verifyAuthorization(request.headers?.authorization);
    } catch {
      console.error('로그인 검사 중 예외');
      send(response, 503, { error: 'AUTH_UNAVAILABLE' });
      return null;
    }
    if (!auth || !isUuid(auth.userId)) {
      send(response, 401, { error: 'UNAUTHORIZED' }, { 'WWW-Authenticate': 'Bearer' });
      return null;
    }
    return auth;
  }

  async function guarded(response, run) {
    try {
      await run();
    } catch (error) {
      if (error?.code === 'ID_EXISTS') { send(response, 409, { error: 'ID_EXISTS' }); return; }
      console.error('메모 저장소 오류', error?.code ?? 'unknown');
      send(response, 502, { error: 'NOTES_STORE_FAILED' });
    }
  }

  // /api/notes : GET(목록), POST(추가)
  async function collection(request, response) {
    const auth = await guard(request, response, ['GET', 'POST']);
    if (!auth) return;
    await guarded(response, async () => {
      if (request.method === 'GET') {
        // 저장소는 이 사용자의 owner_id 행만 돌려줍니다(주인 없는 행은 나오지 않습니다).
        send(response, 200, await store.list(auth.userId));
        return;
      }
      const parsed = readObject(request);
      if (parsed.error) { send(response, 400, { error: parsed.error }); return; }
      const fields = readFields(parsed.value, { requireAll: true });
      if (fields.error) { send(response, 400, { error: fields.error }); return; }
      let id;
      if (parsed.value.id !== undefined) {
        if (!isUuid(parsed.value.id)) { send(response, 400, { error: 'INVALID_ID' }); return; }
        id = parsed.value.id.toLowerCase();
      }
      // 본문의 owner_id·userId는 쓰지 않고, 검사가 끝난 토큰의 사용자 ID만 owner_id로 저장합니다.
      const created = await store.create({ id, ownerId: auth.userId, ...fields.value });
      send(response, 201, { id: created.id });
    });
  }

  // /api/notes/:id : GET(한 건), PUT(수정), DELETE(삭제)
  async function item(request, response) {
    const auth = await guard(request, response, ['GET', 'PUT', 'DELETE']);
    if (!auth) return;
    const raw = request.query?.id;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!isUuid(id)) { send(response, 404, { error: 'NOT_FOUND' }); return; }
    const noteId = id.toLowerCase();
    await guarded(response, async () => {
      // 소유자 비교: 검사한 사용자 ID와 DB 행의 owner_id가 같을 때만 다음으로 갑니다.
      // 없는 메모·남의 메모·주인 없는 메모는 모두 같은 404입니다. 입력 검사보다 먼저 합니다.
      const existing = await store.get(noteId);
      if (!existing || !sameUser(existing.ownerId, auth.userId)) {
        send(response, 404, { error: 'NOT_FOUND' });
        return;
      }
      if (request.method === 'GET') {
        send(response, 200, publicNote(existing));
        return;
      }
      if (request.method === 'DELETE') {
        // 저장소도 owner_id 조건을 걸어 지우므로 확인과 삭제 사이에 소유자가 바뀌어도 남의 것은 지워지지 않습니다.
        const removed = await store.remove(noteId, auth.userId);
        if (!removed) { send(response, 404, { error: 'NOT_FOUND' }); return; }
        send(response, 200, { id: noteId });
        return;
      }
      const parsed = readObject(request);
      if (parsed.error) { send(response, 400, { error: parsed.error }); return; }
      if (OWNER_FIELDS.some((name) => Object.hasOwn(parsed.value, name))) {
        send(response, 403, { error: 'OWNER_CHANGE_NOT_ALLOWED' });
        return;
      }
      const fields = readFields(parsed.value, { requireAll: false });
      if (fields.error) { send(response, 400, { error: fields.error }); return; }
      const updated = await store.update(noteId, auth.userId, fields.value);
      if (!updated) { send(response, 404, { error: 'NOT_FOUND' }); return; }
      // 수정한 뒤의 행도 본인 것이어야 합니다. 어긋나면 응답하지 않고 저장소 오류로 처리합니다.
      if (!sameUser(updated.ownerId, auth.userId)) {
        throw Object.assign(new Error('owner_mismatch'), { code: 'OWNER_MISMATCH' });
      }
      send(response, 200, publicNote(updated));
    });
  }

  return { collection, item };
}
