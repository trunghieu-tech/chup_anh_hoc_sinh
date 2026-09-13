'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const root = __dirname;
const port = Number(process.env.STUDENT_PHOTO_PORT || 4173);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.code === 'ENOENT' ? 'Không tìm thấy trang.' : 'Lỗi máy chủ.');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(data);
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`Cổng ${port} đang được sử dụng. Hãy đóng cửa sổ web cũ rồi thử lại.`);
  else console.error(error);
  process.exitCode = 1;
});

server.listen(port, '0.0.0.0', () => {
  const localUrl = `http://localhost:${port}`;
  console.log(`\nWeb chụp ảnh học sinh đang chạy tại: ${localUrl}`);
  const addresses = Object.values(os.networkInterfaces()).flat().filter((item) => item?.family === 'IPv4' && !item.internal);
  for (const address of addresses) console.log(`Điện thoại cùng Wi-Fi: http://${address.address}:${port}`);
  console.log('\nNhấn Ctrl+C để dừng web.');

  if (process.platform === 'win32' && !process.argv.includes('--no-open')) {
    const child = spawn('cmd.exe', ['/c', 'start', '', localUrl], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  }
});
