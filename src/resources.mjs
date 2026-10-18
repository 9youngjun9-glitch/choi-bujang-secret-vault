// 8단계: 자료실의 자원을 종류별 ID로 구분합니다. 요청 경로는 정확히 일치할 때만 ID를 받고,
// 목록에 없는 경로는 null(알 수 없음)입니다. 알 수 없는 자원은 허용하지 않습니다.
// 브라우저가 보낸 값(헤더·쿼리·본문)은 자원을 정하는 데 쓰지 않습니다. 경로 모양만 봅니다.
export const RESOURCE_IDS = Object.freeze({
  memo: 'notes.memo',                   // 학생 본인의 가상 메모 (/api/notes, /api/notes/:id)
  announcement: 'notes.announcement',   // 강사 공지 (/api/announcements, /api/announcements/:id) — 자료·API는 아직 없음
});

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATTERNS = Object.freeze([
  [new RegExp('^/(?:api/)?notes$', 'u'), RESOURCE_IDS.memo],
  [new RegExp(`^/(?:api/)?notes/${UUID}$`, 'iu'), RESOURCE_IDS.memo],
  [new RegExp('^/(?:api/)?announcements$', 'u'), RESOURCE_IDS.announcement],
  [new RegExp(`^/(?:api/)?announcements/${UUID}$`, 'iu'), RESOURCE_IDS.announcement],
]);

// "/api/notes/…?x=1" 또는 판정 요청의 path("/notes/…")에서 자원 ID를 돌려줍니다. 모르면 null.
export function resourceForPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length > 300) return null;
  const path = rawPath.split(/[?#]/u, 1)[0];
  for (const [pattern, id] of PATTERNS) if (pattern.test(path)) return id;
  return null;
}
