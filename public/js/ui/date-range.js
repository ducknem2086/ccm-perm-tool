import { state, persist, notify } from '../state.js';
import { splitRangeInput, validateRange, formatDate, parseDate } from '../shared/date-utils.js';

const toIso = (ddmmyyyy) => {
  const d = parseDate(ddmmyyyy);
  return d ? d.toISOString().slice(0, 10) : '';
};
const fromIso = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export function initDateRange() {
  const range = document.getElementById('inp-daterange');
  const from = document.getElementById('inp-date-from');
  const to = document.getElementById('inp-date-to');
  const format = document.getElementById('sel-date-format');
  const preview = document.getElementById('date-preview');

  function refresh() {
    range.value = state.dateRange.from && state.dateRange.to
      ? `${state.dateRange.from}-${state.dateRange.to}`
      : range.value;
    from.value = toIso(state.dateRange.from);
    to.value = toIso(state.dateRange.to);
    format.value = state.dateFormat;

    const check = validateRange(state.dateRange.from, state.dateRange.to);
    range.classList.toggle('is-invalid', !check.ok);
    preview.textContent = check.ok
      ? `→ fromDate=${formatDate(check.from, state.dateFormat)} & toDate=${formatDate(check.to, state.dateFormat)}`
      : (state.dateRange.from || state.dateRange.to ? `⚠ ${check.error}` : '');
    notify();
  }

  range.addEventListener('input', () => {
    const split = splitRangeInput(range.value);
    state.dateRange.from = split.ok ? split.from : '';
    state.dateRange.to = split.ok ? split.to : '';
    persist();
    from.value = toIso(state.dateRange.from);
    to.value = toIso(state.dateRange.to);
    const check = validateRange(state.dateRange.from, state.dateRange.to);
    range.classList.toggle('is-invalid', !check.ok);
    preview.textContent = check.ok
      ? `→ fromDate=${formatDate(check.from, state.dateFormat)} & toDate=${formatDate(check.to, state.dateFormat)}`
      : (range.value ? `⚠ ${check.error}` : '');
    notify();
  });

  const syncFromPickers = () => {
    state.dateRange.from = fromIso(from.value);
    state.dateRange.to = fromIso(to.value);
    range.value = `${state.dateRange.from}-${state.dateRange.to}`;
    persist();
    refresh();
  };
  from.addEventListener('change', syncFromPickers);
  to.addEventListener('change', syncFromPickers);

  format.addEventListener('change', () => {
    state.dateFormat = format.value;
    persist();
    refresh();
  });

  refresh();
  return { refresh };
}
