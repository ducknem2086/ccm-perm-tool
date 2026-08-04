export function initPermissionSheetFilterBar({ onChange } = {}) {
  const chkGranted = document.getElementById('chk-perm-granted');
  const chkDenied = document.getElementById('chk-perm-denied');
  const searchInput = document.getElementById('inp-perm-sheet-search');
  const countEl = document.getElementById('perm-sheet-count');

  chkGranted.addEventListener('change', () => onChange?.());
  chkDenied.addEventListener('change', () => onChange?.());
  searchInput.addEventListener('input', () => onChange?.());

  return {
    getFilter() {
      return { granted: chkGranted.checked, denied: chkDenied.checked, search: searchInput.value.trim() };
    },
    refreshCount(shown, total) {
      countEl.textContent = `hiện ${shown}/${total} dòng`;
    },
  };
}
