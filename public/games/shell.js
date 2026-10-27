// Loaded by every game page. Games run in a sandboxed iframe, so the hub never sees their keys:
// Esc / Backspace are forwarded to it as a "back" message, before the game can swallow them.
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' && e.key !== 'Backspace') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  parent.postMessage({ type: 'back' }, '*');
}, true);

// Arrow keys and Space would scroll the hub page around the iframe.
window.addEventListener('keydown', e => {
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
});

// Keys that reach the hub instead of the game (the focus can slip out of the iframe) are posted
// here: replay them so the game sees every keydown and, above all, every keyup.
window.addEventListener('message', e => {
  if (e.source !== parent || e.data?.type !== 'key') return;
  const { event, key, code, keyCode } = e.data;
  const ev = new KeyboardEvent(event, { key, code, bubbles: true, cancelable: true });
  // Older games read keyCode / which, which the constructor cannot set.
  Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
  Object.defineProperty(ev, 'which', { get: () => keyCode });
  (document.activeElement ?? document.body).dispatchEvent(ev);
});
