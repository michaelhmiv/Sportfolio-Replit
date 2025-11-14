/**
 * WebSocket Broadcasting Service
 * 
 * Centralized WebSocket management for real-time updates.
 * Shared by routes and background jobs.
 */

import { WebSocket } from "ws";

// WebSocket clients for real-time updates
const wsClients = new Set<WebSocket>();

export function addClient(ws: WebSocket) {
  wsClients.add(ws);
  console.log(`[WebSocket] Client connected (total: ${wsClients.size})`);
}

export function removeClient(ws: WebSocket) {
  wsClients.delete(ws);
  console.log(`[WebSocket] Client disconnected (total: ${wsClients.size})`);
}

export function broadcast(message: any) {
  const payload = JSON.stringify(message);
  let sent = 0;
  
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });
  
  if (sent > 0) {
    console.log(`[WebSocket] Broadcasted ${message.type} to ${sent} clients`);
  }
}

export function getClientCount(): number {
  return wsClients.size;
}
