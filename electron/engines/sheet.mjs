import fs from 'node:fs';
import { require, escapeHtml } from './util.mjs';
import { wrapHtml } from './document.mjs';

const XLSX = require('xlsx');
XLSX.set_fs(fs);

const BOOK_TYPES = { xlsx: 'xlsx', xls: 'biff8', xlsb: 'xlsb', ods: 'ods', fods: 'fods', xml: 'xlml' };

function readWorkbook(input, ext) {
  if (ext === 'json') {
    const data = JSON.parse(fs.readFileSync(input, 'utf8'));
    const workbook = XLSX.utils.book_new();
    const sheets = Array.isArray(data) ? { Sheet1: data } : Object.fromEntries(Object.entries(data).filter(([, value]) => Array.isArray(value)));
    if (!Object.keys(sheets).length) throw new Error('JSON must be an array of rows, or an object whose values are arrays of rows.');
    for (const [name, rows] of Object.entries(sheets)) {
      const sheet = rows.length && Array.isArray(rows[0]) ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.json_to_sheet(rows.map(row => (row && typeof row === 'object' ? flatten(row) : { value: row })));
      XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31) || 'Sheet1');
    }
    return workbook;
  }
  return XLSX.readFile(input, { cellDates: true, dense: true, FS: ext === 'tsv' ? '\t' : undefined, codepage: 65001 });
}

function flatten(object, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(object)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) flatten(value, name, out);
    else out[name] = Array.isArray(value) ? JSON.stringify(value) : value;
  }
  return out;
}

function sheetToMarkdown(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false, defval: '' });
  if (!rows.length) return '';
  const width = Math.max(...rows.map(row => row.length));
  const line = row => `| ${Array.from({ length: width }, (_, index) => String(row[index] ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`;
  return [line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)].join('\n');
}

export async function convertSheet(ctx, ext) {
  const workbook = readWorkbook(ctx.input, ext);
  const { target } = ctx;
  const names = workbook.SheetNames.filter(name => workbook.Sheets[name]);
  ctx.progress(0.4);
  if (BOOK_TYPES[target]) {
    const out = await ctx.output(`${ctx.stem}.${target}`);
    XLSX.writeFile(workbook, out, { bookType: BOOK_TYPES[target], compression: true });
    return;
  }
  if (target === 'csv' || target === 'tsv' || target === 'txt') {
    const separator = target === 'csv' ? (ctx.options.delimiter || ',') : '\t';
    for (const name of names) {
      const text = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { FS: separator, blankrows: false, dateNF: 'yyyy-mm-dd' });
      const out = await ctx.output(names.length > 1 ? `${ctx.stem} - ${name}.${target}` : `${ctx.stem}.${target}`);
      fs.writeFileSync(out, (target === 'csv' && ctx.options.excelBom !== false ? '﻿' : '') + text, 'utf8');
    }
    return;
  }
  if (target === 'json') {
    const data = Object.fromEntries(names.map(name => [name, XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null, raw: true })]));
    const out = await ctx.output(`${ctx.stem}.json`);
    fs.writeFileSync(out, JSON.stringify(names.length === 1 ? data[names[0]] : data, null, 2), 'utf8');
    return;
  }
  if (target === 'md') {
    const out = await ctx.output(`${ctx.stem}.md`);
    fs.writeFileSync(out, names.map(name => `${names.length > 1 ? `## ${name}\n\n` : ''}${sheetToMarkdown(workbook.Sheets[name])}`).join('\n\n') + '\n', 'utf8');
    return;
  }
  const tables = names.map(name => `${names.length > 1 ? `<h2>${escapeHtml(name)}</h2>` : ''}${XLSX.utils.sheet_to_html(workbook.Sheets[name], { header: '', footer: '' })}`).join('\n');
  const html = wrapHtml(tables, ctx.stem);
  if (target === 'html') {
    fs.writeFileSync(await ctx.output(`${ctx.stem}.html`), html, 'utf8');
    return;
  }
  if (target === 'pdf') {
    const pdf = await ctx.htmlToPdf(html, { pageSize: ctx.options.pageSize || 'A4', landscape: ctx.options.orientation !== 'portrait' });
    fs.writeFileSync(await ctx.output(`${ctx.stem}.pdf`), pdf);
    return;
  }
  throw new Error(`Cannot write ${target.toUpperCase()} from a spreadsheet.`);
}

