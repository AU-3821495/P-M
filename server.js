// server.js
// Render 無料プラン対応 Web プロキシ
// 動的・静的・動画・iFrame・教育・ストリーミング対応

import express from 'express';
import http from 'http';
import { createProxyServer } from 'http-proxy';
import morgan from 'morgan';
import path from 'path';
import url from 'url';

const app = express();
const server = http.createServer(app);
const proxy = createProxyServer({
  changeOrigin: true,
  preserveHeaderKeyCase: true,
  followRedirects: true,
  selfHandleResponse: false, // ストリーミングを透過
});

const ORIGIN = process.env.ORIGIN || 'https://your-app.onrender.com';
const PORT = process.env.PORT || 10000;

// ログ出力
app.use(morgan('tiny'));

// 静的ファイル配信
app.use('/assets', express.static(path.join(process.cwd(), 'public')));

// ヘルスチェック
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// プロキシエンドポイント
app.use('/proxy', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'URLが指定されていません' });

  proxy.once('proxyRes', (proxyRes) => {
    // iframe埋め込みやCORS対応のためヘッダー調整
    delete proxyRes.headers['x-frame-options'];
    proxyRes.headers['access-control-allow-origin'] = ORIGIN;
    proxyRes.headers['access-control-allow-credentials'] = 'true';
  });

  proxy.web(req, res, { target, changeOrigin: true }, (err) => {
    res.status(500).json({ error: 'プロキシエラー', detail: err.message });
  });
});

// iframeラッパー
app.get('/frame', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('URLが指定されていません');
  res.send(`<!doctype html>
<html><body style="margin:0;height:100%;width:100%;">
<iframe src="/proxy?url=${encodeURIComponent(target)}"
 style="width:100%;height:100%;border:none;"
 allow="autoplay; fullscreen; picture-in-picture"
 sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe>
</body></html>`);
});

// WebSocket対応
server.on('upgrade', (req, socket, head) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/proxy') return socket.destroy();

  const target = parsed.query.url;
  if (!target) return socket.destroy();

  proxy.ws(req, socket, head, {
    target,
    changeOrigin: true,
  });
});

server.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
});
