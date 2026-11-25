// Shared format catalog used by both the Electron main process and the renderer.
// `targetsFor(ext, caps)` returns every output a given input can be converted to
// with the engines that are available on this machine.

export const CATEGORIES = {
  video: { label: 'Video', color: '#ff7a9c' },
  audio: { label: 'Audio', color: '#ffb35c' },
  image: { label: 'Image', color: '#5ce0b8' },
  document: { label: 'Document', color: '#6aa8ff' },
  ebook: { label: 'eBook', color: '#c48bff' },
  spreadsheet: { label: 'Spreadsheet', color: '#4fd27a' },
  presentation: { label: 'Presentation', color: '#ff8f5c' },
  archive: { label: 'Archive', color: '#e5c15c' },
  font: { label: 'Font', color: '#9aa7ff' },
  model: { label: '3D', color: '#5cd2ff' }
};

const list = value => value.trim().split(/\s+/);

export const VIDEO_IN = list('mp4 m4v mkv avi mov qt webm flv f4v wmv asf mpeg mpg mpe m1v m2v vob ts mts m2ts 3gp 3g2 ogv divx xvid mxf rm rmvb dv swf hevc h264 h265 y4m nut amv ivf');
export const AUDIO_IN = list('mp3 wav aac flac ogg oga opus m4a m4b m4r wma aiff aif aifc ac3 eac3 amr awb dts mp2 mpa au snd caf wv tta mka voc spx ape gsm w64 ra mod xm it s3m');
export const IMAGE_IN = list('jpg jpeg jfif jpe png webp avif gif tif tiff svg heic heif bmp dib ico cur tga psd dds pcx ppm pgm pbm pnm pam exr hdr qoi jp2 j2k sgi ras xbm xwd');
export const DOC_IN = list('pdf docx docm dotx doc dot odt rtf txt text log html htm xhtml md markdown wps wpd');
export const EBOOK_IN = list('epub mobi azw azw3 fb2 lit lrf pdb tcr snb');
export const SHEET_IN = list('xlsx xlsm xlsb xls ods fods csv tsv numbers json');
export const SLIDE_IN = list('pptx ppt pps ppsx odp key');
export const ARCHIVE_IN = list('zip 7z tar gz tgz bz2 tbz2 tbz xz txz zst tzst rar cab iso lzh lha cpio xar jar');
export const FONT_IN = list('ttf otf woff woff2 eot');
export const MODEL_IN = list('obj stl ply glb gltf fbx dae 3ds 3mf amf vtk vtp pcd wrl usdz usda usdc lwo');

const CATEGORY_OF = {};
for (const [cat, exts] of Object.entries({
  video: VIDEO_IN, audio: AUDIO_IN, image: IMAGE_IN, document: DOC_IN, ebook: EBOOK_IN,
  spreadsheet: SHEET_IN, presentation: SLIDE_IN, archive: ARCHIVE_IN, font: FONT_IN, model: MODEL_IN
})) {
  for (const ext of exts) CATEGORY_OF[ext] = cat;
}

