import { load } from './state.js';
import { initTabs } from './ui/tabs.js';
import { initConnectionPanel } from './ui/connection-panel.js';
import { initDateRange } from './ui/date-range.js';
import { initEndpointList } from './ui/endpoint-list.js';
import { initParamTables } from './ui/param-table.js';
import { createEditableList } from './ui/editable-list.js';
import { state, persist, notify } from './state.js';

load();
initTabs();
initConnectionPanel();
initDateRange();
createEditableList({
  host: document.getElementById('list-msisdn'),
  title: 'MSISDN', kind: 'msisdn', placeholder: '0912345678',
  getItems: () => state.msisdns,
  setItems: (v) => { state.msisdns = v; persist(); },
  onChange: notify,
});
initEndpointList();
initParamTables();
