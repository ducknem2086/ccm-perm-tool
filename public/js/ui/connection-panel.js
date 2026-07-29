import { state, persist, notify } from '../state.js';

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
  const token = document.getElementById('inp-token');
  const indicator = document.getElementById('token-indicator');
  const reload = document.getElementById('btn-reload-token');

  function refresh() {
    domain.value = state.domain;
    token.value = state.token;
    const has = Boolean(state.token.trim());
    indicator.textContent = has ? '● token ok' : '○ chưa có token';
    indicator.classList.toggle('is-off', !has);
    domain.classList.toggle('is-invalid', Boolean(domain.value) && !/^https?:\/\/\S+$/i.test(domain.value));
  }

  domain.addEventListener('input', () => { state.domain = domain.value.trim(); persist(); refresh(); notify(); });
  token.addEventListener('input', () => { state.token = token.value.trim(); persist(); refresh(); });

  reload.addEventListener('click', () => {
    const found = tryLoadToken();
    if (found) {
      state.token = found;
      persist();
      refresh();
      window.ccmToast?.('Đã nạp token từ cookie/localStorage của trang này', 'ok');
    } else {
      window.ccmToast?.(
        'Không đọc được access_token ở origin này. Trình duyệt chặn đọc cookie của domain khác — dán token thủ công vào ô bên dưới.',
        'error',
      );
    }
  });

  refresh();
  return { refresh };
}