/** Output definitions. `ext` is the file extension written; id is unique. */
export const OUTPUTS = {
  // video
  mp4: { label: 'MP4', ext: 'mp4', kind: 'video' },
  mkv: { label: 'MKV', ext: 'mkv', kind: 'video' },
  webm: { label: 'WEBM', ext: 'webm', kind: 'video' },
  mov: { label: 'MOV', ext: 'mov', kind: 'video' },
  avi: { label: 'AVI', ext: 'avi', kind: 'video' },
  wmv: { label: 'WMV', ext: 'wmv', kind: 'video' },
  flv: { label: 'FLV', ext: 'flv', kind: 'video' },
  m4v: { label: 'M4V', ext: 'm4v', kind: 'video' },
  mpg: { label: 'MPG', ext: 'mpg', kind: 'video' },
  mpeg: { label: 'MPEG', ext: 'mpeg', kind: 'video' },
  '3gp': { label: '3GP', ext: '3gp', kind: 'video' },
  '3g2': { label: '3G2', ext: '3g2', kind: 'video' },
  ogv: { label: 'OGV', ext: 'ogv', kind: 'video' },
  ts: { label: 'TS', ext: 'ts', kind: 'video' },
  mts: { label: 'MTS', ext: 'mts', kind: 'video' },
  m2ts: { label: 'M2TS', ext: 'm2ts', kind: 'video' },
  vob: { label: 'VOB', ext: 'vob', kind: 'video' },
  asf: { label: 'ASF', ext: 'asf', kind: 'video' },
  divx: { label: 'DIVX', ext: 'divx', kind: 'video' },
  f4v: { label: 'F4V', ext: 'f4v', kind: 'video' },
  mxf: { label: 'MXF', ext: 'mxf', kind: 'video' },
  swf: { label: 'SWF', ext: 'swf', kind: 'video' },
  'gif-anim': { label: 'GIF', ext: 'gif', kind: 'animation' },
  'webp-anim': { label: 'WEBP (animated)', ext: 'webp', kind: 'animation' },
  apng: { label: 'APNG', ext: 'png', kind: 'animation' },
  'frames-jpg': { label: 'JPG frames', ext: 'jpg', kind: 'frames' },
  'frames-png': { label: 'PNG frames', ext: 'png', kind: 'frames' },
  // audio
  mp3: { label: 'MP3', ext: 'mp3', kind: 'audio' },
  wav: { label: 'WAV', ext: 'wav', kind: 'audio' },
  aac: { label: 'AAC', ext: 'aac', kind: 'audio' },
  m4a: { label: 'M4A', ext: 'm4a', kind: 'audio' },
  flac: { label: 'FLAC', ext: 'flac', kind: 'audio' },
  alac: { label: 'ALAC (.m4a)', ext: 'm4a', kind: 'audio' },
  ogg: { label: 'OGG', ext: 'ogg', kind: 'audio' },
  oga: { label: 'OGA', ext: 'oga', kind: 'audio' },
  opus: { label: 'OPUS', ext: 'opus', kind: 'audio' },
  wma: { label: 'WMA', ext: 'wma', kind: 'audio' },
  aiff: { label: 'AIFF', ext: 'aiff', kind: 'audio' },
  m4r: { label: 'M4R (ringtone)', ext: 'm4r', kind: 'audio' },
  m4b: { label: 'M4B (audiobook)', ext: 'm4b', kind: 'audio' },
  ac3: { label: 'AC3', ext: 'ac3', kind: 'audio' },
  eac3: { label: 'E-AC3', ext: 'eac3', kind: 'audio' },
  dts: { label: 'DTS', ext: 'dts', kind: 'audio' },
  amr: { label: 'AMR', ext: 'amr', kind: 'audio' },
  awb: { label: 'AWB (AMR-WB)', ext: 'awb', kind: 'audio' },
  mp2: { label: 'MP2', ext: 'mp2', kind: 'audio' },
  au: { label: 'AU', ext: 'au', kind: 'audio' },
  caf: { label: 'CAF', ext: 'caf', kind: 'audio' },
  wv: { label: 'WV (WavPack)', ext: 'wv', kind: 'audio' },
  tta: { label: 'TTA', ext: 'tta', kind: 'audio' },
  mka: { label: 'MKA', ext: 'mka', kind: 'audio' },
  voc: { label: 'VOC', ext: 'voc', kind: 'audio' },
  spx: { label: 'SPX (Speex)', ext: 'spx', kind: 'audio' },
  // image
  jpg: { label: 'JPG', ext: 'jpg', kind: 'image' },
  png: { label: 'PNG', ext: 'png', kind: 'image' },
  webp: { label: 'WEBP', ext: 'webp', kind: 'image' },
  avif: { label: 'AVIF', ext: 'avif', kind: 'image' },
  gif: { label: 'GIF', ext: 'gif', kind: 'image' },
  tiff: { label: 'TIFF', ext: 'tiff', kind: 'image' },
  bmp: { label: 'BMP', ext: 'bmp', kind: 'image' },
  ico: { label: 'ICO', ext: 'ico', kind: 'image' },
  svg: { label: 'SVG (traced)', ext: 'svg', kind: 'image' },
  tga: { label: 'TGA', ext: 'tga', kind: 'image' },
  jp2: { label: 'JP2', ext: 'jp2', kind: 'image' },
  ppm: { label: 'PPM', ext: 'ppm', kind: 'image' },
  pgm: { label: 'PGM', ext: 'pgm', kind: 'image' },
  pbm: { label: 'PBM', ext: 'pbm', kind: 'image' },
  pcx: { label: 'PCX', ext: 'pcx', kind: 'image' },
  qoi: { label: 'QOI', ext: 'qoi', kind: 'image' },
  sgi: { label: 'SGI', ext: 'sgi', kind: 'image' },
  ras: { label: 'RAS', ext: 'ras', kind: 'image' },
  xbm: { label: 'XBM', ext: 'xbm', kind: 'image' },
  xwd: { label: 'XWD', ext: 'xwd', kind: 'image' },
  hdr: { label: 'HDR', ext: 'hdr', kind: 'image' },
  exr: { label: 'EXR', ext: 'exr', kind: 'image' },
  // documents
  pdf: { label: 'PDF', ext: 'pdf', kind: 'document' },
  docx: { label: 'DOCX', ext: 'docx', kind: 'document' },
  doc: { label: 'DOC', ext: 'doc', kind: 'document' },
  odt: { label: 'ODT', ext: 'odt', kind: 'document' },
  rtf: { label: 'RTF', ext: 'rtf', kind: 'document' },
  txt: { label: 'TXT', ext: 'txt', kind: 'document' },
  html: { label: 'HTML', ext: 'html', kind: 'document' },
  md: { label: 'Markdown', ext: 'md', kind: 'document' },
  epub: { label: 'EPUB', ext: 'epub', kind: 'ebook' },
  mobi: { label: 'MOBI', ext: 'mobi', kind: 'ebook' },
  azw3: { label: 'AZW3', ext: 'azw3', kind: 'ebook' },
  fb2: { label: 'FB2', ext: 'fb2', kind: 'ebook' },
  'pdf-jpg': { label: 'JPG (pages)', ext: 'jpg', kind: 'pdfimage' },
  'pdf-png': { label: 'PNG (pages)', ext: 'png', kind: 'pdfimage' },
  'pdf-webp': { label: 'WEBP (pages)', ext: 'webp', kind: 'pdfimage' },
  // spreadsheets
  xlsx: { label: 'XLSX', ext: 'xlsx', kind: 'sheet' },
  xls: { label: 'XLS', ext: 'xls', kind: 'sheet' },
  xlsb: { label: 'XLSB', ext: 'xlsb', kind: 'sheet' },
  ods: { label: 'ODS', ext: 'ods', kind: 'sheet' },
  fods: { label: 'FODS', ext: 'fods', kind: 'sheet' },
  csv: { label: 'CSV', ext: 'csv', kind: 'sheet' },
  tsv: { label: 'TSV', ext: 'tsv', kind: 'sheet' },
  json: { label: 'JSON', ext: 'json', kind: 'sheet' },
  xml: { label: 'XML (Excel 2003)', ext: 'xml', kind: 'sheet' },
  // presentations
  pptx: { label: 'PPTX', ext: 'pptx', kind: 'slides' },
  ppt: { label: 'PPT', ext: 'ppt', kind: 'slides' },
  odp: { label: 'ODP', ext: 'odp', kind: 'slides' },
  // archives
  zip: { label: 'ZIP', ext: 'zip', kind: 'archive' },
  '7z': { label: '7Z', ext: '7z', kind: 'archive' },
  tar: { label: 'TAR', ext: 'tar', kind: 'archive' },
  'tar.gz': { label: 'TAR.GZ', ext: 'tar.gz', kind: 'archive' },
  'tar.bz2': { label: 'TAR.BZ2', ext: 'tar.bz2', kind: 'archive' },
  'tar.xz': { label: 'TAR.XZ', ext: 'tar.xz', kind: 'archive' },
  'tar.zst': { label: 'TAR.ZST', ext: 'tar.zst', kind: 'archive' },
  // fonts
  ttf: { label: 'TTF', ext: 'ttf', kind: 'font' },
  woff: { label: 'WOFF', ext: 'woff', kind: 'font' },
  woff2: { label: 'WOFF2', ext: 'woff2', kind: 'font' },
  eot: { label: 'EOT', ext: 'eot', kind: 'font' },
  'svg-font': { label: 'SVG font', ext: 'svg', kind: 'font' },
  // 3D
  glb: { label: 'GLB', ext: 'glb', kind: 'model' },
  gltf: { label: 'GLTF', ext: 'gltf', kind: 'model' },
  obj: { label: 'OBJ', ext: 'obj', kind: 'model' },
  stl: { label: 'STL', ext: 'stl', kind: 'model' },
  ply: { label: 'PLY', ext: 'ply', kind: 'model' },
  usdz: { label: 'USDZ', ext: 'usdz', kind: 'model' }
};

