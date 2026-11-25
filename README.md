# MeowConvert

Private, offline file converter for Windows. Drop any file, pick a format, done — nothing is uploaded.

Made with <3 by [AminMGM](https://github.com/AminMGM)

## What it does

**Converter (home):** drop files or whole folders anywhere in the window. Files are grouped by type, each gets a sensible default format, and you can set "All to …" per group. Optional advanced settings per type (codec, quality, resolution, bitrate, resize, page size, …).

| Type | Reads | Writes |
|---|---|---|
| Video | MP4, MKV, AVI, MOV, WEBM, FLV, WMV, MPEG, TS/MTS/M2TS, VOB, 3GP/3G2, OGV, MXF, DIVX, RM, … | MP4, MKV, WEBM, MOV, AVI, WMV, FLV, M4V, MPG, 3GP, 3G2, OGV, TS, MTS, M2TS, VOB, ASF, DIVX, F4V, MXF, SWF, GIF, animated WEBP, APNG, JPG/PNG frames, any audio format |
| Audio | MP3, WAV, AAC, FLAC, OGG, OPUS, M4A, WMA, AIFF, AC3, AMR, DTS, APE, … | MP3, WAV, AAC, M4A, FLAC, ALAC, OGG, OPUS, WMA, AIFF, M4R, M4B, AC3, E-AC3, DTS, AMR, AWB, MP2, AU, CAF, WV, TTA, MKA, VOC, SPX |
| Image | JPG, PNG, WEBP, AVIF, GIF, TIFF, SVG, HEIC/HEIF, BMP, ICO, TGA, PSD, DDS, EXR, HDR, QOI, JP2, … | JPG, PNG, WEBP, AVIF, GIF, TIFF, BMP, ICO, PDF, SVG (traced), TGA, JP2, PPM/PGM/PBM, PCX, QOI, SGI, RAS, XBM, XWD, HDR, EXR |
| Document | DOCX, PDF, HTML, Markdown, TXT, RTF | PDF, DOCX, HTML, TXT, Markdown, EPUB, PDF→JPG/PNG/WEBP pages |
| eBook | EPUB | PDF, DOCX, HTML, TXT, Markdown |
| Spreadsheet | XLSX, XLS, XLSB, XLSM, ODS, FODS, CSV, TSV, Numbers, JSON | XLSX, XLS, XLSB, ODS, FODS, CSV, TSV, JSON, XML, HTML, TXT, Markdown, PDF |
| Archive | ZIP, 7Z, TAR, GZ, BZ2, XZ, ZST, RAR, ISO, CAB, LZH, CPIO, XAR | ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, TAR.ZST |
| Font | TTF, OTF, WOFF, WOFF2, EOT | TTF, WOFF, WOFF2, EOT, SVG font |
| 3D | OBJ(+MTL), STL, PLY, GLB, GLTF, FBX, DAE, 3DS, 3MF, AMF, VTK, PCD, WRL, USDZ/USDA, LWO | GLB, GLTF, OBJ, STL, PLY, USDZ |

**Optional free add-ons, detected automatically** (too large to bundle): LibreOffice adds DOC/ODT/RTF/WPS output and PowerPoint/ODP files; Calibre adds MOBI, AZW3 and FB2. Settings → Engines shows what's installed.

**Tools:** Video Compressor (by %, target size, or quality), Video Trimmer (live preview), Video to GIF/WEBP/APNG, Crop (16:9, 9:16, 1:1, …), Rotate & Flip, Resize, Speed, Mute, Extract Audio, Merge Videos, Video to Images · Audio Cutter, Audio Compressor, Volume Booster/Normalize, Speed Changer, Audio Joiner, Ringtone Maker · Image Compressor (quality or max KB), Resizer, Crop (smart focus), Rotate & Flip, Image to SVG, ICO/Favicon Maker, GIF & Slideshow Maker · Merge/Split/Compress/Rotate PDF, Extract or Delete Pages, Watermark, Page Numbers, Images to PDF, PDF to Images · Create Archive (AES-256 password), Extract Archive · Unit Converter.

**Settings:** Glass / Dark / Light themes, accent colour, glass tint, Windows acrylic/mica backdrop, reduce motion; output location (next to originals / fixed folder / ask), filename suffix, overwrite or keep both, keep metadata, open folder and notify when done; parallel jobs, GPU encoding (NVENC / Quick Sync / AMF with automatic CPU fallback), encoding speed; engine status; updates.

## Development

Requires Node.js 20+.

```powershell
npm install
npm run dev            # Vite dev server + Electron with hot reload
npm start              # production build + Electron
npm run test:engines   # generates samples and runs ~350 conversions through the real engines
npm run icon           # rebuilds build/icon.* from Assets/MeowConvert Logo.svg
```

Layout: `electron/` main process (window, IPC, updater) and `electron/engines/` (FFmpeg, sharp, pdf-lib, documents, spreadsheets, archives, fonts); `src/` the UI (Vite, vanilla JS) with in-window engines for 3D (three.js) and PDF rendering (pdf.js); `shared/formats.mjs` is the single format catalog used by both.

## Releases and updates

Updates come from GitHub releases of `AminMGM/MeowConvert`. The NSIS installer ships a `.blockmap`, so installed copies download **only the changed blocks**, not the whole installer.

1. Bump `version` in `package.json`.
2. Set `GH_TOKEN` (a token allowed to publish releases to the repo).
3. Optional: code signing via `CSC_LINK` / `CSC_KEY_PASSWORD` (never commit certificates).
4. `npm run dist:publish` — uploads `MeowConvert-Setup-x.y.z.exe`, its `.blockmap` and `latest.yml`. Keep the previous release published: the differential download compares against it.

`npm run dist` builds the installer locally into `release/`.
