// The editor saves changes by itself every 30 seconds and when the window loses focus, but has no switch for it. This puts the
// switch of the other Office plugins next to Redo and publishes the choice as `window.__lexoraPdfAutoSave`, which the editor's
// autosave helper checks (see `gateAutoSave` in build.mjs). Manual saves are not affected.
export function installAutoSaveToggle(root, signal, { enabled, label, tip, onChange }) {
  let on = enabled
  const toggle = document.createElement('label')
  toggle.className = 'autosave-toggle'
  toggle.dataset.tip = tip
  const knob = document.createElement('span')
  knob.className = 'autosave-knob'
  const text = document.createElement('span')
  text.className = 'autosave-text'
  text.textContent = label
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('aria-label', label)
  toggle.append(knob, text, input)

  function apply() {
    toggle.classList.toggle('on', on)
    input.checked = on
    window.__lexoraPdfAutoSave = on
  }
  input.addEventListener('change', () => {
    on = input.checked
    apply()
    onChange(on)
  }, { signal })

  // The editor re-renders its quick-access row, so keep the switch right after the last button there.
  function place() {
    const tabs = root.querySelector('.ribbon-tabs')
    const buttons = tabs?.querySelectorAll(':scope > .qa-btn')
    const anchor = buttons?.[buttons.length - 1]
    if (anchor && anchor.nextElementSibling !== toggle)
      anchor.after(toggle)
  }
  const observer = new MutationObserver(place)
  observer.observe(root, { childList: true, subtree: true })
  signal.addEventListener('abort', () => {
    observer.disconnect()
    toggle.remove()
    delete window.__lexoraPdfAutoSave
  }, { once: true })
  apply()
  place()
}
