// Tool catalog. Each tool declares accepted inputs, options and how to turn files into jobs:
//   build(entry, values) → { target, options }        (one job per file)
//   combine(entries, values) → { tool, options }       (one job for all files)
import { VIDEO_IN, AUDIO_IN, IMAGE_IN, ARCHIVE_IN, OUTPUTS, extOf } from '../../shared/formats.mjs';
import { PAGE_SIZES } from './options.js';

const ASPECTS = [['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:5', '4:5'], ['4:3', '4:3'], ['3:2', '3:2'], ['21:9', '21:9']];
const RES = [['keep', 'Keep original'], ['2160', '4K'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['custom', 'Custom…']];
const AUDIO_FORMATS = [['same', 'Same as input'], ['mp3', 'MP3'], ['m4a', 'M4A (AAC)'], ['aac', 'AAC'], ['wav', 'WAV'], ['flac', 'FLAC'], ['ogg', 'OGG'], ['opus', 'OPUS'], ['wma', 'WMA'], ['aiff', 'AIFF']];
const VIDEO_FORMATS = [['same', 'Same as input'], ['mp4', 'MP4'], ['webm', 'WEBM'], ['mkv', 'MKV'], ['mov', 'MOV']];
const IMAGE_SAME = new Set(['jpg', 'png', 'webp', 'avif', 'gif', 'tiff']);
const trimFields = [
  { id: 'trimStart', label: 'Start', type: 'time', default: '', placeholder: '0:00' },
  { id: 'trimEnd', label: 'End', type: 'time', default: '', placeholder: 'end' }
];

const sameVideo = ext => (OUTPUTS[ext]?.kind === 'video' && ext !== 'mxf' ? ext : ext === 'mpeg' ? 'mpg' : 'mp4');
const sameAudio = ext => (OUTPUTS[ext]?.kind === 'audio' ? ext : ['aif', 'aifc'].includes(ext) ? 'aiff' : 'mp3');
const sameImage = ext => (ext === 'jpeg' || ext === 'jfif' || ext === 'jpe' ? 'jpg' : ext === 'tif' ? 'tiff' : IMAGE_SAME.has(ext) ? ext : 'jpg');
const pick = (value, ext, same) => (value === 'same' || !value ? same(ext) : value);
const MEDIA_IN = [...VIDEO_IN, ...AUDIO_IN];

export const TOOL_GROUPS = [
  { id: 'video', label: 'Video', icon: 'video' },
  { id: 'audio', label: 'Audio', icon: 'audio' },
  { id: 'image', label: 'Image', icon: 'image' },
  { id: 'pdf', label: 'PDF', icon: 'pdf' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'more', label: 'Utilities', icon: 'ruler' }
];

export const TOOLS = [
  // ───────── Video ─────────
  {
    id: 'video-compress', group: 'video', icon: 'compress', name: 'Video Compressor', desc: 'Shrink videos by percentage, to an exact size, or by quality.', accept: VIDEO_IN,
    options: [
      { id: 'mode', label: 'Compress by', type: 'segmented', default: 'percent', options: [['percent', 'Percentage'], ['size', 'Target size'], ['quality', 'Quality']] },
      { id: 'percent', label: 'Target size', type: 'range', min: 5, max: 90, default: 40, unit: '% of original', when: v => v.mode === 'percent' },
      { id: 'sizeMB', label: 'Target size', type: 'number', default: 25, min: 0.5, step: 1, unit: 'MB', when: v => v.mode === 'size' },
      { id: 'quality', label: 'Quality', type: 'range', min: 10, max: 100, default: 55, when: v => v.mode === 'quality' },
      { id: 'resolution', label: 'Max resolution', type: 'select', default: 'keep', options: RES.filter(([key]) => key !== 'custom') },
      { id: 'format', label: 'Output format', type: 'select', default: 'mp4', options: VIDEO_FORMATS }
    ],
    build: (entry, v) => ({ target: pick(v.format, entry.ext, sameVideo), options: { resolution: v.resolution, ...(v.mode === 'percent' ? { compressPercent: v.percent } : v.mode === 'size' ? { targetSizeMB: v.sizeMB } : { quality: v.quality }) } })
  },
  {
    id: 'video-trim', group: 'video', icon: 'scissors', name: 'Video Trimmer', desc: 'Cut a clip with a live preview and frame-accurate or instant trimming.', accept: VIDEO_IN, preview: 'media',
    options: [...trimFields, { id: 'mode', label: 'Trim mode', type: 'segmented', default: 'accurate', options: [['accurate', 'Accurate (re-encode)'], ['fast', 'Instant (no re-encode)']] }],
    build: (entry, v) => ({ target: sameVideo(entry.ext), options: { trimStart: v.trimStart, trimEnd: v.trimEnd, vcodec: v.mode === 'fast' ? 'copy' : 'auto', quality: 80 } })
  },
  {
    id: 'video-gif', group: 'video', icon: 'gif', name: 'Video to GIF', desc: 'Turn a clip into a high-quality GIF, animated WEBP or APNG.', accept: VIDEO_IN, preview: 'media',
    options: [
      ...trimFields,
      { id: 'format', label: 'Format', type: 'segmented', default: 'gif-anim', options: [['gif-anim', 'GIF'], ['webp-anim', 'WEBP'], ['apng', 'APNG']] },
      { id: 'gifFps', label: 'Frame rate', type: 'range', min: 5, max: 30, default: 12, unit: ' fps' },
      { id: 'gifWidth', label: 'Width', type: 'select', default: '480', options: [['320', '320 px'], ['480', '480 px'], ['640', '640 px'], ['800', '800 px'], ['1080', '1080 px'], ['keep', 'Original']] }
    ],
    build: (entry, v) => ({ target: v.format, options: { trimStart: v.trimStart, trimEnd: v.trimEnd, gifFps: v.gifFps, gifWidth: v.gifWidth, quality: 80 } })
  },
  {
    id: 'video-crop', group: 'video', icon: 'crop', name: 'Crop Video', desc: 'Center-crop to 16:9, 9:16 for Reels/TikTok, square and more.', accept: VIDEO_IN,
    options: [{ id: 'crop', label: 'Aspect ratio', type: 'segmented', default: '9:16', options: ASPECTS }, { id: 'format', label: 'Output format', type: 'select', default: 'same', options: VIDEO_FORMATS }],
    build: (entry, v) => ({ target: pick(v.format, entry.ext, sameVideo), options: { crop: v.crop, quality: 75 } })
  },
  {
    id: 'video-rotate', group: 'video', icon: 'rotate', name: 'Rotate & Flip Video', desc: 'Fix sideways or mirrored videos.', accept: VIDEO_IN,
    options: [{ id: 'rotate', label: 'Rotate', type: 'segmented', default: '90', options: [['0', 'None'], ['90', '90° →'], ['180', '180°'], ['270', '90° ←']] }, { id: 'flipH', label: 'Flip horizontally', type: 'toggle', default: false }, { id: 'flipV', label: 'Flip vertically', type: 'toggle', default: false }],
    build: (entry, v) => ({ target: sameVideo(entry.ext), options: { rotate: v.rotate, flipH: v.flipH, flipV: v.flipV, quality: 75 } })
  },
  {
    id: 'video-resize', group: 'video', icon: 'resize', name: 'Resize Video', desc: 'Change resolution and frame rate.', accept: VIDEO_IN,
    options: [
      { id: 'resolution', label: 'Resolution', type: 'select', default: '720', options: RES.filter(([key]) => key !== 'keep') },
      { id: 'width', label: 'Width', type: 'number', unit: 'px', when: v => v.resolution === 'custom' },
      { id: 'height', label: 'Height', type: 'number', unit: 'px', when: v => v.resolution === 'custom' },
      { id: 'fps', label: 'Frame rate', type: 'select', default: 'keep', options: [['keep', 'Keep'], ['60', '60'], ['30', '30'], ['25', '25'], ['24', '24'], ['15', '15']] }
    ],
    build: (entry, v) => ({ target: sameVideo(entry.ext), options: { resolution: v.resolution, width: v.width, height: v.height, fps: v.fps, quality: 75 } })
  },
  {
    id: 'video-speed', group: 'video', icon: 'speed', name: 'Change Video Speed', desc: 'Speed up or slow down video and audio together.', accept: VIDEO_IN,
    options: [{ id: 'speed', label: 'Speed', type: 'segmented', default: '2', options: [['0.25', '0.25×'], ['0.5', '0.5×'], ['0.75', '0.75×'], ['1.25', '1.25×'], ['1.5', '1.5×'], ['2', '2×'], ['4', '4×']] }],
    build: (entry, v) => ({ target: sameVideo(entry.ext), options: { speed: Number(v.speed), quality: 75 } })
  },
  {
    id: 'video-mute', group: 'video', icon: 'mute', name: 'Mute Video', desc: 'Remove the audio track without touching the picture.', accept: VIDEO_IN, options: [],
    build: entry => ({ target: sameVideo(entry.ext), options: { mute: true, quality: 85 } })
  },
  {
    id: 'video-audio', group: 'video', icon: 'audio', name: 'Extract Audio', desc: 'Save the soundtrack of a video as MP3, WAV, FLAC and more.', accept: VIDEO_IN,
    options: [{ id: 'format', label: 'Audio format', type: 'select', default: 'mp3', options: AUDIO_FORMATS.slice(1) }, { id: 'audioBitrate', label: 'Bitrate', type: 'select', default: '192', options: [['128', '128 kbps'], ['192', '192 kbps'], ['256', '256 kbps'], ['320', '320 kbps']] }],
    build: (entry, v) => ({ target: v.format, options: { audioBitrate: v.audioBitrate } })
  },
  {
    id: 'video-merge', group: 'video', icon: 'merge', name: 'Merge Videos', desc: 'Join clips in order into one MP4, even with mixed sizes.', accept: VIDEO_IN, min: 2,
    options: [{ id: 'resolution', label: 'Output size', type: 'select', default: 'first', options: [['first', 'Same as first clip'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']] }, { id: 'quality', label: 'Quality', type: 'range', min: 10, max: 100, default: 75 }],
    combine: (entries, v) => ({ tool: 'media-merge', options: { resolution: v.resolution, quality: v.quality } })
  },
  {
    id: 'video-frames', group: 'video', icon: 'images', name: 'Video to Images', desc: 'Export frames as JPG or PNG at a fixed interval.', accept: VIDEO_IN,
    options: [{ id: 'format', label: 'Format', type: 'segmented', default: 'frames-jpg', options: [['frames-jpg', 'JPG'], ['frames-png', 'PNG']] }, { id: 'frameInterval', label: 'Every', type: 'number', default: 1, min: 0.04, step: 0.5, unit: 'sec' }, ...trimFields],
    build: (entry, v) => ({ target: v.format, options: { frameInterval: v.frameInterval, trimStart: v.trimStart, trimEnd: v.trimEnd } })
  },
  // ───────── Audio ─────────
  {
    id: 'audio-trim', group: 'audio', icon: 'scissors', name: 'Audio Cutter', desc: 'Trim songs and recordings with fades and a live preview.', accept: MEDIA_IN, preview: 'media',
    options: [...trimFields, { id: 'fadeIn', label: 'Fade in', type: 'number', default: 0, min: 0, step: 0.5, unit: 'sec' }, { id: 'fadeOut', label: 'Fade out', type: 'number', default: 0, min: 0, step: 0.5, unit: 'sec' }, { id: 'format', label: 'Output format', type: 'select', default: 'same', options: AUDIO_FORMATS }],
    build: (entry, v) => ({ target: pick(v.format, entry.ext, sameAudio), options: { trimStart: v.trimStart, trimEnd: v.trimEnd, fadeIn: v.fadeIn, fadeOut: v.fadeOut } })
  },
  {
    id: 'audio-compress', group: 'audio', icon: 'compress', name: 'Audio Compressor', desc: 'Reduce audio file size with a lower bitrate or mono.', accept: AUDIO_IN,
    options: [{ id: 'audioBitrate', label: 'Bitrate', type: 'segmented', default: '96', options: [['48', '48k'], ['64', '64k'], ['96', '96k'], ['128', '128k'], ['160', '160k']] }, { id: 'channels', label: 'Channels', type: 'segmented', default: 'keep', options: [['keep', 'Keep'], ['1', 'Mono']] }, { id: 'format', label: 'Format', type: 'select', default: 'mp3', options: [['mp3', 'MP3'], ['m4a', 'M4A (AAC)'], ['opus', 'OPUS (smallest)'], ['ogg', 'OGG']] }],
    build: (entry, v) => ({ target: v.format, options: { audioBitrate: v.audioBitrate, channels: v.channels } })
  },
  {
    id: 'audio-volume', group: 'audio', icon: 'volume', name: 'Volume Booster', desc: 'Make audio louder or quieter, or normalize loudness.', accept: MEDIA_IN,
    options: [{ id: 'volume', label: 'Volume', type: 'range', min: 0, max: 400, step: 5, default: 150, unit: '%' }, { id: 'normalize', label: 'Normalize loudness (EBU R128)', type: 'toggle', default: false }],
    build: (entry, v) => ({ target: VIDEO_IN.includes(entry.ext) ? sameVideo(entry.ext) : sameAudio(entry.ext), options: { volume: v.volume, normalize: v.normalize, quality: 80 } })
  },
  {
    id: 'audio-speed', group: 'audio', icon: 'speed', name: 'Audio Speed Changer', desc: 'Change tempo without changing pitch.', accept: AUDIO_IN,
    options: [{ id: 'speed', label: 'Speed', type: 'segmented', default: '1.25', options: [['0.5', '0.5×'], ['0.75', '0.75×'], ['0.9', '0.9×'], ['1.1', '1.1×'], ['1.25', '1.25×'], ['1.5', '1.5×'], ['2', '2×']] }],
    build: (entry, v) => ({ target: sameAudio(entry.ext), options: { speed: Number(v.speed) } })
  },
  {
    id: 'audio-merge', group: 'audio', icon: 'merge', name: 'Audio Joiner', desc: 'Combine several tracks into one file.', accept: MEDIA_IN, min: 2,
    options: [{ id: 'format', label: 'Format', type: 'select', default: 'mp3', options: AUDIO_FORMATS.slice(1) }, { id: 'audioBitrate', label: 'Bitrate', type: 'select', default: '192', options: [['128', '128 kbps'], ['192', '192 kbps'], ['320', '320 kbps']] }],
    combine: (entries, v) => ({ tool: 'audio-merge', options: { format: v.format, audioBitrate: v.audioBitrate } })
  },
  {
    id: 'ringtone', group: 'audio', icon: 'waveform', name: 'Ringtone Maker', desc: 'Make an iPhone (M4R) or Android (MP3) ringtone.', accept: MEDIA_IN, preview: 'media',
    options: [...trimFields, { id: 'format', label: 'Phone', type: 'segmented', default: 'm4r', options: [['m4r', 'iPhone (M4R)'], ['mp3', 'Android (MP3)']] }, { id: 'fadeOut', label: 'Fade out', type: 'number', default: 1.5, min: 0, step: 0.5, unit: 'sec' }],
    build: (entry, v) => ({ target: v.format, options: { trimStart: v.trimStart, trimEnd: v.trimEnd || (v.format === 'm4r' ? '' : ''), fadeIn: 0.5, fadeOut: v.fadeOut } })
  },
  // ───────── Image ─────────
  {
    id: 'image-compress', group: 'image', icon: 'compress', name: 'Image Compressor', desc: 'Smaller JPG, PNG, WEBP and AVIF with smart quality, or to a target size.', accept: IMAGE_IN,
    options: [
      { id: 'mode', label: 'Compress by', type: 'segmented', default: 'quality', options: [['quality', 'Quality'], ['size', 'Max file size']] },
      { id: 'quality', label: 'Quality', type: 'range', min: 10, max: 100, default: 72, when: v => v.mode === 'quality' },
      { id: 'maxSizeKB', label: 'Max size', type: 'number', default: 200, min: 5, unit: 'KB', when: v => v.mode === 'size' },
      { id: 'format', label: 'Format', type: 'select', default: 'same', options: [['same', 'Same as input'], ['jpg', 'JPG'], ['webp', 'WEBP'], ['avif', 'AVIF'], ['png', 'PNG']] },
      { id: 'stripMetadata', label: 'Remove EXIF / metadata', type: 'toggle', default: true }
    ],
    build: (entry, v) => {
      const target = pick(v.format, entry.ext, sameImage);
      return { target, options: { quality: v.mode === 'quality' ? v.quality : 90, maxSizeKB: v.mode === 'size' ? v.maxSizeKB : 0, pngPalette: target === 'png' || target === 'gif', stripMetadata: v.stripMetadata } };
    }
  },
  {
    id: 'image-resize', group: 'image', icon: 'resize', name: 'Image Resizer', desc: 'Resize by pixels or percentage, with or without keeping proportions.', accept: IMAGE_IN,
    options: [
      { id: 'resizeMode', label: 'Resize by', type: 'segmented', default: 'percent', options: [['percent', 'Percent'], ['width', 'Width'], ['height', 'Height'], ['fit', 'Fit box'], ['fill', 'Fill box'], ['exact', 'Exact']] },
      { id: 'percent', label: 'Scale', type: 'range', min: 5, max: 400, default: 50, unit: '%', when: v => v.resizeMode === 'percent' },
      { id: 'width', label: 'Width', type: 'number', default: 1920, unit: 'px', when: v => v.resizeMode !== 'percent' && v.resizeMode !== 'height' },
      { id: 'height', label: 'Height', type: 'number', default: 1080, unit: 'px', when: v => v.resizeMode !== 'percent' && v.resizeMode !== 'width' },
      { id: 'allowUpscale', label: 'Allow enlarging', type: 'toggle', default: false },
      { id: 'format', label: 'Format', type: 'select', default: 'same', options: [['same', 'Same as input'], ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP'], ['avif', 'AVIF']] }
    ],
    build: (entry, v) => ({ target: pick(v.format, entry.ext, sameImage), options: { resizeMode: v.resizeMode, percent: v.percent, width: v.width, height: v.height, allowUpscale: v.allowUpscale, quality: 90 } })
  },
  {
    id: 'image-crop', group: 'image', icon: 'crop', name: 'Crop Image', desc: 'Crop to a social-media or print aspect ratio, centred or smart.', accept: IMAGE_IN,
    options: [{ id: 'crop', label: 'Aspect ratio', type: 'segmented', default: '1:1', options: ASPECTS }, { id: 'cropPosition', label: 'Focus', type: 'segmented', default: 'centre', options: [['centre', 'Center'], ['attention', 'Smart (subject)'], ['north', 'Top'], ['south', 'Bottom']] }],
    build: (entry, v) => ({ target: sameImage(entry.ext), options: { crop: v.crop, cropPosition: v.cropPosition, quality: 92 } })
  },
  {
    id: 'image-rotate', group: 'image', icon: 'rotate', name: 'Rotate & Flip Image', desc: 'Rotate in 90° steps or mirror images.', accept: IMAGE_IN,
    options: [{ id: 'rotate', label: 'Rotate', type: 'segmented', default: '90', options: [['0', 'None'], ['90', '90° →'], ['180', '180°'], ['270', '90° ←']] }, { id: 'flipH', label: 'Flip horizontally', type: 'toggle', default: false }, { id: 'flipV', label: 'Flip vertically', type: 'toggle', default: false }],
    build: (entry, v) => ({ target: sameImage(entry.ext), options: { rotate: v.rotate, flipH: v.flipH, flipV: v.flipV, quality: 92 } })
  },
  {
    id: 'image-svg', group: 'image', icon: 'vector', name: 'Image to SVG', desc: 'Vectorize logos and illustrations into scalable SVG.', accept: IMAGE_IN,
    options: [{ id: 'traceColors', label: 'Colours', type: 'range', min: 2, max: 64, default: 16 }, { id: 'tracePreset', label: 'Style', type: 'select', default: 'default', options: [['default', 'Balanced'], ['detailed', 'Detailed'], ['smoothed', 'Smooth'], ['posterized2', 'Posterized'], ['sharp', 'Sharp'], ['curvy', 'Curvy'], ['grayscale', 'Grayscale']] }],
    build: (entry, v) => ({ target: 'svg', options: { traceColors: v.traceColors, tracePreset: v.tracePreset } })
  },
  {
    id: 'image-ico', group: 'image', icon: 'icon', name: 'ICO & Favicon Maker', desc: 'Multi-size Windows icons and favicons from any image.', accept: IMAGE_IN,
    options: [{ id: 'icoSizes', label: 'Sizes', type: 'select', default: '16,24,32,48,64,128,256', options: [['16,24,32,48,64,128,256', 'Windows app (16–256 px)'], ['16,32,48', 'Favicon (16, 32, 48 px)'], ['256', '256 px only']] }, { id: 'crop', label: 'Make square', type: 'segmented', default: 'none', options: [['none', 'Fit'], ['1:1', 'Crop']] }],
    build: (entry, v) => ({ target: 'ico', options: { icoSizes: v.icoSizes, crop: v.crop } })
  },
  {
    id: 'image-gif', group: 'image', icon: 'gif', name: 'GIF & Slideshow Maker', desc: 'Turn a set of images into an animated GIF or MP4 slideshow.', accept: IMAGE_IN, min: 2,
    options: [{ id: 'format', label: 'Output', type: 'segmented', default: 'gif', options: [['gif', 'GIF'], ['mp4', 'MP4']] }, { id: 'frameDelay', label: 'Seconds per image', type: 'number', default: 0.6, min: 0.02, step: 0.1, unit: 'sec' }, { id: 'width', label: 'Width', type: 'select', default: '640', options: [['320', '320 px'], ['480', '480 px'], ['640', '640 px'], ['1080', '1080 px'], ['keep', 'Original (max 1280)']] }, { id: 'background', label: 'Background', type: 'color', default: '#ffffff' }],
    combine: (entries, v) => ({ tool: 'images-animation', options: v })
  },
  // ───────── PDF ─────────
  {
    id: 'pdf-merge', group: 'pdf', icon: 'merge', name: 'Merge PDF', desc: 'Combine PDFs into one document in the order you choose.', accept: ['pdf'], min: 2, options: [],
    combine: () => ({ tool: 'pdf-merge', options: {} })
  },
  {
    id: 'pdf-split', group: 'pdf', icon: 'split', name: 'Split PDF', desc: 'Split into single pages, fixed chunks, or custom ranges.', accept: ['pdf'],
    options: [{ id: 'mode', label: 'Split', type: 'segmented', default: 'each', options: [['each', 'Every page'], ['every', 'Every N pages'], ['ranges', 'Custom ranges']] }, { id: 'every', label: 'Pages per file', type: 'number', default: 2, min: 1, when: v => v.mode === 'every' }, { id: 'ranges', label: 'Ranges', type: 'text', default: '1-3; 4-6', placeholder: '1-3; 4; 5-', hint: 'Separate files with ;', when: v => v.mode === 'ranges' }],
    tool: 'pdf-split'
  },
  {
    id: 'pdf-compress', group: 'pdf', icon: 'compress', name: 'Compress PDF', desc: 'Re-encode images inside a PDF; text stays sharp and selectable.', accept: ['pdf'],
    options: [{ id: 'level', label: 'Level', type: 'segmented', default: 'recommended', options: [['low', 'Light'], ['recommended', 'Recommended'], ['extreme', 'Strong']] }, { id: 'removeMetadata', label: 'Remove document metadata', type: 'toggle', default: false }],
    tool: 'pdf-compress'
  },
  {
    id: 'pdf-organize', group: 'pdf', icon: 'layers', name: 'Extract or Delete Pages', desc: 'Keep or remove pages; the order you type is the order you get.', accept: ['pdf'],
    options: [{ id: 'mode', label: 'Action', type: 'segmented', default: 'keep', options: [['keep', 'Keep pages'], ['delete', 'Delete pages']] }, { id: 'pages', label: 'Pages', type: 'text', default: '1-3', placeholder: 'e.g. 1, 3-5, 9-' }],
    tool: 'pdf-organize'
  },
  {
    id: 'pdf-rotate', group: 'pdf', icon: 'rotate', name: 'Rotate PDF', desc: 'Rotate all or some pages.', accept: ['pdf'],
    options: [{ id: 'angle', label: 'Rotate', type: 'segmented', default: '90', options: [['90', '90° →'], ['180', '180°'], ['270', '90° ←']] }, { id: 'pages', label: 'Pages', type: 'text', default: 'all', placeholder: 'all, or 1, 3-5' }],
    tool: 'pdf-rotate'
  },
  {
    id: 'pdf-watermark', group: 'pdf', icon: 'droplet', name: 'Watermark PDF', desc: 'Stamp text across every page.', accept: ['pdf'],
    options: [{ id: 'text', label: 'Text', type: 'text', default: 'CONFIDENTIAL' }, { id: 'opacity', label: 'Opacity', type: 'range', min: 5, max: 100, default: 20, unit: '%' }, { id: 'position', label: 'Layout', type: 'segmented', default: 'diagonal', options: [['diagonal', 'Diagonal'], ['center-flat', 'Horizontal']] }, { id: 'color', label: 'Colour', type: 'color', default: '#888888' }],
    tool: 'pdf-watermark'
  },
  {
    id: 'pdf-number', group: 'pdf', icon: 'hash', name: 'Add Page Numbers', desc: 'Number pages in any corner with your own format.', accept: ['pdf'],
    options: [{ id: 'position', label: 'Position', type: 'select', default: 'bottom-center', options: [['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'], ['top-center', 'Top center'], ['top-right', 'Top right'], ['top-left', 'Top left']] }, { id: 'format', label: 'Format', type: 'text', default: '{n} / {total}', hint: '{n} = page, {total} = count' }, { id: 'start', label: 'Start at', type: 'number', default: 1, min: 0 }, { id: 'size', label: 'Font size', type: 'number', default: 10, min: 6, max: 36, unit: 'pt' }],
    tool: 'pdf-number'
  },
  {
    id: 'images-pdf', group: 'pdf', icon: 'images', name: 'Images to PDF', desc: 'Create a PDF from photos and scans, one image per page.', accept: IMAGE_IN, min: 1,
    options: [{ id: 'pageSize', label: 'Page size', type: 'select', default: 'a4', options: [['fit', 'Same as image'], ...PAGE_SIZES] }, { id: 'orientation', label: 'Orientation', type: 'segmented', default: 'auto', options: [['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']] }, { id: 'margin', label: 'Margin', type: 'range', min: 0, max: 72, default: 18, unit: ' pt' }, { id: 'name', label: 'File name', type: 'text', default: '', placeholder: 'Images.pdf' }],
    combine: (entries, v) => ({ tool: 'images-pdf', options: v })
  },
  {
    id: 'pdf-images', group: 'pdf', icon: 'image', name: 'PDF to Images', desc: 'Render pages to PNG, JPG or WEBP at the resolution you need.', accept: ['pdf'],
    options: [{ id: 'format', label: 'Format', type: 'segmented', default: 'png', options: [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WEBP']] }, { id: 'dpi', label: 'Resolution', type: 'segmented', default: '150', options: [['72', '72 dpi'], ['150', '150 dpi'], ['300', '300 dpi'], ['600', '600 dpi']] }, { id: 'pages', label: 'Pages', type: 'text', default: 'all', placeholder: 'all, or 1-3, 5' }, { id: 'quality', label: 'JPG/WEBP quality', type: 'range', min: 30, max: 100, default: 90, when: v => v.format !== 'png' }],
    tool: 'pdf-images'
  },
  // ───────── Archive ─────────
  {
    id: 'archive-create', group: 'archive', icon: 'archive', name: 'Create Archive', desc: 'Pack files into ZIP, 7Z or TAR — with AES-256 password if you like.', accept: '*', min: 1,
    options: [{ id: 'format', label: 'Format', type: 'segmented', default: 'zip', options: [['zip', 'ZIP'], ['7z', '7Z'], ['tar.gz', 'TAR.GZ'], ['tar.xz', 'TAR.XZ'], ['tar', 'TAR']] }, { id: 'level', label: 'Compression', type: 'range', min: 0, max: 9, default: 5 }, { id: 'password', label: 'Password', type: 'password', placeholder: 'Optional (ZIP / 7Z)', when: v => v.format === 'zip' || v.format === '7z' }, { id: 'name', label: 'Archive name', type: 'text', default: '', placeholder: 'Archive' }],
    combine: (entries, v) => ({ tool: 'archive-create', options: v })
  },
  {
    id: 'archive-extract', group: 'archive', icon: 'extract', name: 'Extract Archive', desc: 'Unpack ZIP, 7Z, RAR, TAR, GZ, ISO, CAB and more.', accept: ARCHIVE_IN,
    options: [{ id: 'password', label: 'Password', type: 'password', placeholder: 'Only for encrypted archives' }],
    tool: 'archive-extract'
  },
  // ───────── Utilities ─────────
  { id: 'unit-converter', group: 'more', icon: 'ruler', name: 'Unit Converter', desc: 'Length, weight, temperature, data size, time, speed and more.', special: 'units' }
];

export function toolById(id) {
  return TOOLS.find(tool => tool.id === id);
}

export function toolAccepts(tool, name) {
  if (tool.accept === '*') return true;
  return tool.accept.includes(extOf(name));
}
