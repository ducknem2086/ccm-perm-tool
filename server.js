import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerRoutes } from './src/server/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PORT = 2345;
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
