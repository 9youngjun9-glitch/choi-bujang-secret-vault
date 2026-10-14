// 3단계: 로그인한 사용자만 쓰는 가상 메모 API의 요청 처리 규칙입니다.
// 토큰 검사는 이 파일이 아니라 틀의 src/verify-login.mjs가 합니다(notes-runtime.mjs에서 연결).
// 브라우저가 보낸 userId·role·owner_id는 읽지도 믿지도 않습니다. 소유자는 검사가 끝난 토큰의 사용자 ID뿐입니다.
// 아직 소유자 검사는 없습니다. 로그인한 다른 사용자도 id만 알면 남의 메모를 고칠 수 있습니다(4단계에서 막습니다).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TITLE_MAX = 200;
const BODY_MAX = 5000;

export const isUuid = (value) => typeof value === 'string' && UUID.test(value);

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

// title·body만 읽습니다. 다른 이름(userId, role, owner_id 등)은 있어도 무시합니다.
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
      if (request.method === 'GET') {
        const note = await store.get(noteId);
        if (!note) { send(response, 404, { error: 'NOT_FOUND' }); return; }
        send(response, 200, note);
        return;
      }
      if (request.method === 'DELETE') {
        const removed = await store.remove(noteId);
        if (!removed) { send(response, 404, { error: 'NOT_FOUND' }); return; }
        send(response, 200, { id: noteId });
        return;
      }
      const parsed = readObject(request);
      if (parsed.error) { send(response, 400, { error: parsed.error }); return; }
      const fields = readFields(parsed.value, { requireAll: false });
      if (fields.error) { send(response, 400, { error: fields.error }); return; }
      const updated = await store.update(noteId, fields.value);
      if (!updated) { send(response, 404, { error: 'NOT_FOUND' }); return; }
      send(response, 200, updated);
    });
  }

  return { collection, item };
}
