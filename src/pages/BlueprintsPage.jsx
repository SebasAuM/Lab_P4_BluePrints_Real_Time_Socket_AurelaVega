import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  addPoint,
  deleteBlueprint,
  fetchAuthors,
  fetchByAuthor,
  fetchBlueprint,
  remotePointsReceived,
  selectRequests,
  selectTopBlueprints,
} from '../features/blueprints/blueprintsSlice.js'
import BlueprintCanvas from '../components/BlueprintCanvas.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import useBlueprintStomp from '../hooks/useBlueprintStomp.js'

// Tecnologías de tiempo real disponibles en el selector RT.
const RT_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'stomp', label: 'STOMP' },
]

const RT_STATUS_LABEL = {
  off: 'Desactivado',
  connecting: 'Conectando...',
  connected: 'Conectado',
  error: 'Sin conexión',
}

export default function BlueprintsPage() {
  const dispatch = useDispatch()
  const { byAuthor, current } = useSelector((s) => s.blueprints)
  const requests = useSelector(selectRequests)
  const topBlueprints = useSelector(selectTopBlueprints)
  const listRequest = requests.fetchByAuthor // estado de "Get blueprints"
  const openRequest = requests.fetchBlueprint // estado de "Open"
  const deleteRequest = requests.deleteBlueprint // estado de "Delete"
  const addPointRequest = requests.addPoint // estado de "Add point"

  const [authorInput, setAuthorInput] = useState('')
  const [selectedAuthor, setSelectedAuthor] = useState('')
  const [pointX, setPointX] = useState('')
  const [pointY, setPointY] = useState('')
  const [lastOpened, setLastOpened] = useState(null) // para poder reintentar "Open"
  const [rtTech, setRtTech] = useState('stomp') // selector RT: 'none' | 'stomp'
  const items = byAuthor[selectedAuthor] || []

  const validPoint =
    pointX !== '' &&
    pointY !== '' &&
    Number.isFinite(Number(pointX)) &&
    Number.isFinite(Number(pointY))

  useEffect(() => {
    dispatch(fetchAuthors())
  }, [dispatch])

  // Tiempo real: los puntos que dibujan otros clientes en el plano abierto llegan por STOMP.
  const handleRemoteUpdate = useCallback((upd) => dispatch(remotePointsReceived(upd)), [dispatch])
  const rt = useBlueprintStomp({
    enabled: rtTech === 'stomp',
    author: current?.author,
    name: current?.name,
    onUpdate: handleRemoteUpdate,
  })

  const totalPoints = useMemo(
    () => items.reduce((acc, bp) => acc + (bp.points?.length || 0), 0),
    [items],
  )

  const getBlueprints = () => {
    if (!authorInput) return
    setSelectedAuthor(authorInput)
    dispatch(fetchByAuthor(authorInput))
  }

  const openBlueprint = (bp) => {
    const target = { author: bp.author, name: bp.name }
    setLastOpened(target)
    dispatch(fetchBlueprint(target))
  }

  // Reintentar = volver a despachar el mismo thunk con los mismos argumentos.
  // Solo se ofrece en lecturas (GET), que se pueden repetir sin efectos secundarios.
  const retryList = () => dispatch(fetchByAuthor(selectedAuthor))
  const retryOpen = () => dispatch(fetchBlueprint(lastOpened))

  // Optimistic: el plano desaparece de la tabla al instante; si el servidor falla, vuelve a aparecer.
  const removeBlueprint = (bp) => {
    dispatch(deleteBlueprint({ author: bp.author, name: bp.name }))
  }

  // Optimistic: el punto se dibuja al instante; si el servidor falla, se quita.
  // Solo cuando la API REST confirma el punto se publica a los demás clientes (/app/draw),
  // así nunca se replica un punto que luego se revierte.
  const drawPoint = (point) => {
    if (!current) return
    dispatch(addPoint({ author: current.author, name: current.name, point }))
      .unwrap()
      .then(() => rt.sendPoint(point))
      .catch(() => {}) // el error ya queda en requests.addPoint y se muestra en el banner
  }

  const submitPoint = (e) => {
    e.preventDefault()
    if (!current || !validPoint) return
    drawPoint({ x: Number(pointX), y: Number(pointY) })
    setPointX('')
    setPointY('')
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '1.1fr 1.4fr', gap: 24 }}>
      <section className="grid" style={{ gap: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Blueprints</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              className="input"
              placeholder="Author"
              value={authorInput}
              onChange={(e) => setAuthorInput(e.target.value)}
            />
            <button className="btn primary" onClick={getBlueprints}>
              Get blueprints
            </button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>
            {selectedAuthor ? `${selectedAuthor}'s blueprints:` : 'Results'}
          </h3>
          {listRequest.status === 'loading' && <p>Cargando...</p>}
          {listRequest.status === 'failed' && (
            <ErrorBanner
              message={`No se pudieron cargar los planos: ${listRequest.error}`}
              onRetry={listRequest.retryable ? retryList : undefined}
            />
          )}
          {deleteRequest.status === 'failed' && (
            <ErrorBanner
              message={`No se pudo eliminar el plano (se restauró en la lista): ${deleteRequest.error}`}
            />
          )}
          {listRequest.status === 'succeeded' && !items.length && (
            <p>Este autor no tiene planos. Prueba con otro nombre.</p>
          )}
          {!!items.length && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '8px',
                        borderBottom: '1px solid #334155',
                      }}
                    >
                      Blueprint name
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '8px',
                        borderBottom: '1px solid #334155',
                      }}
                    >
                      Number of points
                    </th>
                    <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((bp) => (
                    <tr key={bp.name}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #1f2937' }}>
                        {bp.name}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          borderBottom: '1px solid #1f2937',
                        }}
                      >
                        {bp.points?.length || 0}
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #1f2937' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn" onClick={() => openBlueprint(bp)}>
                            Open
                          </button>
                          <button className="btn" onClick={() => removeBlueprint(bp)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ marginTop: 12, fontWeight: 700 }}>Total user points: {totalPoints}</p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Top 5 by number of points</h3>
          {!topBlueprints.length ? (
            <p>Consulta un autor para ver su ranking.</p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {topBlueprints.map((bp) => (
                <li key={`${bp.author}/${bp.name}`}>
                  {bp.author} / {bp.name} — {bp.points?.length || 0} puntos
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Current blueprint: {current?.name || '—'}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <label htmlFor="rt-tech">Tiempo real</label>
          <select
            id="rt-tech"
            className="input"
            style={{ width: 'auto' }}
            value={rtTech}
            onChange={(e) => setRtTech(e.target.value)}
          >
            {RT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span data-testid="rt-status">{RT_STATUS_LABEL[rt.status]}</span>
        </div>
        {rt.error && <ErrorBanner message={rt.error} />}
        {openRequest.status === 'loading' && <p>Cargando plano...</p>}
        {openRequest.status === 'failed' && (
          <ErrorBanner
            message={`No se pudo abrir el plano: ${openRequest.error}`}
            onRetry={openRequest.retryable && lastOpened ? retryOpen : undefined}
          />
        )}
        <BlueprintCanvas
          points={current?.points || []}
          onAddPoint={current ? drawPoint : undefined}
        />

        {current && (
          <form onSubmit={submitPoint} style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <input
              className="input"
              type="number"
              placeholder="x"
              value={pointX}
              onChange={(e) => setPointX(e.target.value)}
            />
            <input
              className="input"
              type="number"
              placeholder="y"
              value={pointY}
              onChange={(e) => setPointY(e.target.value)}
            />
            <button className="btn primary" disabled={!validPoint}>
              Add point
            </button>
          </form>
        )}
        {addPointRequest.status === 'failed' && (
          <ErrorBanner
            message={`No se pudo agregar el punto (se quitó del plano): ${addPointRequest.error}`}
          />
        )}
      </section>
    </div>
  )
}