import { VALIDATORS, VALIDATOR_MESSAGES } from '../shared/validators.js';
import { importFile } from '../api.js';

const ACCEPT = '.xlsx,.xls,.csv,.txt';

export function createEditableList(opts) {
  const {
    host, title, kind, placeholder = '',
    getItems, setItems, onChange,
    renderExtra = null,
    onImport = null,
    onClear = null,
    extraActions = [],
    getValue = (item) => String(item ?? ''),
    setValue = (item, v) => v,
    makeItem = (v) => v,
    // { placeholder, match(item, rawQuery) } — chi ENDPOINTS dung, MSISDN bo qua.
    search = null,
  } = opts;

  const validate = VALIDATORS[kind];

  const extraButtons = extraActions
    .map((a, i) => `<button type="button" class="btn btn-secondary btn-sm" data-extra-action="${i}" title="${a.title ?? ''}">${a.label}</button>`)
    .join('');

  const searchBox = search
    ? `<input type="search" class="input input-sm el-search" data-search placeholder="${search.placeholder ?? 'Tìm kiếm...'}" />`
    : '';

  host.innerHTML = `
    <h2 class="card-title">
      <span>${title} <span class="el-count" data-count>(0)</span></span>
      ${searchBox}
    </h2>
    <div class="el-body" data-body></div>
    <div class="el-actions">
      <button type="button" class="btn btn-secondary btn-sm" data-add>+ Thêm</button>
      <button type="button" class="btn btn-secondary btn-sm" data-import>⤓ Import</button>
      <button type="button" class="btn btn-secondary btn-sm" data-clear>Xóa hết</button>
      ${extraButtons}
      <input type="file" accept="${ACCEPT}" hidden data-file />
    </div>
  `;

  const body = host.querySelector('[data-body]');
  const count = host.querySelector('[data-count]');
  const fileInput = host.querySelector('[data-file]');
  // Mock DOM cua vai test cu khong dung "data-search" nen co the tra ve null
  // du search duoc truyen — giu the ky ket qua bang optional chaining ben duoi.
  const searchInput = search ? host.querySelector('[data-search]') : null;

  function commit(items) {
    setItems(items);
    onChange?.();
    render();
  }

  // Khong loc thi thu tu render == thu tu mang, tra ve vi tri truc tiep la du.
  // Co loc thi hang hien thi la tap con, phai tim theo dataset.index de khong
  // focus nham hang khi cac hang khac dang bi an boi search.
  function focusRow(index, caretAtEnd = true) {
    let input;
    if (search) {
      const row = [...body.children].find((r) => r.dataset && r.dataset.index === String(index));
      input = row?.querySelector('.el-input');
    } else {
      input = body.querySelectorAll('.el-input')[index];
    }
    if (!input) return;
    input.focus();
    if (caretAtEnd && input.setSelectionRange) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  // Tap dong dang ve tren bang. Tach khoi render() de nut "theo dong dang loc"
  // (endpoint-list.js) dung chung dung mot dinh nghia — them bo loc moi o day
  // la ca hai cung doi, khong the lech.
  function computeVisible() {
    const items = getItems();
    const rawQuery = search && searchInput ? searchInput.value : '';
    const rows = items.map((item, index) => ({ item, index }));
    return rawQuery.trim() !== '' ? rows.filter(({ item }) => search.match(item, rawQuery)) : rows;
  }

  function render() {
    const items = getItems();
    count.textContent = `(${items.length})`;
    body.innerHTML = '';

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'el-empty';
      empty.textContent = 'Chưa có dữ liệu. Bấm "+ Thêm" hoặc "⤓ Import".';
      body.append(empty);
      return;
    }

    const visible = computeVisible();

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'el-empty';
      empty.textContent = 'Không tìm thấy dòng nào khớp tìm kiếm.';
      body.append(empty);
      return;
    }

    visible.forEach(({ item, index }) => {
      const row = document.createElement('div');
      row.className = 'el-row';
      if (search) row.dataset.index = String(index);

      renderExtra?.(item, index, row);

      const input = document.createElement('input');
      input.className = 'el-input';
      input.type = 'text';
      input.spellcheck = false;
      input.placeholder = placeholder;
      input.value = getValue(item);

      const valid = !input.value || !validate || validate(input.value);
      input.classList.toggle('is-invalid', !valid);
      if (!valid) input.title = VALIDATOR_MESSAGES[kind] ?? 'Giá trị không hợp lệ';

      input.addEventListener('input', () => {
        const next = getItems();
        next[index] = setValue(next[index], input.value);
        setItems(next);
        onChange?.();
        const ok = !input.value || !validate || validate(input.value);
        input.classList.toggle('is-invalid', !ok);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const next = getItems();
          next.splice(index + 1, 0, makeItem(''));
          commit(next);
          focusRow(index + 1);
        } else if (e.key === 'Backspace' && input.value === '' && getItems().length > 1) {
          e.preventDefault();
          const next = getItems();
          next.splice(index, 1);
          commit(next);
          focusRow(Math.max(0, index - 1));
        }
      });

      input.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') ?? '';
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length <= 1) return;
        e.preventDefault();
        const next = getItems();
        next.splice(index, 1, ...lines.map(makeItem));
        commit(next);
        focusRow(index + lines.length - 1);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'el-del';
      del.title = 'Xóa dòng';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        const next = getItems();
        next.splice(index, 1);
        commit(next);
      });

      row.append(input, del);
      body.append(row);
    });
  }

  host.querySelector('[data-add]').addEventListener('click', () => {
    const next = [...getItems(), makeItem('')];
    commit(next);
    focusRow(next.length - 1);
  });

  host.querySelector('[data-clear]').addEventListener('click', () => {
    if (onClear) {
      onClear();
      return;
    }
    if (getItems().length === 0) return;
    if (!confirm(`Xóa toàn bộ ${getItems().length} dòng trong "${title}"?`)) return;
    commit([]);
  });

  host.querySelector('[data-import]').addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  host.querySelectorAll('[data-extra-action]').forEach((btn) => {
    const action = extraActions[Number(btn.getAttribute('data-extra-action'))];
    btn.addEventListener('click', () => action?.onClick?.());
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (onImport) {
      await onImport(file);
      render();
      return;
    }

    try {
      const { values, skipped } = await importFile(file, kind, true);
      const current = getItems();
      let next;
      if (current.length === 0) {
        next = values.map(makeItem);
      } else {
        const append = confirm(
          `Danh sách "${title}" đang có ${current.length} dòng.\n\n`
          + 'OK = Nối thêm vào cuối\nCancel = Thay thế toàn bộ'
        );
        next = append ? [...current, ...values.map(makeItem)] : values.map(makeItem);
      }
      commit(next);
      window.ccmToast?.(`Đã nạp ${values.length} dòng từ ${file.name}`
        + (skipped > 0 ? ` (bỏ ${skipped} dòng trùng/rỗng)` : ''), 'ok');
    } catch (err) {
      window.ccmToast?.(`Import thất bại: ${err.message}`, 'error');
    }
  });

  if (search && searchInput) {
    searchInput.addEventListener('input', () => render());
  }

  render();
  return {
    render,
    getVisibleItems: () => computeVisible().map((r) => r.item),
    getSearchQuery: () => (search && searchInput ? searchInput.value : ''),
  };
}

