import { state, persist, notify } from '../state.js';
import { filterEndpoints, filterMsisdns, selectedAuths, businessCommonText } from '../shared/run-filter.js';

const MAX_SUGGEST = 20;

function chip(label, onDelete, extraClass = '') {
  const box = document.createElement('span');
  box.className = `rf-chip ${extraClass}`;
  const text = document.createElement('span');
  text.textContent = label;
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'rf-chip-del';
  del.textContent = '×';
  del.addEventListener('click', onDelete);
  box.append(text, del);
  return box;
}

export function initRunFilterBar() {
  const host = document.getElementById('run-filter-bar');
  const breakdown = document.getElementById('run-breakdown');

  const filter = () => {
    if (!state.runFilter) state.runFilter = { methods: [], msisdnPatterns: [], authIds: [] };
    return state.runFilter;
  };

  function commit() {
    persist();
    notify();
    render();
  }

  function toggleInList(key, value) {
    const list = filter()[key] ?? [];
    filter()[key] = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
    commit();
  }

  // render() dung lai o nhap moi nen con tro se van ra ngoai — tra focus lai
  // de go duoc nhieu so lien tiep.
  function refocusMsisdn() {
    host.querySelector('.rf-msisdn-input')?.focus();
  }

  function addPattern(value) {
    const v = String(value ?? '').trim();
    if (v === '') return;
    const list = filter().msisdnPatterns ?? [];
    if (list.includes(v)) {
      refocusMsisdn();
      return;
    }
    filter().msisdnPatterns = [...list, v];
    commit();
    refocusMsisdn();
  }

  function msisdnGroup() {
    const box = document.createElement('div');
    box.className = 'rf-group rf-msisdns';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'msisdn';
    box.append(label);

    const all = state.msisdns ?? [];
    for (const p of filter().msisdnPatterns ?? []) {
      const hits = all.filter((m) => String(m).includes(p)).length;
      box.append(chip(hits > 1 ? `${p} (${hits})` : p, () => {
        filter().msisdnPatterns = filter().msisdnPatterns.filter((x) => x !== p);
        commit();
      }));
    }

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'input input-sm mono rf-msisdn-input';
    input.placeholder = (filter().msisdnPatterns ?? []).length === 0 ? 'mọi msisdn' : '';

    const popup = document.createElement('ul');
    popup.className = 'rf-suggest';
    popup.hidden = true;

    function refreshSuggest() {
      const q = input.value.trim();
      popup.replaceChildren();
      if (q === '') {
        popup.hidden = true;
        return;
      }
      const hits = all.filter((m) => String(m).includes(q));
      for (const m of hits.slice(0, MAX_SUGGEST)) {
        const li = document.createElement('li');
        li.className = 'rf-suggest-item';
        li.textContent = m;
        li.addEventListener('click', () => addPattern(m));
        popup.append(li);
      }
      if (hits.length > MAX_SUGGEST) {
        const more = document.createElement('li');
        more.className = 'rf-suggest-more';
        more.textContent = `… và ${hits.length - MAX_SUGGEST} số nữa`;
        popup.append(more);
      }
      popup.hidden = hits.length === 0;
    }

    input.addEventListener('input', refreshSuggest);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault?.();
        addPattern(input.value);
        return;
      }
      if (e.key === 'Backspace' && input.value === '') {
        const list = filter().msisdnPatterns ?? [];
        if (list.length === 0) return;
        filter().msisdnPatterns = list.slice(0, -1);
        commit();
      }
    });

    box.append(input, popup);
    return box;
  }

  function authGroup() {
    const box = document.createElement('div');
    box.className = 'rf-group rf-auths';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'auth';
    box.append(label);

    const activeAuths = selectedAuths(state.auths, filter());
    const activeIds = new Set(activeAuths.map((a) => a.id));

    if ((state.auths ?? []).length > 1 && activeIds.size === 0) {
      const none = document.createElement('span');
      none.className = 'rf-chip rf-auth-none status-down';
      none.textContent = 'chưa chọn (0)';
      box.append(none);
    }

    for (const a of state.auths ?? []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-secondary btn-sm rf-auth${activeIds.has(a.id) ? ' is-active' : ''}`;
      btn.dataset.auth = a.id;
      btn.textContent = a.name || '(chưa đặt tên)';
      btn.addEventListener('click', () => toggleInList('authIds', a.id));
      box.append(btn);
    }
    return box;
  }

  function render() {
    host.replaceChildren(msisdnGroup(), authGroup());
    if (!breakdown) return;
    const f = filter();
    const e = filterEndpoints(
      state.endpoints, f, state.selectedSheet,
      businessCommonText(state.commonEndpointList), state.commonEndpointsEnabled,
    ).length;
    const m = filterMsisdns(state.msisdns, f).length;
    const a = selectedAuths(state.auths, f).length;
    breakdown.textContent = `${e} endpoint × ${m} msisdn × ${a} auth`;
  }

  render();
  return { render };
}
