const highlightStyle = `
    :host::backdrop { display: none; }
    * { box-sizing: border-box; pointer-events: none; }
    .outline { position: fixed; border: 2px solid #3b82f6; border-radius: 3px; background: rgb(59 130 246 / 8%); box-shadow: 0 0 0 1px rgb(255 255 255 / 90%), inset 0 0 0 1px rgb(255 255 255 / 65%); }
    .label { position: fixed; display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 16px); height: 26px; padding: 0 8px; border: 1px solid rgb(255 255 255 / 24%); border-radius: 5px; background: #172033; color: #f8fafc; box-shadow: 0 2px 8px rgb(0 0 0 / 24%); font: 12px/1.3 system-ui, sans-serif; white-space: nowrap; }
    [hidden] { display: none; }
    .name { overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
    .size { flex: none; color: #cbd5e1; font-variant-numeric: tabular-nums; }
`

export const BROWSER_ELEMENT_HIGHLIGHT_SCRIPT = String.raw`function() {
  const element = this;
  if (!(element instanceof Element) || !element.isConnected) return;
  const existing = globalThis.__lexoraElementHighlight;
  if (existing) {
    existing.select(element);
    return;
  }
  const host = document.createElement('div');
  host.setAttribute('popover', 'manual');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:visible!important;background:transparent!important;pointer-events:none!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(highlightStyle)};
  const outline = document.createElement('div');
  outline.className = 'outline';
  const label = document.createElement('div');
  label.className = 'label';
  const name = document.createElement('span');
  name.className = 'name';
  const size = document.createElement('span');
  size.className = 'size';
  label.append(name, size);
  shadow.append(style, outline, label);
  document.documentElement.append(host);
  host.showPopover();
  let target = element, frame, previous = '';
  function select(next) {
    if (target !== next) previous = '';
    target = next;
    name.textContent = target.localName + (target.id ? '#' + target.id : '');
  }
  function dispose() {
    cancelAnimationFrame(frame);
    host.remove();
    delete globalThis.__lexoraElementHighlight;
  }
  function draw() {
    if (!target.isConnected) { dispose(); return; }
    const rect = target.getBoundingClientRect();
    const left = Math.max(1, rect.left), top = Math.max(1, rect.top);
    const right = Math.min(innerWidth - 1, rect.right), bottom = Math.min(innerHeight - 1, rect.bottom);
    const visible = right > left && bottom > top;
    outline.hidden = label.hidden = !visible;
    const geometry = [left, top, right, bottom, rect.width, rect.height, innerWidth, innerHeight].join(',');
    if (visible && geometry !== previous) {
      previous = geometry;
      Object.assign(outline.style, { left: left + 'px', top: top + 'px', width: (right - left) + 'px', height: (bottom - top) + 'px' });
      size.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height);
      const labelTop = top >= 36 ? top - 32 : bottom + 32 <= innerHeight ? bottom + 6 : 8;
      label.style.top = labelTop + 'px';
      label.style.left = Math.max(8, Math.min(left, innerWidth - label.offsetWidth - 8)) + 'px';
    }
    frame = requestAnimationFrame(draw);
  }
  globalThis.__lexoraElementHighlight = { select, dispose };
  select(element);
  draw();
}`

export const BROWSER_ELEMENT_HIGHLIGHT_CLEAR_SCRIPT = 'globalThis.__lexoraElementHighlight?.dispose()'
