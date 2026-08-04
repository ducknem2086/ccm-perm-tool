import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerRoutes } from './src/server/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 9000 trung voi origin cua app CCOS that (http://localhost:9000). API dich
// kiem tra Origin/Referer nen chay cung port giup request khop hoan toan.
export const PORT = 9000;
export const PUBLIC_DIR = join(__dirname, 'public');

export function createApp() {
  const app = express();
  registerRoutes(app);
  app.use(express.static(PUBLIC_DIR));
  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  createApp().listen(PORT, () => {
    console.log(`CCM Tool dang chay tai http://localhost:${PORT}`);
  });
}
