// Option definitions shared by the converter and the tools.
const RESOLUTIONS = [['keep', 'Keep original'], ['2160', '4K (2160p)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['240', '240p'], ['custom', 'Custom…']];
const FPS = [['keep', 'Keep original'], ['60', '60 fps'], ['50', '50 fps'], ['30', '30 fps'], ['25', '25 fps'], ['24', '24 fps'], ['15', '15 fps']];
const BITRATES = [['auto', 'Auto'], ['64', '64 kbps'], ['96', '96 kbps'], ['128', '128 kbps'], ['160', '160 kbps'], ['192', '192 kbps'], ['256', '256 kbps'], ['320', '320 kbps']];
const SAMPLE_RATES = [['keep', 'Keep original'], ['8000', '8 kHz'], ['16000', '16 kHz'], ['22050', '22.05 kHz'], ['32000', '32 kHz'], ['44100', '44.1 kHz'], ['48000', '48 kHz'], ['96000', '96 kHz']];
const CHANNELS = [['keep', 'Keep'], ['1', 'Mono'], ['2', 'Stereo']];
const ASPECTS = [['none', 'Original'], ['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:5', '4:5'], ['4:3', '4:3'], ['3:2', '3:2'], ['21:9', '21:9']];
export const PAGE_SIZES = [['a4', 'A4'], ['letter', 'Letter'], ['legal', 'Legal'], ['a3', 'A3'], ['a5', 'A5']];

const qualityLabel = value => value >= 90 ? `${value} · Best` : value >= 70 ? `${value} · High` : value >= 45 ? `${value} · Medium` : `${value} · Small`;

export const OPTION_DEFS = {
  video: [
    { id: 'vcodec', label: 'Video codec', type: 'select', default: 'auto', options: [['auto', 'Auto (best for format)'], ['h264', 'H.264 / AVC'], ['h265', 'H.265 / HEVC'], ['vp9', 'VP9'], ['av1', 'AV1 (slow, smallest)'], ['vp8', 'VP8']], hint: 'Used when the format supports it' },
    { id: 'quality', label: 'Quality', type: 'range', min: 10, max: 100, step: 1, default: 70, format: qualityLabel },
    { id: 'resolution', label: 'Resolution', type: 'select', default: 'keep', options: RESOLUTIONS, hint: 'Never upscales' },
    { id: 'width', label: 'Width', type: 'number', unit: 'px', min: 16, when: v => v.resolution === 'custom' },
    { id: 'height', label: 'Height', type: 'number', unit: 'px', min: 16, when: v => v.resolution === 'custom' },
    { id: 'fps', label: 'Frame rate', type: 'select', default: 'keep', options: FPS },
    { id: 'audioBitrate', label: 'Audio bitrate', type: 'select', default: 'auto', options: BITRATES },
    { id: 'mute', label: 'Remove audio', type: 'toggle', default: false },
    { id: 'gifFps', label: 'GIF / animation fps', type: 'range', min: 5, max: 30, default: 12, unit: ' fps', when: (_, ctx) => ctx?.animation },
    { id: 'gifWidth', label: 'Animation width', type: 'select', default: '480', options: [['keep', 'Original'], ['320', '320 px'], ['480', '480 px'], ['640', '640 px'], ['800', '800 px'], ['1080', '1080 px']], when: (_, ctx) => ctx?.animation },
    { id: 'frameInterval', label: 'Extract a frame every', type: 'number', default: 1, min: 0.04, step: 0.5, unit: 'sec', when: (_, ctx) => ctx?.frames }
  ],
  audio: [
    { id: 'audioBitrate', label: 'Bitrate', type: 'select', default: 'auto', options: BITRATES, hint: 'Ignored by lossless formats' },
    { id: 'sampleRate', label: 'Sample rate', type: 'select', default: 'keep', options: SAMPLE_RATES },
    { id: 'channels', label: 'Channels', type: 'segmented', default: 'keep', options: CHANNELS },
    { id: 'bitDepth', label: 'WAV/AIFF bit depth', type: 'segmented', default: '16', options: [['16', '16-bit'], ['24', '24-bit']] },
    { id: 'volume', label: 'Volume', type: 'range', min: 0, max: 300, step: 5, default: 100, unit: '%' },
    { id: 'normalize', label: 'Normalize loudness', type: 'toggle', default: false }
  ],
  image: [
    { id: 'quality', label: 'Quality', type: 'range', min: 1, max: 100, default: 85, format: qualityLabel, hint: 'JPG, WEBP, AVIF' },
    { id: 'resizeMode', label: 'Resize', type: 'select', default: 'none', options: [['none', 'Keep size'], ['percent', 'By percentage'], ['width', 'By width'], ['height', 'By height'], ['fit', 'Fit inside box'], ['exact', 'Exact size (stretch)']] },
    { id: 'percent', label: 'Scale', type: 'range', min: 5, max: 200, default: 50, unit: '%', when: v => v.resizeMode === 'percent' },
    { id: 'width', label: 'Width', type: 'number', unit: 'px', min: 1, when: v => ['width', 'fit', 'exact'].includes(v.resizeMode) },
    { id: 'height', label: 'Height', type: 'number', unit: 'px', min: 1, when: v => ['height', 'fit', 'exact'].includes(v.resizeMode) },
    { id: 'lossless', label: 'Lossless WEBP/AVIF', type: 'toggle', default: false },
    { id: 'stripMetadata', label: 'Remove EXIF / metadata', type: 'toggle', default: false },
    { id: 'background', label: 'Background for transparency', type: 'color', default: '#ffffff', hint: 'JPG, BMP and PDF' },
    { id: 'pageSize', label: 'PDF page size', type: 'select', default: 'fit', options: [['fit', 'Same as image'], ...PAGE_SIZES], when: (_, ctx) => ctx?.pdf },
    { id: 'traceColors', label: 'SVG colours', type: 'range', min: 2, max: 64, default: 16, when: (_, ctx) => ctx?.svg },
    { id: 'tracePreset', label: 'SVG trace style', type: 'select', default: 'default', options: [['default', 'Balanced'], ['detailed', 'Detailed'], ['smoothed', 'Smooth'], ['posterized2', 'Posterized'], ['curvy', 'Curvy'], ['sharp', 'Sharp'], ['grayscale', 'Grayscale'], ['artistic2', 'Artistic']], when: (_, ctx) => ctx?.svg }
  ],
  document: [
    { id: 'pageSize', label: 'PDF page size', type: 'select', default: 'a4', options: PAGE_SIZES },
    { id: 'orientation', label: 'Orientation', type: 'segmented', default: 'portrait', options: [['portrait', 'Portrait'], ['landscape', 'Landscape']] }
  ],
  spreadsheet: [
    { id: 'delimiter', label: 'CSV delimiter', type: 'segmented', default: ',', options: [[',', 'Comma'], [';', 'Semicolon'], ['|', 'Pipe']] },
    { id: 'excelBom', label: 'Excel-friendly UTF-8 CSV', type: 'toggle', default: true },
    { id: 'orientation', label: 'PDF orientation', type: 'segmented', default: 'landscape', options: [['portrait', 'Portrait'], ['landscape', 'Landscape']] }
  ],
  archive: [
    { id: 'level', label: 'Compression level', type: 'range', min: 0, max: 9, default: 5, format: v => (v === 0 ? 'Store' : v <= 3 ? `${v} · Fast` : v <= 6 ? `${v} · Normal` : `${v} · Ultra`) },
    { id: 'password', label: 'Password of the source archive', type: 'password', placeholder: 'Only if it is encrypted' },
    { id: 'newPassword', label: 'Protect output with password', type: 'password', placeholder: 'ZIP / 7Z only' }
  ],
  model: [
    { id: 'scale', label: 'Scale', type: 'number', default: 1, min: 0.0001, step: 0.1, unit: '×' },
    { id: 'upAxis', label: 'Up axis', type: 'select', default: 'keep', options: [['keep', 'Keep'], ['z-to-y', 'Z-up → Y-up'], ['y-to-z', 'Y-up → Z-up']] },
    { id: 'center', label: 'Center model at origin', type: 'toggle', default: false },
    { id: 'stlFormat', label: 'STL / PLY encoding', type: 'segmented', default: 'binary', options: [['binary', 'Binary'], ['ascii', 'ASCII']] }
  ],
  ebook: [],
  presentation: [],
  font: []
};
OPTION_DEFS.ebook = OPTION_DEFS.document;
