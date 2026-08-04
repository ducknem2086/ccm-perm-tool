// Bang key-value dung chung: checkbox bat/tat, o key, o value mono, nut xoa.
// Dung cho ca QUERY PARAMS/HEADERS chung (param-table.js) lan cau hinh rieng
// tung endpoint (endpoint-drawer.js) — cung mot hanh vi, khac nguon du lieu.

export function createKvTable({
  host, getRows, setRows, onChange,
  keyPlaceholder = '', valPlaceholder = '', emptyText = 'Chưa có dòng nào.',
}) {
  function render() {
    host.innerHTML = '';
    const rows = getRows();

    rows.forEach((pair, index) => {
      const row = document.createElement('div');
      row.className = 'pt-row';

      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = pair.enabled !== false;
      enabled.title = 'Bật/tắt dòng này';
      enabled.addEventListener('change', () => {
        const next = getRows();
        next[index] = { ...next[index], enabled: enabled.checked };
        setRows(next);
        onChange?.();
      });

      const keyInput = document.createElement('input');
      keyInput.className = 'input pt-key';
      keyInput.type = 'text';
      keyInput.spellcheck = false;
      keyInput.placeholder = keyPlaceholder;
      keyInput.value = pair.key ?? '';
      keyInput.addEventListener('input', () => {
        const next = getRows();
        next[index] = { ...next[index], key: keyInput.value };
        setRows(next);
        onChange?.();
      });

      const valInput = document.createElement('input');
      valInput.className = 'input pt-val mono';
      valInput.type = 'text';
      valInput.spellcheck = false;
      valInput.placeholder = valPlaceholder;
      valInput.value = pair.value ?? '';
      valInput.addEventListener('input', () => {
        const next = getRows();
        next[index] = { ...next[index], value: valInput.value };
        setRows(next);
        onChange?.();
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'el-del';
      del.textContent = '✕';
      del.title = 'Xóa dòng';
      del.addEventListener('click', () => {
        const next = getRows();
        next.splice(index, 1);
        setRows(next);
        onChange?.();
        render();
      });

      row.append(enabled, keyInput, valInput, del);
      host.append(row);
    });

    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'el-empty';
      empty.textContent = emptyText;
      host.append(empty);
    }
  }

  function addRow() {
    setRows([...getRows(), { key: '', value: '', enabled: true }]);
    onChange?.();
    render();
  }

  render();
  return { render, addRow };
}
