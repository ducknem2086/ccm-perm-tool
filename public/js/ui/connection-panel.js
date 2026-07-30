import { state, persist, notify } from '../state.js';
import { hasToken } from '../shared/auth-utils.js';

function readCookie(name) {
  return document.cookie
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1] ?? null;
}

export function tryLoadToken() {
  try {
    return readCookie('access_token')
      ?? localStorage.getItem('access_token')
      ?? sessionStorage.getItem('access_token')
      ?? null;
  } catch { return null; }
}

export function initConnectionPanel() {
  const domain = document.getElementById('inp-domain');
  const indicator = document.getElementById('token-indicator');
  const reload = document.getElementById('btn-reload-token');

  function refresh() {
    domain.value = state.domain;

    const auths = state.auths ?? [];
    const withToken = auths.filter(hasToken).length;
    indicator.textContent = `${withToken > 0 ? '●' : '○'} ${withToken}/${auths.length} auth có token`;
    indicator.classList.toggle('is-off', withToken === 0);

    domain.classList.toggle('is-invalid', Boolean(domain.value) && !/^https?:\/\/\S+$/i.test(domain.value));
  }

  domain.addEventListener('input', () => { state.domain = domain.value.trim(); persist(); refresh(); notify(); });

  // Ghi vao profile dau tien dang duoc chon, khong chon gi thi profile dau danh sach.
  function targetAuth() {
    const chosen = state.runFilter?.authIds ?? [];
    return (state.auths ?? []).find((a) => chosen.includes(a.id)) ?? state.auths?.[0] ?? null;
  }

  reload.addEventListener('click', () => {
    const found = tryLoadToken();
    const auth = targetAuth();
    if (found && auth) {
      auth.token = found;
      auth.mode = 'fields';
      persist();
      refresh();
      notify();
      window.ccmToast?.(`Đã nạp token vào profile "${auth.name}"`, 'ok');
    } else {
      window.ccmToast?.(
        'Không đọc được access_token ở origin này. Trình duyệt chặn đọc cookie của domain khác — dán token thủ công vào tab AUTHS.',
        'error',
      );
    }
  });

  refresh();
  return { refresh };
}
