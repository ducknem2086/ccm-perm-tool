import { state, persist, notify, subscribe } from '../state.js';
import { importGrid } from '../api.js';
import { getUniqueSheets } from './endpoint-list.js';

export function initPermissionsPanel() {
  const btnImport = document.getElementById('btn-import-permissions');
  const fileInfo = document.getElementById('permissions-file-info');
  const mappingArea = document.getElementById('permissions-mapping-area');
  const selNameCol = document.getElementById('sel-permissions-name-col');
  const selTargetSheet = document.getElementById('sel-permissions-target-sheet');
  const usecase1Table = document.getElementById('permissions-usecase1-table');
  const btnAddMapping = document.getElementById('btn-permissions-add-usecase1');

  btnImport.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv,.txt';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const grid = await importGrid(file);
        state.permissionFile = {
          filename: file.name,
          headers: grid.headers ?? [],
          rows: grid.rows ?? []
        };
        persist();
        notify();
        window.ccmToast?.(`Đã nạp file phân quyền ${file.name}`, 'ok');
      } catch (err) {
        window.ccmToast?.(`Import file phân quyền thất bại: ${err.message}`, 'error');
      }
    });
    input.click();
  });

  btnAddMapping.addEventListener('click', () => {
    state.permissionMapping.usecase1.push({
      permissionColumn: state.permissionFile.headers[0] ?? '',
      endpointSheet: getUniqueSheets(state.endpoints)[0] ?? 'Sheet 1',
      authProfileName: state.auths[0]?.name ?? ''
    });
    persist();
    notify();
  });

  selNameCol.addEventListener('change', () => {
    state.permissionMapping.usecase2.permissionColumn = selNameCol.value;
    persist();
    notify();
  });

  selTargetSheet.addEventListener('change', () => {
    state.permissionMapping.usecase2.targetSheet = selTargetSheet.value;
    persist();
    notify();
  });

  function render() {
    const hasFile = Boolean(state.permissionFile?.filename);
    fileInfo.textContent = hasFile ? state.permissionFile.filename : 'chưa nạp file';
    mappingArea.hidden = !hasFile;

    if (!hasFile) return;

    // Populate Usecase 2 selectors
    selNameCol.replaceChildren();
    for (const h of state.permissionFile.headers) {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      selNameCol.append(opt);
    }
    selNameCol.value = state.permissionMapping.usecase2.permissionColumn || (state.permissionFile.headers[0] ?? '');

    selTargetSheet.replaceChildren();
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'Tất cả sheet (All)';
    selTargetSheet.append(optAll);
    for (const sheet of getUniqueSheets(state.endpoints)) {
      const opt = document.createElement('option');
      opt.value = sheet;
      opt.textContent = sheet;
      selTargetSheet.append(opt);
    }
    selTargetSheet.value = state.permissionMapping.usecase2.targetSheet || 'all';

    // Render Usecase 1 mappings
    usecase1Table.replaceChildren();
    state.permissionMapping.usecase1.forEach((m, idx) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = 'var(--sp-xs)';
      row.style.alignItems = 'center';

      const colSel = document.createElement('select');
      colSel.className = 'input input-sm';
      for (const h of state.permissionFile.headers) {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        colSel.append(opt);
      }
      colSel.value = m.permissionColumn;
      colSel.addEventListener('change', () => {
        m.permissionColumn = colSel.value;
        persist();
      });

      const sheetSel = document.createElement('select');
      sheetSel.className = 'input input-sm';
      for (const sheet of getUniqueSheets(state.endpoints)) {
        const opt = document.createElement('option');
        opt.value = sheet;
        opt.textContent = sheet;
        sheetSel.append(opt);
      }
      sheetSel.value = m.endpointSheet;
      sheetSel.addEventListener('change', () => {
        m.endpointSheet = sheetSel.value;
        persist();
      });

      const authSel = document.createElement('select');
      authSel.className = 'input input-sm';
      for (const a of state.auths) {
        const opt = document.createElement('option');
        opt.value = a.name;
        opt.textContent = a.name;
        authSel.append(opt);
      }
      authSel.value = m.authProfileName;
      authSel.addEventListener('change', () => {
        m.authProfileName = authSel.value;
        persist();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-secondary btn-sm';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        state.permissionMapping.usecase1.splice(idx, 1);
        persist();
        notify();
      });

      row.append(colSel, document.createTextNode('↔'), sheetSel, document.createTextNode('↔'), authSel, delBtn);
      usecase1Table.append(row);
    });
  }

  subscribe(render);
  render();
}
