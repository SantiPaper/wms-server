import { IncomingMessage, Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { verifyAccessToken } from '@/modules/auth/token.util';

const WS_PATH = '/ws';
const HEARTBEAT_INTERVAL_MS = 20_000;

interface HeartbeatWebSocket extends WebSocket {
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;
const clients = new Set<HeartbeatWebSocket>();

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function isOriginAllowed(origin: string | undefined): boolean {
  // Sin Origin (clientes no-browser, algunos webviews nativos) — se deja pasar, el gate real es
  // el JWT de la cookie. Con Origin presente, debe estar en la misma lista que ya usa CORS.
  if (!origin) return true;
  return env.CORS_ORIGIN.includes(origin);
}

function authenticate(req: IncomingMessage): boolean {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['access_token'];
  if (!token) return false;
  try {
    verifyAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

export function initRealtime(server: HttpServer) {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    if (!url.startsWith(WS_PATH) || !isOriginAllowed(req.headers.origin) || !authenticate(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss!.handleUpgrade(req, socket, head, (ws) => {
      wss!.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: HeartbeatWebSocket) => {
    ws.isAlive = true;
    clients.add(ws);
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  // El ping/pong de WebSocket es a nivel de protocolo — el navegador lo responde solo, sin que
  // el JS de la página se entere. Si el proceso muere sin cerrar la conexión prolijo (ej. Render
  // reiniciando el contenedor por inactividad), el cliente puede quedar con un socket "zombie":
  // cree que sigue conectado y nunca dispara su lógica de reconexión. Por eso además del ping de
  // protocolo (que detecta y limpia clientes muertos de este lado) mandamos un mensaje de datos
  // real — el único tipo de evento que el navegador expone a onmessage — para que el cliente
  // pueda notar cuánto hace que no recibe nada y reconectar por las suyas si hace falta.
  const heartbeatInterval = setInterval(() => {
    for (const ws of clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      ws.isAlive = false;
      ws.ping();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'heartbeat', payload: {}, ts: Date.now() }));
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  server.on('close', () => clearInterval(heartbeatInterval));

  logger.info(`WebSocket de tiempo real listo en ${WS_PATH}`);
}

/**
 * Notifica a todos los clientes conectados (paneles de supervisión abiertos) que algo cambió, para
 * que refresquen sus datos sin esperar un refetch manual o un polling. No lleva el estado
 * completo, solo qué cambió — el cliente decide qué re-pedir.
 */
export function broadcast(event: string, payload: unknown) {
  if (clients.size === 0) return;
  const message = JSON.stringify({ event, payload, ts: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}
