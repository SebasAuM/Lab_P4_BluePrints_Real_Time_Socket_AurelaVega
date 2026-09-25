import { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import {
  createStompClient,
  DRAW_DESTINATION,
  ERRORS_DESTINATION,
  topicFor,
} from '../services/stompClient.js'

// Identifica a esta pestaña: el tópico también devuelve al emisor sus propios puntos
// y así se descartan (ya se pintaron localmente).
const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

// Conecta con el broker STOMP mientras `enabled` sea true, se suscribe al tópico del plano
// abierto (author/name) y avisa con `onUpdate` cada vez que otro cliente dibuja en él.
// Devuelve el estado de la conexión y `sendPoint` para publicar un punto propio.
export default function useBlueprintStomp({ enabled, author, name, onUpdate }) {
  const token = useSelector((s) => s.auth.token)
  const clientRef = useRef(null)
  const clientIdRef = useRef(newClientId())
  const onUpdateRef = useRef(onUpdate)
  const [status, setStatus] = useState('off') // 'off' | 'connecting' | 'connected' | 'error'
  const [error, setError] = useState(null)

  // La última versión del callback, sin tener que reconectar cuando cambia.
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  // 1) Conexión: se abre al elegir STOMP y se cierra al desactivarlo, cerrar sesión o desmontar.
  useEffect(() => {
    if (!enabled || !token) {
      setStatus('off')
      setError(null)
      return
    }
    const client = createStompClient(token)
    clientRef.current = client
    setStatus('connecting')

    client.onConnect = () => {
      setStatus('connected')
      setError(null)
      client.subscribe(ERRORS_DESTINATION, (msg) => setError(JSON.parse(msg.body).error))
    }
    client.onStompError = (frame) => {
      setStatus('error')
      setError(`STOMP: ${frame.headers.message || 'error del servidor'}`)
    }
    client.onWebSocketClose = () => setStatus((prev) => (prev === 'error' ? prev : 'connecting'))
    client.onWebSocketError = () => {
      setStatus('error')
      setError('No se pudo conectar al servidor de tiempo real (STOMP)')
    }
    client.activate()

    return () => {
      client.deactivate()
      clientRef.current = null
    }
  }, [enabled, token])

  // 2) Tópico: al abrir otro plano se cancela la suscripción anterior y se crea la nueva.
  //    Depende de `status` para volver a suscribirse tras una reconexión.
  useEffect(() => {
    const client = clientRef.current
    if (!client || status !== 'connected' || !author || !name) return
    const subscription = client.subscribe(topicFor(author, name), (msg) => {
      const upd = JSON.parse(msg.body)
      if (upd.clientId === clientIdRef.current) return
      onUpdateRef.current?.(upd)
    })
    return () => subscription.unsubscribe()
  }, [status, author, name])

  const sendPoint = useCallback(
    (point) => {
      const client = clientRef.current
      if (!client?.connected || !author || !name) return
      client.publish({
        destination: DRAW_DESTINATION,
        body: JSON.stringify({ author, name, point, clientId: clientIdRef.current }),
      })
    },
    [author, name],
  )

  return { status, error, sendPoint }
}
