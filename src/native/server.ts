import { createServer, type Server, type ServerResponse } from 'node:http';
import { platform } from 'node:os';

const users = [{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com' }];

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

export function createNativeServer(): Server {
  return createServer((request, response) => {
    const path = request.url?.split('?', 1)[0];
    if (request.method === 'GET') {
      switch (path) {
        case '/':
          sendJson(response, 200, { message: 'obs-e-com API' });
          return;
        case '/api/users':
          sendJson(response, 200, users);
          return;
        case '/api/health':
          sendJson(response, 200, {
            status: 'ok', uptime: process.uptime(), platform: platform(),
            timestamp: new Date().toISOString(),
          });
          return;
      }
    }
    sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
}
