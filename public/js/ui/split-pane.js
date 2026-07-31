const DEFAULT_PCT = 60;
const STEP_PCT = 5;

const clamp = (pct, minPct, maxPct) => Math.min(maxPct, Math.max(minPct, pct));

export function initSplitPane({
  container, handle, initialPct = DEFAULT_PCT, minPct = 20, maxPct = 80, onChange,
}) {
  let pct = clamp(initialPct, minPct, maxPct);

  function apply(next) {
    pct = clamp(Math.round(next), minPct, maxPct);
    container.style.gridTemplateColumns = `${pct}% 6px 1fr`;
  }

  apply(pct);

  let startX = 0;
  let startPct = pct;

  function onPointerMove(e) {
    const { width } = container.getBoundingClientRect();
    const deltaPct = ((e.clientX - startX) / width) * 100;
    apply(startPct + deltaPct);
  }

  function onPointerUp() {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    onChange?.(pct);
  }

  handle.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startPct = pct;
    handle.setPointerCapture?.(e.pointerId);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  });

  handle.addEventListener('dblclick', () => {
    apply(DEFAULT_PCT);
    onChange?.(pct);
  });

  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      apply(pct - STEP_PCT);
      onChange?.(pct);
    } else if (e.key === 'ArrowRight') {
      apply(pct + STEP_PCT);
      onChange?.(pct);
    }
  });
}
