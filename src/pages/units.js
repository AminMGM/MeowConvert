import { icon } from '../ui/icons.js';
import { $ } from '../ui/dom.js';

// Factor to the base unit of each quantity. Temperature is handled separately.
const UNITS = {
  Length: { m: ['Meter', 1], km: ['Kilometer', 1000], cm: ['Centimeter', 0.01], mm: ['Millimeter', 0.001], um: ['Micrometer', 1e-6], mi: ['Mile', 1609.344], yd: ['Yard', 0.9144], ft: ['Foot', 0.3048], in: ['Inch', 0.0254], nmi: ['Nautical mile', 1852] },
  Weight: { kg: ['Kilogram', 1], g: ['Gram', 0.001], mg: ['Milligram', 1e-6], t: ['Tonne', 1000], lb: ['Pound', 0.45359237], oz: ['Ounce', 0.028349523125], st: ['Stone', 6.35029318] },
  Temperature: { c: ['Celsius'], f: ['Fahrenheit'], k: ['Kelvin'] },
  'Data size': { b: ['Byte', 1], kb: ['Kilobyte (KB)', 1e3], mb: ['Megabyte (MB)', 1e6], gb: ['Gigabyte (GB)', 1e9], tb: ['Terabyte (TB)', 1e12], kib: ['Kibibyte (KiB)', 1024], mib: ['Mebibyte (MiB)', 1024 ** 2], gib: ['Gibibyte (GiB)', 1024 ** 3], tib: ['Tebibyte (TiB)', 1024 ** 4], bit: ['Bit', 0.125] },
  Time: { s: ['Second', 1], ms: ['Millisecond', 0.001], min: ['Minute', 60], h: ['Hour', 3600], d: ['Day', 86400], wk: ['Week', 604800], mo: ['Month (avg)', 2629746], yr: ['Year', 31556952] },
  Area: { m2: ['Square meter', 1], km2: ['Square kilometer', 1e6], cm2: ['Square centimeter', 1e-4], ha: ['Hectare', 1e4], acre: ['Acre', 4046.8564224], ft2: ['Square foot', 0.09290304], in2: ['Square inch', 0.00064516], mi2: ['Square mile', 2589988.110336] },
  Volume: { l: ['Liter', 1], ml: ['Milliliter', 0.001], m3: ['Cubic meter', 1000], gal: ['US gallon', 3.785411784], qt: ['US quart', 0.946352946], pt: ['US pint', 0.473176473], cup: ['US cup', 0.2365882365], floz: ['US fluid ounce', 0.0295735295625], ukgal: ['UK gallon', 4.54609] },
  Speed: { mps: ['Meter/second', 1], kmh: ['Kilometer/hour', 1 / 3.6], mph: ['Mile/hour', 0.44704], kn: ['Knot', 0.514444], fps: ['Foot/second', 0.3048] },
  Pressure: { pa: ['Pascal', 1], kpa: ['Kilopascal', 1000], bar: ['Bar', 1e5], psi: ['PSI', 6894.757293168], atm: ['Atmosphere', 101325], mmhg: ['mmHg', 133.322387415] },
  Energy: { j: ['Joule', 1], kj: ['Kilojoule', 1000], cal: ['Calorie', 4.184], kcal: ['Kilocalorie', 4184], wh: ['Watt-hour', 3600], kwh: ['Kilowatt-hour', 3.6e6], btu: ['BTU', 1055.05585262] }
};
const state = { quantity: 'Length', from: 'm', to: 'ft', value: '1' };

function convert() {
  const value = Number(state.value);
  if (!Number.isFinite(value)) return '';
  if (state.quantity === 'Temperature') {
    const celsius = state.from === 'c' ? value : state.from === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
    return state.to === 'c' ? celsius : state.to === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15;
  }
  const units = UNITS[state.quantity];
  return value * units[state.from][1] / units[state.to][1];
}

const format = number => (number === '' ? '' : Math.abs(number) >= 1e15 || (Math.abs(number) < 1e-6 && number !== 0) ? number.toExponential(6) : Number(number.toPrecision(12)).toLocaleString(undefined, { maximumFractionDigits: 10 }));
const options = selected => Object.entries(UNITS[state.quantity]).map(([id, [label]]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${label}</option>`).join('');

export function renderUnits() {
  return `<div class="glass card">
    <div class="segmented" id="unit-quantity" style="margin-bottom:22px">${Object.keys(UNITS).map(name => `<button class="${name === state.quantity ? 'active' : ''}" data-q="${name}">${name}</button>`).join('')}</div>
    <div class="units">
      <div class="field"><div class="select-wrap"><select id="unit-from">${options(state.from)}</select></div><input class="big-input" id="unit-value" inputmode="decimal" value="${state.value}" /></div>
      <button class="btn swap" id="unit-swap" title="Swap">${icon('flip', 20)}</button>
      <div class="field"><div class="select-wrap"><select id="unit-to">${options(state.to)}</select></div><input class="big-input" id="unit-result" readonly value="${format(convert())}" /></div>
    </div></div>`;
}

export function bindUnits(root) {
  const rerender = () => {
    root.querySelector('.glass.card').outerHTML = renderUnits();
    bindUnits(root);
  };
  root.querySelectorAll('[data-q]').forEach(button => button.addEventListener('click', () => {
    state.quantity = button.dataset.q;
    const ids = Object.keys(UNITS[state.quantity]);
    state.from = ids[0];
    state.to = ids[1];
    rerender();
  }));
  $('#unit-from', root).addEventListener('change', event => { state.from = event.target.value; rerender(); });
  $('#unit-to', root).addEventListener('change', event => { state.to = event.target.value; rerender(); });
  $('#unit-swap', root).addEventListener('click', () => { [state.from, state.to] = [state.to, state.from]; rerender(); });
  const input = $('#unit-value', root);
  input.addEventListener('input', () => { state.value = input.value.replace(',', '.'); $('#unit-result', root).value = format(convert()); });
}
