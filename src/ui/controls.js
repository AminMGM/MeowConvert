// Declarative option forms. A definition looks like:
// { id, label, type: 'select'|'segmented'|'range'|'number'|'text'|'toggle'|'time'|'color', options, min, max, step, unit, hint, when(values) }
import { escapeHtml } from './dom.js';

export function defaultsFor(defs) {
  return Object.fromEntries(defs.filter(def => def.default !== undefined).map(def => [def.id, def.default]));
}

function visible(def, values, ctx) {
  return !def.when || def.when(values, ctx);
}

function control(def, value, prefix) {
  const id = `${prefix}-${def.id}`;
  const attrs = `id="${id}" data-option="${def.id}"`;
  switch (def.type) {
    case 'select':
      return `<div class="select-wrap"><select ${attrs}>${def.options.map(([key, label]) => `<option value="${escapeHtml(key)}" ${String(value) === String(key) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></div>`;
    case 'segmented':
      return `<div class="segmented" role="radiogroup" data-option="${def.id}">${def.options.map(([key, label]) => `<button type="button" role="radio" aria-checked="${String(value) === String(key)}" class="${String(value) === String(key) ? 'active' : ''}" data-value="${escapeHtml(key)}">${escapeHtml(label)}</button>`).join('')}</div>`;
    case 'range':
      return `<div class="range-row"><input type="range" ${attrs} min="${def.min}" max="${def.max}" step="${def.step || 1}" value="${escapeHtml(value)}" style="--fill:${((value - def.min) / (def.max - def.min) * 100).toFixed(1)}%" /><output for="${id}">${escapeHtml(formatValue(def, value))}</output></div>`;
    case 'number':
      return `<div class="input-wrap"><input type="number" ${attrs} min="${def.min ?? ''}" max="${def.max ?? ''}" step="${def.step || 'any'}" value="${escapeHtml(value ?? '')}" placeholder="${escapeHtml(def.placeholder || '')}" />${def.unit ? `<span class="unit">${escapeHtml(def.unit)}</span>` : ''}</div>`;
    case 'time':
      return `<div class="input-wrap"><input type="text" inputmode="decimal" ${attrs} value="${escapeHtml(value ?? '')}" placeholder="${escapeHtml(def.placeholder || '0:00')}" spellcheck="false" /></div>`;
    case 'text':
    case 'password':
      return `<div class="input-wrap"><input type="${def.type}" ${attrs} value="${escapeHtml(value ?? '')}" placeholder="${escapeHtml(def.placeholder || '')}" spellcheck="false" maxlength="${def.maxlength || 200}" /></div>`;
    case 'color':
      return `<div class="color-wrap"><input type="color" ${attrs} value="${escapeHtml(value || '#ffffff')}" /><span>${escapeHtml(value || '#ffffff')}</span></div>`;
    case 'toggle':
      return `<button type="button" class="switch ${value ? 'on' : ''}" role="switch" aria-checked="${Boolean(value)}" ${attrs}><i></i></button>`;
    default:
      return '';
  }
}

function formatValue(def, value) {
  return def.format ? def.format(Number(value)) : `${value}${def.unit || ''}`;
}

export function renderOptions(defs, values, prefix = 'opt', ctx = {}) {
  return defs.filter(def => visible(def, values, ctx)).map(def => `
    <div class="field ${def.type === 'toggle' ? 'field-inline' : ''} ${def.wide ? 'wide' : ''}">
      <label for="${prefix}-${def.id}"><span>${escapeHtml(def.label)}</span>${def.hint ? `<small>${escapeHtml(def.hint)}</small>` : ''}</label>
      ${control(def, values[def.id] ?? def.default, prefix)}
    </div>`).join('');
}

/** Wires up a rendered option form. onChange(values, structural) – structural means visibility may change. */
export function bindOptions(root, defs, values, onChange) {
  const byId = Object.fromEntries(defs.map(def => [def.id, def]));
  const affectsLayout = id => defs.some(def => def.when && def.when.toString().includes(id));
  root.querySelectorAll('[data-option]').forEach(element => {
    const def = byId[element.dataset.option];
    if (!def) return;
    if (def.type === 'segmented') {
      element.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
        values[def.id] = coerce(def, button.dataset.value);
        element.querySelectorAll('button').forEach(other => { other.classList.toggle('active', other === button); other.setAttribute('aria-checked', String(other === button)); });
        onChange(values, affectsLayout(def.id));
      }));
    } else if (def.type === 'toggle') {
      element.addEventListener('click', () => {
        values[def.id] = !values[def.id];
        element.classList.toggle('on', values[def.id]);
        element.setAttribute('aria-checked', String(values[def.id]));
        onChange(values, affectsLayout(def.id));
      });
    } else {
      const event = def.type === 'select' ? 'change' : 'input';
      element.addEventListener(event, () => {
        values[def.id] = coerce(def, element.value);
        if (def.type === 'range') {
          element.style.setProperty('--fill', `${((element.value - def.min) / (def.max - def.min) * 100).toFixed(1)}%`);
          element.nextElementSibling.textContent = formatValue(def, element.value);
        }
        if (def.type === 'color') element.nextElementSibling.textContent = element.value;
        onChange(values, def.type === 'select' && affectsLayout(def.id));
      });
    }
  });
}

function coerce(def, raw) {
  if (def.type === 'range' || def.type === 'number') return raw === '' ? '' : Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}
