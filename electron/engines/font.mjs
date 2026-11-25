import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, unpacked } from './util.mjs';
import { OUTPUTS } from '../../shared/formats.mjs';

const worker = unpacked(path.join(path.dirname(fileURLToPath(import.meta.url)), 'font-worker.cjs'));

export async function convertFont(ctx, ext) {
  const out = await ctx.output(`${ctx.stem}.${OUTPUTS[ctx.target].ext}`);
  const type = ctx.target === 'svg-font' ? 'svg' : ctx.target;
  ctx.progress(0.2);
  // process.execPath is Electron in the app; ELECTRON_RUN_AS_NODE makes it behave like plain Node.
  await run(process.execPath, [worker, ctx.input, ext, type, out], { signal: ctx.signal, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
    .catch(error => {
      throw new Error(`Could not convert this font: ${/error: (.*)/.exec(error.stderr || '')?.[1] || error.message}`);
    });
}
