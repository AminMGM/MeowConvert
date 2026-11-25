import path from 'node:path';
import { OUTPUTS } from '../../shared/formats.mjs';
import { run, ffmpegPath, clamp, fileSize, require, CancelledError } from './util.mjs';

let infoPromise;
let hardwarePromise;

/** FFmpeg version + available encoders (cached). */
export function ffmpegInfo() {
  infoPromise ??= (async () => {
    const [{ stdout: version }, { stdout: encoders }] = await Promise.all([
      run(ffmpegPath, ['-hide_banner', '-version']),
      run(ffmpegPath, ['-hide_banner', '-encoders'])
    ]);
    const names = new Set([...encoders.matchAll(/^\s[VAS][\w.]{5}\s+(\S+)/gm)].map(match => match[1]));
    return { version: /ffmpeg version (\S+)/.exec(version)?.[1] || 'unknown', encoders: names };
  })();
  return infoPromise;
}

/** Finds a working hardware H.264/HEVC encoder by test-encoding one tiny frame. */
export function detectHardwareEncoder() {
  hardwarePromise ??= (async () => {
    const { encoders } = await ffmpegInfo();
    for (const [vendor, h264, hevc] of [['NVIDIA NVENC', 'h264_nvenc', 'hevc_nvenc'], ['Intel Quick Sync', 'h264_qsv', 'hevc_qsv'], ['AMD AMF', 'h264_amf', 'hevc_amf']]) {
      if (!encoders.has(h264)) continue;
      try {
        await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=320x240:d=0.1', '-frames:v', '1', '-c:v', h264, '-f', 'null', '-']);
        return { vendor, h264, hevc: encoders.has(hevc) ? hevc : null };
      } catch {
        // Not usable on this machine.
      }
    }
    return null;
  })();
  return hardwarePromise;
}

