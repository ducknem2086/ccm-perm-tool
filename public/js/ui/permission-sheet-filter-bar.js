export function initPermissionSheetFilterBar({ getRoleColumns, onChange }) {
  const chkGranted = document.getElementById('chk-perm-granted');
  const chkDenied = document.getElementById('chk-perm-denied');
  const countEl = document.getElementById('perm-sheet-count');
  const colBtn = document.getElementById('btn-perm-col-filter');
  const colPopup = document.getElementById('perm-col-popup');

  // Cot moi xuat hien (them mapping UC1 moi) mac dinh duoc tick, giu nguyen
  // lua chon nguoi dung da bo tick cho cot cu.
  const selectedCols = new Set();
  const knownNames = new Set();

  function syncColumns() {
    for (const col of getRoleColumns()) {
      if (!knownNames.has(col.name)) {
        knownNames.add(col.name);
        selectedCols.add(col.name);
      }
    }
  }

  function paintPopup() {
    syncColumns();
    colPopup.replaceChildren();
    for (const col of getRoleColumns()) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedCols.has(col.name);
      cb.addEventListener('change', () => {
        if (cb.checked) selectedCols.add(col.name);
        else selectedCols.delete(col.name);
        onChange?.();
      });
      label.append(cb, ` ${col.name}`);
      colPopup.append(label);
    }
  }

  colBtn.addEventListener('click', () => {
    colPopup.hidden = !colPopup.hidden;
    if (!colPopup.hidden) paintPopup();
  });

  document.addEventListener('click', (e) => {
    if (colPopup.hidden) return;
    if (colPopup.contains(e.target) || e.target === colBtn) return;
    colPopup.hidden = true;
  });

  chkGranted.addEventListener('change', () => onChange?.());
  chkDenied.addEventListener('change', () => onChange?.());

  return {
    getFilter() {
      return { granted: chkGranted.checked, denied: chkDenied.checked };
    },
    getSelectedColumns() {
      syncColumns();
      return new Set(selectedCols);
    },
    refreshCount(shown, total) {
      countEl.textContent = `hiện ${shown}/${total} dòng`;
    },
  };
}
