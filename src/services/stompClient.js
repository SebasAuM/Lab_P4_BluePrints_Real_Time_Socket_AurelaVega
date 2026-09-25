import { Client } from '@stomp/stompjs'

// Backend STOMP (Spring). Es otro origen que el front (8080 vs 5173), así que el servidor
// debe permitir el origen del front en blueprints.cors.allowed-origins.
const STOMP_BASE = import.meta.env.VITE_STOMP_BASE || 'http://localhost:8080'
const BROKER_URL = `${STOMP_BASE.replace(/^http/, 'ws')}/ws-blueprints`

// Misma convención que el servidor: un tópico por plano.
export const topicFor = (author, name) => `/topic/blueprints.${author}.${name}`
export const DRAW_DESTINATION = '/app/draw'
export const ERRORS_DESTINATION = '/user/queue/errors'

// El JWT viaja en el frame CONNECT (el navegador no permite headers en el handshake WebSocket).
export function createStompClient(token) {
  return new Client({
    brokerURL: BROKER_URL,
    connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    reconnectDelay: 3000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
  })
}
