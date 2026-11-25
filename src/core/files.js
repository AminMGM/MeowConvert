import { extOf, categoryOf } from '../../shared/formats.mjs';

/** Converts dropped/selected files into queue entries. */
export function toEntry(file) {
  const ext = extOf(file.name);
  let path = '';
  try {
    path = window.meow?.pathForFile(file) || '';
  } catch {
    path = '';
  }
  return { id: crypto.randomUUID(), file, path, name: file.name, size: file.size, ext, category: categoryOf(ext), status: 'ready', progress: 0 };
}

/** Entries for files opened through Windows (command line / "Open with"); no File object. */
export function toPathEntry({ path, name, size }) {
  const ext = extOf(name);
  return { id: crypto.randomUUID(), file: null, path, name, size, ext, category: categoryOf(ext), status: 'ready', progress: 0 };
}

/** Collects files from a drop, walking into dropped folders. */
export async function filesFromDrop(dataTransfer) {
  const items = [...(dataTransfer.items || [])].filter(item => item.kind === 'file');
  const entries = items.map(item => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dataTransfer.files];
  const files = [];
  const walk = async entry => {
    if (files.length > 5000) return;
    if (entry.isFile) {
      files.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await walk(child);
      } while (batch.length);
    }
  };
  for (const entry of entries) await walk(entry);
  return files;
}

/** Map of lower-cased file name → blob URL, so 3D models can find their textures/MTL/BIN files. */
export function siblingMap(files) {
  const map = new Map();
  for (const file of files) map.set(file.name.toLowerCase(), URL.createObjectURL(file));
  return map;
}

export function pickFiles({ accept = '', multiple = true } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    if (accept) input.accept = accept;
    input.addEventListener('change', () => resolve([...input.files]));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}