const VIDEO_OUT = list('mp4 mkv webm mov avi wmv flv m4v mpg mpeg 3gp 3g2 ogv ts mts m2ts vob asf divx f4v mxf swf gif-anim webp-anim apng frames-jpg frames-png');
const AUDIO_OUT = list('mp3 wav aac m4a flac alac ogg oga opus wma aiff m4r m4b ac3 eac3 dts amr awb mp2 au caf wv tta mka voc spx');
const IMAGE_OUT = list('jpg png webp avif gif tiff bmp ico pdf svg tga jp2 ppm pgm pbm pcx qoi sgi ras xbm xwd hdr exr');
const ANIMATED_IN = new Set(['gif', 'webp']);
const SHEET_OUT = list('xlsx xls xlsb ods fods csv tsv json xml html txt md pdf');
const ARCHIVE_OUT = list('zip 7z tar tar.gz tar.bz2 tar.xz tar.zst');
const FONT_OUT = list('ttf woff woff2 eot svg-font');
const MODEL_OUT = list('glb gltf obj stl ply usdz');

export const LIBREOFFICE_DOC_IN = new Set(list('doc dot docm odt rtf wps wpd'));
const NATIVE_DOC_IN = new Set(list('docx dotx txt text log html htm xhtml md markdown'));

export function extOf(name) {
  const lower = String(name).toLowerCase();
  for (const compound of ['tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst']) {
    if (lower.endsWith(`.${compound}`)) return compound === 'tar.gz' ? 'tgz' : compound === 'tar.bz2' ? 'tbz2' : compound === 'tar.xz' ? 'txz' : 'tzst';
  }
  const match = /\.([a-z0-9]+)$/.exec(lower);
  return match ? match[1] : '';
}

