import { state, persist, notify } from '../state.js';

export function initConnectionPanel() {
  const domain = document.getElementById('inp-domain');

  function refresh() {
    domain.value = state.domain;
    domain.classList.toggle('is-invalid', Boolean(domain.value) && !/^https?:\/\/\S+$/i.test(domain.value));
  }

  domain.addEventListener('input', () => { state.domain = domain.value.trim(); persist(); refresh(); notify(); });

  refresh();
  return { refresh };
}
