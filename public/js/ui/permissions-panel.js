import {
  state, persist, notify, subscribe,
  draftSheet, saveConfig, isConfigDirty, dirtyParts, emptySavedConfig, defaultConfig,
} from '../state.js';
import { importGrid } from '../api.js';
import { getUniqueSheets } from './endpoint-list.js';
import { endpointColumnsOfSheet } from '../shared/permission-match.js';
import { validatePermissionScope } from '../shared/permission-scope.js';

// Panel nay LA giao dien sua ban nhap, nen la cho duy nhat co quyen doc sheet
// nhap. Moi noi khac (bang raw, CHECK PERM, RUN ALL) doc savedSheet().
const draftHeaders = () => draftSheet()?.headers ?? [];

// Ve lai mot select cot, giu nguyen gia tri dang luu du no da bien mat khoi
// danh sach cot cua sheet dang xem — chen them 1 option danh dau de nguoi
// dung thay minh dang tro vao dau, khong tu doi sang cot khac ma khong bao.
function renderColumnSelect(selectEl, options, currentValue) {
  const nodes = [];
  if (currentValue && !options.includes(currentValue)) {
    const marker = document.createElement('option');
    marker.value = currentValue;
    marker.textContent = `${currentValue} (không có trong sheet này)`;
    nodes.push(marker);
  }
  for (const h of options) {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    nodes.push(opt);
  }
  selectEl.replaceChildren(...nodes);
  selectEl.value = currentValue || (options[0] ?? '');
}

