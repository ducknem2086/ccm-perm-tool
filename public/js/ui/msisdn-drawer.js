import { state, persist, notify } from '../state.js';
import { createEditableList } from './editable-list.js';

export function initMsisdnDrawer() {
  const singleInput = document.getElementById('inp-single-msisdn');
  const countEl = document.getElementById('msisdn-count');
  const openBtn = document.getElementById('btn-open-msisdn-drawer');
  const drawer = document.getElementById('msisdn-drawer');

  let listComponent = null;

  function refreshCard() {
    const list = state.msisdns ?? [];
    countEl.textContent = `(${list.length})`;
    openBtn.textContent = `⚙ Quản lý danh sách & Import (${list.length})`;
    singleInput.value = list[0] ?? '';
  }

  singleInput.addEventListener('input', () => {
    const val = singleInput.value.trim();
    if (!state.msisdns || state.msisdns.length === 0) {
      if (val) state.msisdns = [val];
    } else {
      if (val) state.msisdns[0] = val;
      else state.msisdns.shift();
    }
    persist();
    notify();
    refreshCard();
    listComponent?.render();
  });

  function close() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '';
    refreshCard();
  }

  function open() {
    drawer.innerHTML = `
      <div class="el-head" style="margin-bottom: 12px;">
        <h2 class="card-title" style="font-size: 16px; color: var(--body);">DANH SÁCH MSISDN</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-close>✕ Đóng</button>
      </div>
      <section class="card" id="drawer-list-host"></section>
    `;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');

    drawer.querySelector('[data-close]').addEventListener('click', close);

    const host = drawer.querySelector('#drawer-list-host');
    listComponent = createEditableList({
      host,
      title: 'MSISDN',
      kind: 'msisdn',
      placeholder: '0912345678',
      getItems: () => state.msisdns,
      setItems: (v) => {
        state.msisdns = v;
        persist();
      },
      onChange: () => {
        notify();
        refreshCard();
      },
    });

    drawer.querySelector('[data-close]').focus();
  }

  openBtn.addEventListener('click', open);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });

  document.addEventListener('click', (e) => {
    if (drawer.hidden) return;
    if (
      !drawer.contains(e.target) &&
      e.target !== openBtn &&
      !openBtn.contains(e.target)
    ) {
      close();
    }
  });

  refreshCard();
  return { open, close, refresh: refreshCard };
}