export function categoryOf(ext) {
  return CATEGORY_OF[ext] || null;
}

/**
 * Returns output ids an input extension can convert to.
 * caps: { libreoffice: boolean, calibre: boolean }
 */
export function targetsFor(ext, caps = {}) {
  const cat = categoryOf(ext);
  const out = [];
  const add = items => items.forEach(item => { if (!out.includes(item)) out.push(item); });
  switch (cat) {
    case 'video':
      add(VIDEO_OUT); add(AUDIO_OUT); break;
    case 'audio':
      add(AUDIO_OUT); break;
    case 'image':
      add(IMAGE_OUT);
      // Animated GIF/WebP keep their animation through the image engine; these add video outputs.
      if (ANIMATED_IN.has(ext)) add(list('mp4 webm mov avi mkv apng'));
      break;
    case 'document':
      if (ext === 'pdf') {
        add(list('docx html txt md epub pdf-jpg pdf-png pdf-webp'));
        if (caps.calibre) add(list('mobi azw3 fb2'));
      } else if (NATIVE_DOC_IN.has(ext)) {
        add(list('pdf docx html txt md epub'));
        if (caps.libreoffice) add(list('doc odt rtf'));
        if (caps.calibre) add(list('mobi azw3 fb2'));
      } else if (ext === 'rtf') {
        add(list('txt pdf docx html md epub'));
        if (caps.libreoffice) add(list('doc odt'));
      } else if (caps.libreoffice) {
        add(list('pdf docx doc odt rtf txt html md epub'));
      }
      break;
    case 'ebook':
      if (ext === 'epub') add(list('pdf docx html txt md'));
      if (caps.calibre) add(list('epub mobi azw3 fb2 pdf docx txt html'));
      break;
    case 'spreadsheet':
      add(SHEET_OUT);
      break;
    case 'presentation':
      if (caps.libreoffice) add(list('pdf pptx ppt odp'));
      break;
    case 'archive':
      add(ARCHIVE_OUT); break;
    case 'font':
      add(FONT_OUT); break;
    case 'model':
      add(MODEL_OUT); break;
  }
  // Never offer converting to the exact same format.
  return out.filter(id => {
    const target = OUTPUTS[id];
    if (!target) return false;
    if (cat === 'image' && id === ext) return ['jpg', 'png', 'webp', 'avif', 'gif', 'tiff'].includes(id); // re-encode/compress allowed
    if (target.ext === ext && target.kind !== 'image' && target.kind !== 'frames' && target.kind !== 'pdfimage' && target.kind !== 'animation') return false;
    return true;
  });
}

/** Explains why a known extension has no targets (missing optional engine). */
export function missingEngineFor(ext) {
  const cat = categoryOf(ext);
  if (cat === 'presentation' || LIBREOFFICE_DOC_IN.has(ext) && ext !== 'rtf') return 'libreoffice';
  if (cat === 'ebook' && ext !== 'epub') return 'calibre';
  return null;
}

export function defaultTarget(ext, caps) {
  const cat = categoryOf(ext);
  const prefs = {
    video: 'mp4', audio: 'mp3', image: ext === 'png' ? 'webp' : 'png', document: ext === 'pdf' ? 'docx' : 'pdf',
    ebook: ext === 'epub' ? 'pdf' : 'epub', spreadsheet: ext === 'xlsx' ? 'csv' : 'xlsx', presentation: 'pdf',
    archive: ext === 'zip' ? '7z' : 'zip', font: ext === 'woff2' ? 'ttf' : 'woff2', model: ext === 'glb' ? 'obj' : 'glb'
  };
  const targets = targetsFor(ext, caps);
  let preferred = prefs[cat];
  if (cat === 'video' && ext === 'mp4') preferred = 'mkv';
  if (cat === 'audio' && ext === 'mp3') preferred = 'wav';
  return targets.includes(preferred) ? preferred : targets[0] || null;
}

export function acceptAttr() {
  return Object.keys(CATEGORY_OF).map(ext => `.${ext}`).join(',') + ',.tar.gz,.tar.bz2,.tar.xz';
}