export function initPermissionsPanel() {
  const btnImport = document.getElementById('btn-import-permissions');
  const fileInfo = document.getElementById('permissions-file-info');
  const wrapFileSheet = document.getElementById('wrap-permissions-file-sheet');
  const mappingArea = document.getElementById('permissions-mapping-area');
  const selFileSheet = document.getElementById('sel-permissions-file-sheet');
  const selNameCol = document.getElementById('sel-permissions-name-col');
  const selEndpointSheet = document.getElementById('sel-permissions-endpoint-sheet');
  const selEndpointCol = document.getElementById('sel-permissions-endpoint-col');
  const usecase1Table = document.getElementById('permissions-usecase1-table');
  const btnAddMapping = document.getElementById('btn-permissions-add-usecase1');
  const btnSave = document.getElementById('btn-permissions-save');
  const btnDelete = document.getElementById('btn-permissions-delete');
  const dirtyBadge = document.getElementById('perm-dirty-badge');
  const saveErrors = document.getElementById('perm-save-errors');

  btnImport.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv,.txt';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const grid = await importGrid(file);
        const sheets = Array.isArray(grid.sheets) && grid.sheets.length > 0
          ? grid.sheets
          : [{ name: 'Default', headers: grid.headers ?? [], rows: grid.rows ?? [] }];

        // Chi dat ban NHAP. Khong goi saveConfig() — nguoi dung con phai khai
        // lai cot cho file moi roi moi bam Luu.
        state.permissionFile = {
          filename: file.name,
          sheets,
          selectedSheet: sheets[0]?.name ?? 'Default'
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

  selFileSheet?.addEventListener('change', () => {
    const sheets = state.permissionFile?.sheets ?? [];
    const activeSheet = sheets.find((s) => s.name === selFileSheet.value) ?? sheets[0];
    if (!activeSheet) return;

    // Doi sheet KHONG duoc ghi de cot dang khai. Nguoi dung do sheet de tim
    // dung bang phan quyen — ghi de ve headers[0] thi moi lan do la mot mapping
    // hong, va doi ve sheet cu cung khong lay lai duoc. Cot mo coi hien option
    // danh dau (renderColumnSelect) roi khop lai khi quay ve sheet co no.
    state.permissionFile.selectedSheet = activeSheet.name;
    persist();
    render();
  });

  btnAddMapping.addEventListener('click', () => {
    // Header dau tien cua file phan quyen gan nhu luon la cot TEN — cung cot da
    // chon lam khoa ghep UC2. Lay thang no lam mac dinh la moi dong UC1 moi sinh
    // ra da invalid (validatePermissionScope chan ngay), va nguoi dung khong
    // doi thi cham diem doc o chua TEN thay vi 'x' -> moi endpoint deu "khong co
    // quyen". Bo qua cot do; het cot thi de rong cho validate bao.
    const joinCol = state.permissionMapping.usecase2.permissionColumn;
    state.permissionMapping.usecase1.push({
      permissionColumn: draftHeaders().find((h) => h !== joinCol) ?? '',
      endpointSheet: getUniqueSheets(state.endpoints)[0] ?? 'Sheet 1',
      authProfileName: state.auths[0]?.name ?? ''
    });
    persist();
    render();
  });

  // Cac handler duoi day goi render() cuc bo thay vi notify(): notify() keo
  // theo renderPermSheet() va refreshCheckPermButton() chay tren ban nhap —
  // dung cai phai chan. Panel van phai tu ve lai vi doi columnSheet lam doi
  // danh sach cot dich, them/xoa UC1 lam doi danh sach sheet tham chieu.
  selNameCol.addEventListener('change', () => {
    state.permissionMapping.usecase2.permissionColumn = selNameCol.value;
    persist();
    render();
  });

  selEndpointSheet?.addEventListener('change', () => {
    state.permissionMapping.usecase2.columnSheet = selEndpointSheet.value;
    persist();
    render();
  });

  selEndpointCol?.addEventListener('change', () => {
    state.permissionMapping.usecase2.endpointColumn = selEndpointCol.value;
    persist();
    render();
  });

  btnSave?.addEventListener('click', () => {
    saveConfig();
    // Loi KHONG chan Save — validate la viec cua nut CHECK PERM. In ra day de
    // nguoi dung sua ngay thay vi doi toi luc bam chay moi biet.
    const errors = validatePermissionScope(state);
    if (saveErrors) {
      saveErrors.textContent = errors.join(' · ');
      saveErrors.hidden = errors.length === 0;
    }
    window.ccmToast?.('Đã lưu cấu hình phân quyền', errors.length > 0 ? 'error' : 'ok');
  });

  // Xoa file phan quyen = go ca ban nhap LAN ban da luu. Chi xoa permissionFile
  // thi mapping cu con tro vao cot cua file da bien mat, va savedConfig van bat
  // CHECK PERM cham diem tren sheet khong con ton tai.
  btnDelete?.addEventListener('click', () => {
    const base = defaultConfig();
    state.permissionFile = base.permissionFile;
    state.permissionMapping = base.permissionMapping;
    state.savedConfig = { ...state.savedConfig, ...emptySavedConfig() };
    persist();
    notify();
    if (saveErrors) saveErrors.hidden = true;
    window.ccmToast?.('Đã xoá file phân quyền — import lại để nạp dữ liệu mới', 'ok');
  });

  // Danh dau select cot ROLE khi no tro dung cot da dung lam khoa ghep UC2.
  function markRoleColumnClash(selectEl, value) {
    const clash = Boolean(value) && value === state.permissionMapping.usecase2.permissionColumn;
    selectEl.classList.toggle('input-invalid', clash);
    selectEl.title = clash
      ? 'Cột này đang là khoá ghép của UC2 — chọn đúng cột ROLE (ô đánh "x") thay vì cột tên.'
      : '';
  }

  function renderDirty() {
    const dirty = isConfigDirty();
    if (btnSave) btnSave.disabled = !dirty;
    if (dirtyBadge) {
      dirtyBadge.hidden = !dirty;
      dirtyBadge.textContent = dirty ? `⚠ Chưa lưu: ${dirtyParts().join(', ')}` : '';
    }
  }

  function render() {
    const hasFile = Boolean(state.permissionFile?.filename);
    fileInfo.textContent = hasFile ? state.permissionFile.filename : 'chưa nạp file';
    mappingArea.hidden = !hasFile;
    if (wrapFileSheet) wrapFileSheet.hidden = !hasFile;
    if (btnDelete) btnDelete.hidden = !hasFile;

    if (!hasFile) {
      renderDirty();
      return;
    }

    // Populate permission file sheets selector
    if (selFileSheet) {
      selFileSheet.replaceChildren();
      const sheets = state.permissionFile.sheets ?? [];
      for (const s of sheets) {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = s.name;
        selFileSheet.append(opt);
      }
      selFileSheet.value = state.permissionFile.selectedSheet || (sheets[0]?.name ?? '');
    }

    // Populate Usecase 2 selectors
    renderColumnSelect(
      selNameCol, draftHeaders(), state.permissionMapping.usecase2.permissionColumn,
    );

    // Populate sheet endpoints tham chieu (UC2) — chi de lay danh sach cot.
    // MOI sheet co endpoint, khong loc theo UC1 nua: pham vi quet CHECK PERM gio
    // la danh sach cua RUN ALL, khong con do uc1[].endpointSheet quyet dinh.
    const uc1SheetList = getUniqueSheets(state.endpoints);

    // Sheet dang tro toi tren man hinh. Khac gia tri trong state o dung mot ca:
    // chua cau hinh lan nao ('') thi CHI hien thi sheet dau, khong ghi vao state
    // — ghi vao la panel tu bat dirty badge ngay khi mo, nguoi dung chua dong gi.
    // Giong cach hai select cot xu ly gia tri rong; validate van chan bang loi
    // "Chưa chọn sheet endpoints tham chiếu" cho toi khi nguoi dung bam chon.
    const savedSheetName = state.permissionMapping.usecase2.columnSheet;
    if (savedSheetName && !uc1SheetList.includes(savedSheetName)) {
      state.permissionMapping.usecase2.columnSheet = uc1SheetList[0] ?? '';
      persist();
    }
    const shownSheet = state.permissionMapping.usecase2.columnSheet || (uc1SheetList[0] ?? '');

    if (selEndpointSheet) {
      selEndpointSheet.replaceChildren(...uc1SheetList.map((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        return opt;
      }));
      selEndpointSheet.value = shownSheet;
    }

    // Populate cot dich — chi cot cua sheet dang hien o selEndpointSheet.
    const sheetCols = endpointColumnsOfSheet(state.endpoints, shownSheet);
    if (selEndpointCol) {
      renderColumnSelect(selEndpointCol, sheetCols, state.permissionMapping.usecase2.endpointColumn);
    }

    // Render Usecase 1 mappings
    usecase1Table.replaceChildren();
    state.permissionMapping.usecase1.forEach((m, idx) => {
      const row = document.createElement('div');
      row.className = 'perm-uc1-row';

      const colSel = document.createElement('select');
      colSel.className = 'input input-sm';
      renderColumnSelect(colSel, draftHeaders(), m.permissionColumn);
      // Cot ROLE trung cot khoa ghep UC2 la loi cau hinh im lang: bang raw khu
      // trung theo index nen mat luon cot trang thai, con CHECK PERM doc o
      // chua ten (khac 'x') nen cham moi endpoint thanh 'khong co quyen'.
      markRoleColumnClash(colSel, m.permissionColumn);
      colSel.addEventListener('change', () => {
        m.permissionColumn = colSel.value;
        persist();
        markRoleColumnClash(colSel, colSel.value);
        renderDirty();
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
      sheetSel.disabled = false;
      sheetSel.addEventListener('change', () => {
        m.endpointSheet = sheetSel.value;
        persist();
        render();
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
        renderDirty();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-secondary btn-sm';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        state.permissionMapping.usecase1.splice(idx, 1);
        persist();
        render();
      });

      row.append(colSel, sheetSel, authSel, delBtn);
      usecase1Table.append(row);
    });

    renderDirty();
  }

  subscribe(render);
  render();
}
