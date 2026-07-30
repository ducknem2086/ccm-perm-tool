import express from 'express';
import { validateConfig, buildRequests } from './request-builder.js';
import { createRun, startRun, getRun, cancelRun, subscribe, summarize } from './runner.js';
import { parseImport, parseGrid } from './file-import.js';
import { writeResultsToStream, exportFilename } from './excel-export.js';
import { DEFAULT_ERROR_CODE_PATHS } from './error-code.js';

export function registerRoutes(app) {
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.post('/api/run', express.json({ limit: '5mb' }), (req, res) => {
    const config = req.body ?? {};
    const errors = validateConfig(config);
    if (errors.length > 0) return res.status(400).json({ errors });

    const requests = buildRequests(config);
    const run = createRun(requests, {
      workerCount: config.advanced?.workerCount ?? config.advanced?.concurrency ?? 4,
      timeoutMs: config.advanced?.timeoutMs ?? 30000,
      errorCodePaths: config.advanced?.errorCodePaths?.length
        ? config.advanced.errorCodePaths
        : DEFAULT_ERROR_CODE_PATHS,
      permissionFile: config.permissionFile ?? null,
      permissionMapping: config.permissionMapping ?? null,
    });

    startRun(run).catch((err) => console.error('startRun that bai:', err));
    res.status(201).json({ runId: run.runId, total: run.total });
  });

  app.get('/api/run/:runId/stream', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Không tìm thấy run' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Phat lai nhung gi da chay xong truoc khi client kip ket noi.
    for (const record of run.results) send('result', record);
    send('progress', { done: run.results.length, total: run.total });

    if (run.status === 'done' || run.status === 'cancelled') {
      send('done', summarize(run));
      return res.end();
    }

    const unsubscribe = subscribe(run.runId, (event, data) => {
      send(event, data);
      if (event === 'done') { unsubscribe(); res.end(); }
    });

    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(keepAlive); unsubscribe(); });
    res.on('close', () => clearInterval(keepAlive));
  });

  app.get('/api/run/:runId', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Không tìm thấy run' });
    res.json({ summary: summarize(run), results: run.results });
  });

  app.post('/api/run/:runId/cancel', (req, res) => {
    if (!cancelRun(req.params.runId)) {
      return res.status(404).json({ error: 'Không tìm thấy run' });
    }
    res.json({ ok: true });
  });

  app.post('/api/import',
    express.raw({ type: '*/*', limit: '20mb' }),
    async (req, res) => {
      try {
        const result = await parseImport({
          filename: req.get('X-Filename') || 'unknown.txt',
          buffer: req.body,
          kind: req.get('X-Kind') || 'msisdn',
          dedupe: req.get('X-Dedupe') !== 'false',
        });
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

  app.post('/api/import/grid',
    express.raw({ type: '*/*', limit: '20mb' }),
    async (req, res) => {
      try {
        const rawSheetsHeader = req.get('X-Sheets');
        const targetSheets = rawSheetsHeader
          ? rawSheetsHeader.split(',').map((s) => decodeURIComponent(s.trim())).filter(Boolean)
          : undefined;

        const grid = await parseGrid({
          filename: req.get('X-Filename') || 'unknown.txt',
          buffer: req.body,
          targetSheets,
        });
        res.json(grid);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });


  app.post('/api/export/:runId', express.json({ limit: '5mb' }), async (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Không tìm thấy run' });

    const { indexes, includeToken = false } = req.body ?? {};
    const keep = Array.isArray(indexes) && indexes.length > 0 ? new Set(indexes) : null;
    const records = run.results
      .filter((r) => (keep ? keep.has(r.index) : true))
      .sort((a, b) => a.index - b.index);

    const filename = exportFilename();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    try {
      const hasPermission = Boolean(run.options?.permissionFile?.filename);
      await writeResultsToStream(res, records, { includeToken: Boolean(includeToken), hasPermission });
    } catch (err) {
      console.error('Export that bai:', err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.end();
    }
  });
}