/** Reads duration/streams from ffmpeg's banner output. */
export async function probe(input, signal) {
  const { stderr } = await run(ffmpegPath, ['-hide_banner', '-i', input], { allowFail: true, signal });
  const durationMatch = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const duration = durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : 0;
  const streamLines = stderr.split(/\r?\n/).filter(line => /^\s*Stream #/.test(line));
  const videoLine = streamLines.find(line => / Video: /.test(line) && !/attached pic/.test(line));
  const audioLine = streamLines.find(line => / Audio: /.test(line));
  if (!videoLine && !audioLine) {
    throw new Error(/Invalid data|could not find codec|moov atom not found/i.test(stderr) ? 'The file is damaged or not a supported media file.' : 'No audio or video streams were found in this file.');
  }
  const size = videoLine && /, (\d{2,5})x(\d{2,5})/.exec(videoLine);
  const fps = videoLine && /(\d+(?:\.\d+)?) fps/.exec(videoLine);
  return {
    duration,
    hasVideo: Boolean(videoLine),
    hasAudio: Boolean(audioLine),
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    fps: fps ? Number(fps[1]) : 0,
    videoCodec: videoLine && /Video: (\w+)/.exec(videoLine)?.[1],
    audioCodec: audioLine && /Audio: (\w+)/.exec(audioLine)?.[1]
  };
}

/** "1:02.5" / "01:02:03" / "62.5" → seconds */
export function parseTime(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  const parts = String(value).trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) throw new Error(`Invalid time "${value}". Use seconds or hh:mm:ss.`);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

const CONTAINERS = {
  mp4: { f: 'mp4', v: ['h264', 'h265', 'av1'], a: 'aac', faststart: true },
  m4v: { f: 'mp4', v: ['h264', 'h265'], a: 'aac', faststart: true },
  f4v: { f: 'mp4', v: ['h264'], a: 'aac', faststart: true },
  mov: { f: 'mov', v: ['h264', 'h265', 'prores'], a: 'aac', faststart: true },
  mkv: { f: 'matroska', v: ['h264', 'h265', 'vp9', 'av1'], a: 'aac' },
  webm: { f: 'webm', v: ['vp9', 'av1', 'vp8'], a: 'opus' },
  avi: { f: 'avi', v: ['xvid', 'h264'], a: 'mp3' },
  divx: { f: 'avi', v: ['divx'], a: 'mp3' },
  flv: { f: 'flv', v: ['h264', 'flv1'], a: 'aac', ar: 44100 },
  wmv: { f: 'asf', v: ['wmv2'], a: 'wma' },
  asf: { f: 'asf', v: ['wmv2'], a: 'wma' },
  mpg: { f: 'vob', v: ['mpeg2'], a: 'mp2' },
  mpeg: { f: 'vob', v: ['mpeg2'], a: 'mp2' },
  vob: { f: 'vob', v: ['mpeg2'], a: 'ac3' },
  ts: { f: 'mpegts', v: ['h264', 'h265', 'mpeg2'], a: 'aac' },
  mts: { f: 'mpegts', m2ts: true, v: ['h264'], a: 'ac3' },
  m2ts: { f: 'mpegts', m2ts: true, v: ['h264'], a: 'ac3' },
  '3gp': { f: '3gp', v: ['h264'], a: 'aac', maxHeight: 720 },
  '3g2': { f: '3g2', v: ['h264'], a: 'aac', maxHeight: 720 },
  ogv: { f: 'ogg', v: ['theora'], a: 'vorbis' },
  mxf: { f: 'mxf', v: ['mpeg2'], a: 'pcm', ar: 48000, fps: 25 },
  swf: { f: 'swf', v: ['flv1'], a: 'mp3', ar: 44100 }
};

const AUDIO = {
  mp3: { c: 'libmp3lame', f: 'mp3', br: 192 },
  wav: { c: 'pcm_s16le', f: 'wav' },
  aac: { c: 'aac', f: 'adts', br: 192 },
  m4a: { c: 'aac', f: 'ipod', br: 192 },
  m4r: { c: 'aac', f: 'ipod', br: 192, maxDuration: 40 },
  m4b: { c: 'aac', f: 'ipod', br: 96 },
  alac: { c: 'alac', f: 'ipod' },
  flac: { c: 'flac', f: 'flac', extra: ['-compression_level', '5'] },
  ogg: { c: 'libvorbis', f: 'ogg', br: 192 },
  oga: { c: 'libvorbis', f: 'ogg', br: 192 },
  opus: { c: 'libopus', f: 'opus', br: 128 },
  wma: { c: 'wmav2', f: 'asf', br: 192 },
  aiff: { c: 'pcm_s16be', f: 'aiff' },
  ac3: { c: 'ac3', f: 'ac3', br: 384, maxBr: 640 },
  eac3: { c: 'eac3', f: 'eac3', br: 384 },
  dts: { c: 'dca', f: 'dts', extra: ['-strict', '-2', '-ar', '48000'] },
  amr: { c: 'libopencore_amrnb', f: 'amr', extra: ['-ar', '8000', '-ac', '1', '-b:a', '12.2k'] },
  awb: { c: 'libvo_amrwbenc', f: 'amr', extra: ['-ar', '16000', '-ac', '1', '-b:a', '23.85k'] },
  mp2: { c: 'mp2', f: 'mp2', br: 256 },
  au: { c: 'pcm_s16be', f: 'au' },
  caf: { c: 'alac', f: 'caf' },
  wv: { c: 'wavpack', f: 'wv' },
  tta: { c: 'tta', f: 'tta' },
  mka: { c: 'libopus', f: 'matroska', br: 160 },
  voc: { c: 'pcm_s16le', f: 'voc' },
  spx: { c: 'libspeex', f: 'ogg', extra: ['-ar', '32000'] }
};

const LOSSLESS_AUDIO = new Set(['wav', 'flac', 'alac', 'aiff', 'au', 'caf', 'wv', 'tta', 'voc']);

/** Quality 1..100 (higher = better) → encoder-specific constant-quality args. */
function videoEncoderArgs(codec, quality, speed, hardware) {
  const q = clamp(Number(quality) || 70, 1, 100);
  const crf264 = Math.round(36 - q * 0.2);
  const qscale = String(Math.round(2 + (100 - q) * 0.25));
  const x264Preset = { fast: 'veryfast', balanced: 'medium', quality: 'slow' }[speed] || 'medium';
  switch (codec) {
    case 'h264':
      if (hardware?.h264) return hwArgs(hardware.h264, crf264);
      return ['-c:v', 'libx264', '-preset', x264Preset, '-crf', String(crf264), '-pix_fmt', 'yuv420p'];
    case 'h265':
      if (hardware?.hevc) return [...hwArgs(hardware.hevc, crf264 + 2), '-tag:v', 'hvc1'];
      return ['-c:v', 'libx265', '-preset', x264Preset, '-crf', String(crf264 + 3), '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-x265-params', 'log-level=error'];
    case 'vp9':
      return ['-c:v', 'libvpx-vp9', '-crf', String(Math.round(50 - q * 0.3)), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', speed === 'quality' ? '2' : speed === 'fast' ? '5' : '4', '-pix_fmt', 'yuv420p'];
    case 'vp8':
      return ['-c:v', 'libvpx', '-crf', String(Math.round(40 - q * 0.3)), '-b:v', '8M', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p'];
    case 'av1':
      return ['-c:v', 'libaom-av1', '-crf', String(Math.round(50 - q * 0.28)), '-b:v', '0', '-cpu-used', speed === 'quality' ? '4' : '6', '-row-mt', '1', '-tiles', '2x2', '-pix_fmt', 'yuv420p'];
    case 'prores':
      return ['-c:v', 'prores_ks', '-profile:v', q > 80 ? '3' : '2', '-pix_fmt', 'yuv422p10le'];
    case 'xvid':
      return ['-c:v', 'libxvid', '-q:v', qscale, '-pix_fmt', 'yuv420p'];
    case 'divx':
      return ['-c:v', 'mpeg4', '-vtag', 'DIVX', '-q:v', qscale, '-pix_fmt', 'yuv420p'];
    case 'wmv2':
      return ['-c:v', 'wmv2', '-q:v', qscale, '-pix_fmt', 'yuv420p'];
    case 'mpeg2':
      return ['-c:v', 'mpeg2video', '-q:v', qscale, '-pix_fmt', 'yuv420p'];
    case 'flv1':
      return ['-c:v', 'flv', '-q:v', qscale, '-pix_fmt', 'yuv420p'];
    case 'theora':
      return ['-c:v', 'libtheora', '-q:v', String(Math.round(q / 10)), '-pix_fmt', 'yuv420p'];
    default:
      throw new Error(`Unsupported video codec ${codec}.`);
  }
}

function hwArgs(encoder, cq) {
  if (encoder.endsWith('nvenc')) return ['-c:v', encoder, '-preset', 'p5', '-rc', 'vbr', '-cq', String(cq + 2), '-b:v', '0', '-pix_fmt', 'yuv420p'];
  if (encoder.endsWith('qsv')) return ['-c:v', encoder, '-global_quality', String(cq + 2), '-pix_fmt', 'nv12'];
  return ['-c:v', encoder, '-rc', 'cqp', '-qp_i', String(cq), '-qp_p', String(cq + 2), '-pix_fmt', 'yuv420p'];
}

function audioEncoderArgs(kind, options, forVideo = false) {
  const spec = kind === 'pcm' ? { c: 'pcm_s16le' } : kind === 'wma' ? { c: 'wmav2', br: 160 } : kind === 'vorbis' ? { c: 'libvorbis', br: 160 } : kind === 'opus' ? { c: 'libopus', br: 128 } : AUDIO[kind];
  if (!spec) throw new Error(`Unsupported audio format ${kind}.`);
  const args = ['-c:a', spec.c];
  if (spec.br) {
    let bitrate = options.audioBitrate && options.audioBitrate !== 'auto' ? Number(options.audioBitrate) : forVideo ? Math.min(spec.br, 160) : spec.br;
    if (spec.maxBr) bitrate = Math.min(bitrate, spec.maxBr);
    if (spec.c === 'libopus') bitrate = Math.min(bitrate, 256);
    args.push('-b:a', `${bitrate}k`);
  }
  if (options.bitDepth === '24' && spec.c.startsWith('pcm_s16')) args[1] = spec.c.replace('16', '24');
  if (spec.extra) args.push(...spec.extra);
  if (options.sampleRate && options.sampleRate !== 'keep' && !spec.extra?.includes('-ar')) args.push('-ar', String(options.sampleRate));
  if (options.channels && options.channels !== 'keep' && !spec.extra?.includes('-ac')) args.push('-ac', String(options.channels));
  return args;
}

function atempoChain(speed) {
  const filters = [];
  let remaining = speed;
  while (remaining > 2) { filters.push('atempo=2'); remaining /= 2; }
  while (remaining < 0.5) { filters.push('atempo=0.5'); remaining /= 0.5; }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters;
}

function scaleFilter(options) {
  if (options.resolution && options.resolution !== 'keep') {
    if (options.resolution === 'custom') {
      const width = Number(options.width) || 0;
      const height = Number(options.height) || 0;
      if (width && height) return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=ceil(${width}/2)*2:ceil(${height}/2)*2:(ow-iw)/2:(oh-ih)/2`;
      if (width) return `scale=${width}:-2`;
      if (height) return `scale=-2:${height}`;
      return null;
    }
    const short = Number(options.resolution);
    // Resolution presets refer to the short side so portrait videos work; never upscale.
    return `scale='if(gte(iw,ih),-2,min(${short},iw))':'if(gte(iw,ih),min(${short},ih),-2)'`;
  }
  return null;
}

/** Builds video and audio filter chains shared by all media outputs. */
function buildFilters(options, effectiveDuration, { evenDimensions = true } = {}) {
  const video = [];
  const audio = [];
  if (options.crop && options.crop !== 'none') {
    const [w, h] = options.crop.split(':').map(Number);
    const ratio = (w / h).toFixed(6);
    video.push(`crop='trunc(min(iw,ih*${ratio})/2)*2':'trunc(min(ih,iw/${ratio})/2)*2'`);
  }
  if (options.rotate === '90') video.push('transpose=1');
  if (options.rotate === '270') video.push('transpose=2');
  if (options.rotate === '180') video.push('hflip', 'vflip');
  if (options.flipH) video.push('hflip');
  if (options.flipV) video.push('vflip');
  const scale = scaleFilter(options);
  if (scale) video.push(scale);
  const speed = Number(options.speed) || 1;
  if (speed !== 1) {
    video.push(`setpts=PTS/${speed}`);
    audio.push(...atempoChain(speed));
  }
  if (options.fps && options.fps !== 'keep') video.push(`fps=${Number(options.fps)}`);
  if (evenDimensions) video.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');

  const volume = Number(options.volume ?? 100);
  if (volume !== 100) audio.push(`volume=${(volume / 100).toFixed(3)}`);
  if (options.normalize) audio.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  const fadeIn = Number(options.fadeIn) || 0;
  const fadeOut = Number(options.fadeOut) || 0;
  if (fadeIn > 0) audio.push(`afade=t=in:st=0:d=${fadeIn}`);
  if (fadeOut > 0 && effectiveDuration > fadeOut) audio.push(`afade=t=out:st=${(effectiveDuration - fadeOut).toFixed(3)}:d=${fadeOut}`);
  return { video, audio };
}

/** Runs ffmpeg with `-progress` parsing; reports fraction of `duration`. */
async function ffmpeg(args, { signal, duration, onProgress, from = 0, to = 1 }) {
  let buffer = '';
  return run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-y', ...args], {
    signal,
    onStdout: chunk => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const match = /^out_time_us=(\d+)/.exec(line);
        if (match && duration > 0) onProgress?.(from + (to - from) * clamp(Number(match[1]) / 1e6 / duration, 0, 1));
      }
    }
  });
}

function trimInputArgs(options, mediaInfo) {
  const start = parseTime(options.trimStart) || 0;
  const endValue = parseTime(options.trimEnd);
  const end = endValue && endValue > 0 ? Math.min(endValue, mediaInfo.duration || endValue) : mediaInfo.duration;
  if (start && mediaInfo.duration && start >= mediaInfo.duration) throw new Error('Trim start is after the end of the file.');
  if (end && end <= start) throw new Error('Trim end must be after trim start.');
  const args = [];
  if (start > 0) args.push('-ss', start.toFixed(3));
  if (endValue && end) args.push('-t', (end - start).toFixed(3));
  return { args, length: end ? end - start : 0 };
}

/** Animated WebP cannot be decoded by FFmpeg; convert it to GIF with sharp first. */
async function prepareInput(ctx) {
  if (path.extname(ctx.input).toLowerCase() !== '.webp') return ctx.input;
  const sharp = require('sharp');
  const temp = path.join(await ctx.tempDir(), 'input.gif');
  await sharp(ctx.input, { animated: true }).gif().toFile(temp);
  return temp;
}

export async function convertMedia(ctx) {
  const { target, options, settings, signal } = ctx;
  const output = OUTPUTS[target];
  const input = await prepareInput(ctx);
  const info = await probe(input, signal);
  const trim = trimInputArgs(options, info);
  const speed = Number(options.speed) || 1;
  const duration = (trim.length || info.duration) / speed;
  const metadata = settings.keepMetadata === false ? ['-map_metadata', '-1'] : ['-map_metadata', '0'];

  if (output.kind === 'audio') {
    if (!info.hasAudio) throw new Error('This file has no audio track.');
    const spec = AUDIO[target];
    const filters = buildFilters(options, duration, { evenDimensions: false }).audio;
    const limit = spec.maxDuration && duration > spec.maxDuration ? ['-t', String(spec.maxDuration)] : [];
    const out = await ctx.output(`${ctx.stem}.${output.ext}`);
    await ffmpeg([...trim.args, '-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn', ...metadata,
      ...(filters.length ? ['-af', filters.join(',')] : []), ...audioEncoderArgs(target, options), ...limit, '-f', spec.f, out],
    { signal, duration: limit.length ? spec.maxDuration : duration, onProgress: ctx.progress });
    if (LOSSLESS_AUDIO.has(target) && options.audioBitrate && options.audioBitrate !== 'auto') ctx.note('Lossless formats ignore the bitrate setting.');
    return;
  }

  if (!info.hasVideo) throw new Error('This file has no video stream.');

  if (output.kind === 'frames') {
    const interval = Math.max(0.04, Number(options.frameInterval) || 1);
    const { video } = buildFilters({ ...options, speed: 1 }, duration, { evenDimensions: false });
    const folder = await ctx.outputFolder(`${ctx.stem} frames`);
    await ffmpeg([...trim.args, '-i', input, '-map', '0:v:0', '-vf', [...video, `fps=1/${interval}`].join(','),
      ...(output.ext === 'jpg' ? ['-q:v', '2'] : []), path.join(folder, `${ctx.stem}_%04d.${output.ext}`)],
    { signal, duration, onProgress: ctx.progress });
    return;
  }

  if (output.kind === 'animation') {
    const { video } = buildFilters(options, duration, { evenDimensions: false });
    const fps = clamp(Number(options.gifFps) || 12, 1, 50);
    const width = options.gifWidth && options.gifWidth !== 'keep' ? Number(options.gifWidth) : 0;
    const sizing = width ? `,scale='min(${width},iw)':-1:flags=lanczos` : '';
    const out = await ctx.output(`${ctx.stem}.${output.ext}`);
    const chain = [...video, `fps=${fps}${sizing}`].join(',');
    if (target === 'gif-anim') {
      await ffmpeg([...trim.args, '-i', input, '-map', '0:v:0', '-an', '-vf',
        `${chain},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
        '-loop', options.loop === false ? '-1' : '0', '-f', 'gif', out], { signal, duration, onProgress: ctx.progress });
    } else if (target === 'webp-anim') {
      await ffmpeg([...trim.args, '-i', input, '-map', '0:v:0', '-an', '-vf', chain, '-c:v', 'libwebp_anim',
        '-q:v', String(clamp(Number(options.quality) || 75, 1, 100)), '-compression_level', '4', '-loop', '0', '-f', 'webp', out],
      { signal, duration, onProgress: ctx.progress });
    } else {
      await ffmpeg([...trim.args, '-i', input, '-map', '0:v:0', '-an', '-vf', chain, '-c:v', 'apng', '-plays', '0', '-f', 'apng', out],
        { signal, duration, onProgress: ctx.progress });
    }
    return;
  }

  // Regular video container output.
  const container = CONTAINERS[target];
  if (!container) throw new Error(`Cannot write ${output.label} video.`);
  const copy = options.vcodec === 'copy';
  const codec = !copy && options.vcodec && options.vcodec !== 'auto' && container.v.includes(options.vcodec) ? options.vcodec : container.v[0];
  const filters = buildFilters({ ...options, resolution: container.maxHeight && (!options.resolution || options.resolution === 'keep') && info.height > container.maxHeight ? String(container.maxHeight) : options.resolution }, duration);
  if (copy && (filters.video.length > 1 || filters.audio.length)) throw new Error('Fast trim (stream copy) cannot be combined with edits. Switch to accurate mode.');
  const audioKind = container.a;
  const keepAudio = info.hasAudio && !options.mute;
  const out = await ctx.output(`${ctx.stem}.${output.ext}`);
  const muxer = ['-f', container.f];
  if (container.faststart) muxer.unshift('-movflags', '+faststart');
  if (container.m2ts) muxer.unshift('-mpegts_m2ts_mode', '1');

  const hardware = settings.hwAccel && ['h264', 'h265'].includes(codec) && !options.targetSizeMB && !options.compressPercent ? await detectHardwareEncoder() : null;
  const audioArgs = keepAudio
    ? [...(filters.audio.length ? ['-af', filters.audio.join(',')] : []), ...(copy ? ['-c:a', 'copy'] : audioEncoderArgs(audioKind, options, true)), ...(container.ar && !copy ? ['-ar', String(container.ar)] : [])]
    : ['-an'];
  const mapping = ['-map', '0:v:0', ...(keepAudio ? ['-map', '0:a:0'] : []), '-sn', '-dn'];
  const videoFilter = copy ? [] : ['-vf', filters.video.join(',')];
  const rate = container.fps ? ['-r', String(container.fps)] : [];

  const targetMB = Number(options.targetSizeMB) || (Number(options.compressPercent) ? fileSize(ctx.input) / 1048576 * Number(options.compressPercent) / 100 : 0);
  if (targetMB > 0 && !copy) {
    const audioKbps = keepAudio ? (targetMB * 8192 / duration < 400 ? 64 : 128) : 0;
    const videoKbps = Math.max(80, Math.floor(targetMB * 8192 * 0.96 / duration - audioKbps));
    const compressedAudio = keepAudio ? [...(filters.audio.length ? ['-af', filters.audio.join(',')] : []), ...audioEncoderArgs(audioKind, { ...options, audioBitrate: String(audioKbps) }, true)] : ['-an'];
    if (codec === 'h264') {
      const temp = await ctx.tempDir();
      const log = path.join(temp, 'pass');
      const base = ['-c:v', 'libx264', '-preset', settings.encodeSpeed === 'fast' ? 'veryfast' : 'medium', '-b:v', `${videoKbps}k`, '-pix_fmt', 'yuv420p', '-passlogfile', log];
      await ffmpeg([...trim.args, '-i', input, '-map', '0:v:0', ...videoFilter, ...rate, ...base, '-pass', '1', '-an', '-f', 'null', 'NUL'], { signal, duration, onProgress: ctx.progress, to: 0.45 });
      await ffmpeg([...trim.args, '-i', input, ...mapping, ...metadata, ...videoFilter, ...rate, ...base, '-pass', '2', ...compressedAudio, ...muxer, out], { signal, duration, onProgress: ctx.progress, from: 0.45 });
    } else {
      const encoder = videoEncoderArgs(codec, options.quality, settings.encodeSpeed, null).filter((arg, index, all) => !['-crf', '-q:v', '-b:v'].includes(arg) && !['-crf', '-q:v', '-b:v'].includes(all[index - 1]));
      await ffmpeg([...trim.args, '-i', input, ...mapping, ...metadata, ...videoFilter, ...rate, ...encoder, '-b:v', `${videoKbps}k`, '-maxrate', `${Math.round(videoKbps * 1.5)}k`, '-bufsize', `${videoKbps * 2}k`, ...compressedAudio, ...muxer, out], { signal, duration, onProgress: ctx.progress });
    }
    return;
  }

  const encode = hw => [...trim.args, '-i', input, ...mapping, ...metadata, ...videoFilter, ...rate,
    ...(copy ? ['-c:v', 'copy'] : videoEncoderArgs(codec, options.quality, settings.encodeSpeed, hw)), ...audioArgs, ...muxer, out];
  try {
    await ffmpeg(encode(hardware), { signal, duration, onProgress: ctx.progress });
  } catch (error) {
    if (!hardware || error instanceof CancelledError) throw error;
    ctx.note(`${hardware.vendor} encoding failed; used the CPU encoder instead.`);
    await ffmpeg(encode(null), { signal, duration, onProgress: ctx.progress });
  }
}

/** Joins several videos (or audio files) into one, normalising size/rate so any mix works. */
export async function mergeMedia(ctx) {
  const { inputs, options, signal } = ctx;
  if (inputs.length < 2) throw new Error('Add at least two files to merge.');
  const infos = [];
  for (const input of inputs) infos.push(await probe(input, signal));
  const audioOnly = ctx.mode === 'audio';
  const total = infos.reduce((sum, item) => sum + item.duration, 0);
  const args = [];
  inputs.forEach(input => args.push('-i', input));
  const parts = [];
  const graph = [];
  if (audioOnly) {
    infos.forEach((info, index) => {
      if (!info.hasAudio) throw new Error(`${path.basename(inputs[index])} has no audio.`);
      graph.push(`[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]`);
      parts.push(`[a${index}]`);
    });
    graph.push(`${parts.join('')}concat=n=${inputs.length}:v=0:a=1[a]`);
    const target = options.format || 'mp3';
    const out = await ctx.output(`${ctx.stem} merged.${OUTPUTS[target].ext}`);
    await ffmpeg([...args, '-filter_complex', graph.join(';'), '-map', '[a]', ...audioEncoderArgs(target, options), '-f', AUDIO[target].f, out], { signal, duration: total, onProgress: ctx.progress });
    return;
  }
  const first = infos.find(info => info.hasVideo);
  if (!first) throw new Error('None of the files contain video.');
  const portrait = first.height > first.width;
  const preset = { '1080': [1920, 1080], '720': [1280, 720], '480': [854, 480] }[options.resolution];
  let [width, height] = preset ? (portrait ? [preset[1], preset[0]] : preset) : [first.width, first.height];
  width -= width % 2; height -= height % 2;
  const fps = Number(options.fps) || Math.round(first.fps) || 30;
  infos.forEach((info, index) => {
    if (!info.hasVideo) throw new Error(`${path.basename(inputs[index])} has no video.`);
    graph.push(`[${index}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${index}]`);
    graph.push(info.hasAudio
      ? `[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${info.duration.toFixed(3)}[a${index}]`);
    parts.push(`[v${index}][a${index}]`);
  });
  graph.push(`${parts.join('')}concat=n=${inputs.length}:v=1:a=1[v][a]`);
  const out = await ctx.output(`${ctx.stem} merged.mp4`);
  await ffmpeg([...args, '-filter_complex', graph.join(';'), '-map', '[v]', '-map', '[a]',
    ...videoEncoderArgs('h264', options.quality, ctx.settings.encodeSpeed, null), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-f', 'mp4', out],
  { signal, duration: total, onProgress: ctx.progress });
}

/** Renders a still image sequence (e.g. images → GIF/MP4). */
export async function imagesToAnimation(ctx) {
  const { inputs, options, signal } = ctx;
  if (!inputs.length) throw new Error('Add images first.');
  const { openImage } = await import('./image.mjs');
  const temp = await ctx.tempDir();
  const firstMeta = await (await openImage(inputs[0], ctx)).metadata();
  const maxWidth = options.width && options.width !== 'keep' ? Number(options.width) : Math.min(firstMeta.width || 800, 1280);
  const width = Math.max(2, maxWidth - (maxWidth % 2));
  const height = Math.max(2, Math.round((firstMeta.height || width) * width / (firstMeta.width || width) / 2) * 2);
  for (let index = 0; index < inputs.length; index += 1) {
    await (await openImage(inputs[index], ctx)).autoOrient().resize(width, height, { fit: 'contain', background: options.background || '#ffffff' }).flatten({ background: options.background || '#ffffff' }).png().toFile(path.join(temp, `f${String(index).padStart(5, '0')}.png`));
    ctx.progress(index / inputs.length * 0.5);
  }
  const delay = clamp(Number(options.frameDelay) || 0.5, 0.02, 10);
  const format = options.format || 'gif';
  const out = await ctx.output(`${ctx.stem}.${format}`);
  const sequence = ['-framerate', String(1 / delay), '-i', path.join(temp, 'f%05d.png')];
  const duration = inputs.length * delay;
  if (format === 'gif') {
    await ffmpeg([...sequence, '-vf', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-loop', '0', out], { signal, duration, onProgress: ctx.progress, from: 0.5 });
  } else {
    await ffmpeg([...sequence, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', out], { signal, duration, onProgress: ctx.progress, from: 0.5 });
  }
}

/** Decodes any FFmpeg-readable still image to PNG (used for BMP/TGA/PSD/DDS/… inputs). */
export async function decodeImageWithFfmpeg(input, outputPng, signal) {
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-frames:v', '1', '-update', '1', outputPng], { signal });
}

/** Encodes a PNG into an FFmpeg-only image format (TGA, PCX, JP2, QOI, …). */
export async function encodeImageWithFfmpeg(inputPng, output, ext, signal) {
  const codec = { jp2: ['-c:v', 'libopenjpeg', '-compression_level', '6'], tga: ['-c:v', 'targa'], ras: ['-c:v', 'sunrast'], sgi: ['-c:v', 'sgi'], xwd: ['-c:v', 'xwd'], xbm: ['-c:v', 'xbm', '-pix_fmt', 'monob'], pbm: ['-c:v', 'pbm'], pgm: ['-c:v', 'pgm'], ppm: ['-c:v', 'ppm'], pcx: ['-c:v', 'pcx'], qoi: ['-c:v', 'qoi'], hdr: ['-c:v', 'hdr'], exr: ['-c:v', 'exr'] }[ext] || [];
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPng, '-frames:v', '1', '-update', '1', ...codec, '-f', 'image2', output], { signal });
}
