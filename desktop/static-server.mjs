import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

export async function startStaticServer({ root }) {
  const canonicalRoot = await fs.realpath(root);
  const server = http.createServer((request, response) => void serve(request, response, canonicalRoot));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Desktop web server did not bind to loopback.');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

async function serve(request, response, root) {
  try {
    if (!['GET', 'HEAD'].includes(request.method || '')) return send(response, 405, 'Method not allowed');
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const requested = relative.endsWith('/') ? path.join(relative, 'index.html') : relative;
    const candidate = path.resolve(root, requested);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return send(response, 404, 'Not found');
    const canonicalCandidate = await fs.realpath(candidate);
    if (canonicalCandidate !== root && !canonicalCandidate.startsWith(`${root}${path.sep}`)) return send(response, 404, 'Not found');
    const body = await fs.readFile(canonicalCandidate);
    response.writeHead(200, securityHeaders(MIME_TYPES[path.extname(canonicalCandidate).toLowerCase()] || 'application/octet-stream'));
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const missing = error.code === 'ENOENT' || error.code === 'EISDIR';
    send(response, missing ? 404 : 500, missing ? 'Not found' : 'Desktop content unavailable');
  }
}

function send(response, status, message) {
  response.writeHead(status, securityHeaders('text/plain; charset=utf-8'));
  response.end(message);
}

function securityHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff'
  };
}
