// Runs conversions: routes each job to the main-process engines or to the in-window engines
// (3D, PDF rendering), with concurrency, progress, cancellation and history.
import { OUTPUTS, categoryOf, extOf } from '../../shared/formats.mjs';
import { store, addHistory } from './store.js';

const progressHandlers = new Map();
window.meow?.onJobProgress(({ id, progress }) => progressHandlers.get(id)?.(progress));

const stemOf = name => name.replace(/\.(tar\.(gz|bz2|xz|zst)|[^.]+)$/i, '');

async function readBytes(entry) {
  if (!entry.file) throw new Error('This file must be added again (drag it into the window).');
  return new Uint8Array(await entry.file.arrayBuffer());
}

/** Runs a single job. spec = { entry, target, options } or { tool, entries, options }. */
export async function execute(spec, { outToken, onProgress = () => {}, signal, siblings }) {
  const id = crypto.randomUUID();
  const entry = spec.entry || spec.entries?.[0];
  const ext = entry ? extOf(entry.name) : '';
  const output = spec.target ? OUTPUTS[spec.target] : null;
  const written = [];
  const notes = [];
  const writer = folder => async (name, bytes) => {
    const result = await window.meow.writeOutput({ jobId: id, input: entry.path, outToken, name, bytes, folder });
    written.push(result);
    return result;
  };
  const finishRenderer = () => {
    window.meow.releaseFolders(id);
    const folders = [...new Set(written.map(item => item.folder).filter(Boolean))];
    const outputs = folders.length
      ? folders.map(folder => ({ path: folder, isFolder: true, count: written.filter(item => item.folder === folder).length, size: written.filter(item => item.folder === folder).reduce((sum, item) => sum + item.size, 0) }))
      : written.map(item => ({ path: item.path, size: item.size }));
    return { ok: true, outputs, notes, inputSize: entry.size };
  };

  try {
    // In-window engines.
    if (!spec.tool && categoryOf(ext) === 'model') {
      const { convertModel } = await import('../engines/model3d.js');
      onProgress(0.1);
      const bytes = await convertModel(await readBytes(entry), ext, spec.target, spec.options || {}, siblings || new Map());
      if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { cancelled: true });
      await writer(null)(`${stemOf(entry.name)}.${output.ext}`, bytes);
      return finishRenderer();
    }
    if ((output?.kind === 'pdfimage') || spec.tool === 'pdf-images') {
      const { pdfToImages } = await import('../engines/pdf-render.js');
      const format = spec.tool ? (spec.options.format || 'png') : output.ext;
      await pdfToImages(await readBytes(entry), { ...spec.options, format, stem: stemOf(entry.name) }, writer(`${stemOf(entry.name)} pages`), onProgress, signal);
      return finishRenderer();
    }
    let htmlContent = null;
    if (!spec.tool && ext === 'pdf' && output && ['document', 'ebook'].includes(output.kind)) {
      const { pdfToHtml } = await import('../engines/pdf-render.js');
      htmlContent = await pdfToHtml(await readBytes(entry), value => onProgress(value), signal);
    }
    // Main-process engines.
    progressHandlers.set(id, onProgress);
    const abort = () => window.meow.cancelJob(id);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const inputs = spec.entries ? spec.entries.map(item => item.path) : [entry.path];
      if (inputs.some(input => !input)) throw new Error('Could not access the file path. Add the file again.');
      return await window.meow.runJob({ id, tool: spec.tool, input: inputs[0], inputs, target: spec.target, options: spec.options || {}, htmlContent, outToken, baseName: spec.baseName });
    } finally {
      signal?.removeEventListener('abort', abort);
      progressHandlers.delete(id);
    }
  } catch (error) {
    if (written.length) await window.meow.discardOutputs(written.map(item => item.path));
    window.meow.releaseFolders(id);
    return { ok: false, cancelled: Boolean(error.cancelled || signal?.aborted), error: error.message || String(error) };
  }
}

/** Asks for a folder when the output mode is "ask"; returns { token } or null if cancelled. */
export async function prepareOutput() {
  if (store.settings.outputMode !== 'ask') return { token: null };
  const result = await window.meow.chooseFolder('batch');
  return result ? { token: result.token } : null;
}

/**
 * Runs `tasks` with the configured concurrency.
 * task: { spec, label, onUpdate(task) } — task gets status/progress/result fields.
 */
export async function runTasks(tasks, { outToken, historyLabel } = {}) {
  let next = 0;
  const concurrency = Math.max(1, Math.min(store.settings.concurrency || 2, tasks.length));
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      if (task.status === 'cancelled') continue;
      task.controller = new AbortController();
      task.status = 'running';
      task.progress = 0;
      task.onUpdate?.(task);
      let lastPaint = 0;
      const started = performance.now();
      const result = await execute(task.spec, {
        outToken,
        signal: task.controller.signal,
        siblings: task.siblings,
        onProgress: value => {
          task.progress = value;
          const now = performance.now();
          if (now - lastPaint > 80 || value >= 1) { lastPaint = now; task.onUpdate?.(task, 'progress'); }
        }
      });
      task.result = result;
      task.elapsed = (performance.now() - started) / 1000;
      task.status = result.ok ? 'done' : result.cancelled ? 'cancelled' : 'error';
      task.progress = result.ok ? 1 : task.progress;
      task.onUpdate?.(task);
      if (result.ok) {
        addHistory({
          label: historyLabel || task.label,
          inputName: task.label,
          inputSize: result.inputSize,
          target: task.spec.target ? OUTPUTS[task.spec.target]?.label : task.spec.toolName,
          outputs: result.outputs,
          notes: result.notes
        });
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (outToken) window.meow.releaseOutput(outToken);
  const done = tasks.filter(task => task.status === 'done');
  const failed = tasks.filter(task => task.status === 'error');
  if (done.length) {
    window.meow.notify(`${done.length} file${done.length === 1 ? '' : 's'} converted${failed.length ? `, ${failed.length} failed` : ''}.`);
    if (store.settings.openFolderWhenDone) {
      const first = done[0].result.outputs[0];
      window.meow.showItem(first.path).catch(() => {});
    }
  }
  return { done: done.length, failed: failed.length, cancelled: tasks.filter(task => task.status === 'cancelled').length };
}
