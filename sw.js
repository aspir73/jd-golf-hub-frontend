// JD Golf 서비스워커
// 1) 설치(PWA) 조건용 - 캐시는 하지 않고 항상 네트워크로 통과시킨다(캐시하면 배포 후에도 예전 화면이 남음).
// 2) 라운드 진행 알림 - 스코어 입력 중에는 알림바/잠금화면에 스코어카드 요약이 계속 떠 있고,
//    알림 버튼(버디/파/보기)으로 앱을 열지 않고 다음 홀 점수를 바로 기록한다. 알림을 누르면 입력 화면으로 이동.

const DB_NAME = 'jdgolf';
const STORE = 'kv';
const TAG = 'jd-round';

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function kvGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const q = db.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
async function kvSet(key, val) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function kvDel(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const rel = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);

async function showRoundNotification(state, note) {
  const holes = state.payload.holes || [];
  const filled = holes.filter((h) => h.score != null);
  const total = filled.reduce((s, h) => s + h.score, 0);
  const diff = total - filled.reduce((s, h) => s + (h.par || 0), 0);
  const next = holes.find((h) => h.score == null);
  const line = (list) => list.map((h) => (h.score == null ? '·' : h.score)).join(' ');
  const scoreLines = `전반 ${line(holes.slice(0, 9))}` + (holes.length > 9 ? `\n후반 ${line(holes.slice(9))}` : '');
  const head = next
    ? `다음 ${next.no}H 파${next.par} · ${filled.length}/${holes.length}홀 · 합계 ${total}${filled.length ? ` (${rel(diff)})` : ''}`
    : `${holes.length}홀 입력 완료 · 합계 ${total} (${rel(diff)}) · 앱에서 라운드를 종료하세요`;
  const options = {
    body: `${note ? note + '\n' : ''}${head}\n${scoreLines}`,
    tag: TAG,
    renotify: false,
    silent: true,
    requireInteraction: true,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: '/?resume=round' },
    actions: next
      ? [
          { action: 'birdie', title: '버디 −1' },
          { action: 'par', title: '파 E' },
          { action: 'bogey', title: '보기 +1' },
        ]
      : [],
  };
  await self.registration.showNotification(state.payload.courseName || 'JD Golf', options);
}

async function closeRoundNotification() {
  const list = await self.registration.getNotifications({ tag: TAG });
  list.forEach((n) => n.close());
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request));
});

// 페이지가 저장할 때마다 최신 라운드 상태를 보내준다.
self.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type === 'round-state') {
    e.waitUntil((async () => {
      await kvSet('round', msg.state);
      await showRoundNotification(msg.state);
    })());
  } else if (msg.type === 'round-clear') {
    e.waitUntil((async () => { await kvDel('round'); await closeRoundNotification(); })());
  }
});

async function openApp() {
  // 페이지가 백그라운드에서 메모리에서 내려가 있으면 focus()가 페이지를 새로 로드하면서 아래 postMessage가
  // 유실된다 - 그래서 먼저 IndexedDB에 "입력 화면 열기" 요청을 남겨두고, 페이지가 로드될 때 이걸 보고 입력 화면을 연다.
  await kvSet('resumeRequest', Date.now()).catch(() => {});
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (wins.length) {
    const w = wins.find((c) => c.visibilityState === 'visible') || wins[0];
    try {
      const focused = await w.focus();
      (focused || w).postMessage({ type: 'resume-round' });
      return;
    } catch {
      // focus 실패(권한/창 상태) 시 새 창으로 연다
    }
  }
  await self.clients.openWindow('/?resume=round');
}

async function quickScore(action) {
  const state = await kvGet('round');
  if (!state) return openApp();
  const holes = state.payload.holes || [];
  const idx = holes.findIndex((h) => h.score == null);
  if (idx < 0) return showRoundNotification(state);
  const h = holes[idx];
  const delta = { birdie: -1, par: 0, bogey: 1 }[action] ?? 0;
  h.score = h.par + delta;
  h.shots = Math.max(0, h.score - (h.putts || 0) - (h.penalty || 0));
  h.at = h.at || new Date().toISOString(); // 홀 입력 시각(인사이트 분석용)
  if (h.pro) h.pro.manual = true; // 알림 버튼으로 넣은 스코어는 프로 모드 자동 계산이 덮어쓰지 않게
  state.payload.totalScore = holes.filter((x) => x.score != null).reduce((s, x) => s + x.score, 0);
  state.payload.status = 'in_progress';
  try {
    const res = await fetch(`${state.apiBase}/api/scores/${state.recordId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await kvSet('round', state);
    await showRoundNotification(state, `${h.no}H ${h.score}타 기록됨`);
  } catch (err) {
    // 저장 실패 시 되돌린다(알림에는 이전 상태 그대로, 오류만 표시)
    h.score = null; h.shots = null;
    await showRoundNotification(state, '저장 실패 - 네트워크를 확인해주세요');
  }
}

self.addEventListener('notificationclick', (e) => {
  const action = e.action;
  e.notification.close();
  if (action === 'birdie' || action === 'par' || action === 'bogey') {
    e.waitUntil(quickScore(action));
  } else {
    e.waitUntil(openApp());
  }
});
