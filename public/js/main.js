import { initTabs } from './ui/tabs.js';
import { createEditableList } from './ui/editable-list.js';

initTabs();

const demo = { items: ['0912345678'] };
createEditableList({
  host: document.getElementById('list-msisdn'),
  title: 'MSISDN',
  kind: 'msisdn',
  placeholder: '0912345678',
  getItems: () => demo.items,
  setItems: (v) => { demo.items = v; },
});
