// Development: Vite dev server with hot reload + Electron pointed at it.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
const electron = spawn(require('electron'), ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
electron.on('close', async code => {
  await server.close();
  process.exit(code ?? 0);
});
