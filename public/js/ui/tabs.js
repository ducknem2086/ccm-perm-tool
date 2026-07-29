const TAB_IDS = ['input', 'output'];

export function initTabs({ onChange } = {}) {
  const tabs = TAB_IDS.map((id) => document.getElementById(`tab-${id}`));
  const panels = TAB_IDS.map((id) => document.getElementById(`panel-${id}`));

  function select(id) {
    const idx = TAB_IDS.indexOf(id);
    if (idx < 0) return;
    tabs.forEach((tab, i) => {
      const active = i === idx;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle('is-active', active);
      panels[i].hidden = !active;
    });
    onChange?.(id);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => { select(TAB_IDS[i]); tab.focus(); });
    tab.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight') next = (i + 1) % TAB_IDS.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + TAB_IDS.length) % TAB_IDS.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = TAB_IDS.length - 1;
      if (next === null) return;
      e.preventDefault();
      select(TAB_IDS[next]);
      tabs[next].focus();
    });
  });

  select('input');
  return { select };
}
