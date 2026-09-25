import { describe, it, expect } from 'vitest'
import reducer, {
  fetchAuthors,
  fetchByAuthor,
  fetchBlueprint,
  createBlueprint,
  addPoint,
  deleteBlueprint,
  remotePointsReceived,
  selectRequests,
  selectTopBlueprints,
} from '../src/features/blueprints/blueprintsSlice.js'

const initial = () => reducer(undefined, { type: '@@INIT' })

describe('blueprints slice (reducers puros)', () => {
  it('should initialize correctly', () => {
    const state = initial()
    expect(state.authors).toEqual([])
    expect(state.byAuthor).toEqual({})
    expect(state.current).toBeNull()
    expect(state.backups).toEqual({})
    expect(state.requests).toEqual({
      fetchAuthors: { status: 'idle', error: null },
      fetchByAuthor: { status: 'idle', error: null },
      fetchBlueprint: { status: 'idle', error: null },
      createBlueprint: { status: 'idle', error: null },
      addPoint: { status: 'idle', error: null },
      deleteBlueprint: { status: 'idle', error: null },
    })
  })

  it('ignora acciones desconocidas y no muta el estado', () => {
    const state = initial()
    const next = reducer(state, { type: 'algo/inexistente' })
    expect(next).toBe(state)
  })

  describe('fetchAuthors', () => {
    it('pending marca requests.fetchAuthors como loading', () => {
      const state = reducer(initial(), { type: fetchAuthors.pending.type })
      expect(state.requests.fetchAuthors).toEqual({ status: 'loading', error: null })
    })

    it('fulfilled guarda los autores y marca succeeded', () => {
      const state = reducer(initial(), {
        type: fetchAuthors.fulfilled.type,
        payload: ['john', 'jane'],
      })
      expect(state.requests.fetchAuthors.status).toBe('succeeded')
      expect(state.authors).toEqual(['john', 'jane'])
    })

    it('rejected marca failed, guarda el mensaje y si es reintentable (error de red)', () => {
      const state = reducer(initial(), {
        type: fetchAuthors.rejected.type,
        error: { message: 'Network Error', code: 'ERR_NETWORK' },
      })
      expect(state.requests.fetchAuthors.status).toBe('failed')
      expect(state.requests.fetchAuthors.error).toBe('No se pudo conectar con el servidor')
      expect(state.requests.fetchAuthors.retryable).toBe(true)
    })

    it('rejected marca como no reintentable un error 4xx', () => {
      const state = reducer(initial(), {
        type: fetchAuthors.rejected.type,
        error: { message: 'Not found', code: 'ERR_BAD_REQUEST' },
      })
      expect(state.requests.fetchAuthors.error).toBe('Not found')
      expect(state.requests.fetchAuthors.retryable).toBe(false)
    })
  })

  describe('fetchByAuthor', () => {
    it('fulfilled indexa los blueprints bajo el autor consultado', () => {
      const items = [{ author: 'john', name: 'house', points: [] }]
      const state = reducer(initial(), {
        type: fetchByAuthor.fulfilled.type,
        payload: { author: 'john', items },
      })
      expect(state.byAuthor.john).toEqual(items)
      expect(state.requests.fetchByAuthor.status).toBe('succeeded')
    })

    it('no afecta blueprints de otros autores ya cargados', () => {
      const prev = { ...initial(), byAuthor: { jane: [{ name: 'car' }] } }
      const state = reducer(prev, {
        type: fetchByAuthor.fulfilled.type,
        payload: { author: 'john', items: [{ name: 'house' }] },
      })
      expect(state.byAuthor.jane).toEqual([{ name: 'car' }])
      expect(state.byAuthor.john).toEqual([{ name: 'house' }])
    })
  })

  describe('fetchBlueprint', () => {
    it('fulfilled guarda el blueprint actual', () => {
      const bp = { author: 'john', name: 'house', points: [{ x: 1, y: 2 }] }
      const state = reducer(initial(), { type: fetchBlueprint.fulfilled.type, payload: bp })
      expect(state.current).toEqual(bp)
    })
  })

  describe('createBlueprint', () => {
    it('fulfilled agrega el blueprint a la lista existente del autor', () => {
      const prev = { ...initial(), byAuthor: { john: [{ name: 'house' }] } }
      const bp = { author: 'john', name: 'garage' }
      const state = reducer(prev, { type: createBlueprint.fulfilled.type, payload: bp })
      expect(state.byAuthor.john).toEqual([{ name: 'house' }, bp])
    })

    it('fulfilled no falla si el autor aún no tiene lista cargada', () => {
      const bp = { author: 'newauthor', name: 'garage' }
      const state = reducer(initial(), { type: createBlueprint.fulfilled.type, payload: bp })
      expect(state.byAuthor).toEqual({})
    })
  })

  describe('addPoint (actualización optimista)', () => {
    it('pending agrega el punto de inmediato a la lista y al blueprint actual, y guarda backup', () => {
      const bp = { author: 'john', name: 'house', points: [{ x: 1, y: 1 }] }
      const prev = { ...initial(), byAuthor: { john: [bp] }, current: bp }
      const point = { x: 9, y: 9 }
      const state = reducer(prev, {
        type: addPoint.pending.type,
        meta: { requestId: 'req-1', arg: { author: 'john', name: 'house', point } },
      })
      expect(state.byAuthor.john[0].points).toContainEqual(point)
      expect(state.current.points).toContainEqual(point)
      expect(state.backups['req-1']).toEqual({ author: 'john', name: 'house', point })
    })

    it('fulfilled limpia el backup y marca succeeded', () => {
      const prev = {
        ...initial(),
        backups: { 'req-1': { author: 'john', name: 'house', point: { x: 1, y: 1 } } },
      }
      const state = reducer(prev, {
        type: addPoint.fulfilled.type,
        meta: { requestId: 'req-1' },
      })
      expect(state.backups['req-1']).toBeUndefined()
      expect(state.requests.addPoint.status).toBe('succeeded')
    })

    it('rejected revierte el punto agregado de forma optimista', () => {
      const point = { x: 9, y: 9 }
      const bp = { author: 'john', name: 'house', points: [{ x: 1, y: 1 }, point] }
      const prev = {
        ...initial(),
        byAuthor: { john: [bp] },
        current: bp,
        backups: { 'req-1': { author: 'john', name: 'house', point } },
      }
      const state = reducer(prev, {
        type: addPoint.rejected.type,
        meta: { requestId: 'req-1' },
        error: { message: 'fail' },
      })
      expect(state.byAuthor.john[0].points).toEqual([{ x: 1, y: 1 }])
      expect(state.current.points).toEqual([{ x: 1, y: 1 }])
      expect(state.backups['req-1']).toBeUndefined()
    })
  })

  describe('deleteBlueprint (actualización optimista)', () => {
    it('pending quita el blueprint de la lista y guarda backup', () => {
      const bp = { author: 'john', name: 'house' }
      const other = { author: 'john', name: 'garage' }
      const prev = { ...initial(), byAuthor: { john: [bp, other] } }
      const state = reducer(prev, {
        type: deleteBlueprint.pending.type,
        meta: { requestId: 'req-1', arg: { author: 'john', name: 'house' } },
      })
      expect(state.byAuthor.john).toEqual([other])
      expect(state.backups['req-1']).toMatchObject({ author: 'john', index: 0, item: bp })
    })

    it('pending limpia current si es el blueprint eliminado', () => {
      const bp = { author: 'john', name: 'house' }
      const prev = { ...initial(), byAuthor: { john: [bp] }, current: bp }
      const state = reducer(prev, {
        type: deleteBlueprint.pending.type,
        meta: { requestId: 'req-1', arg: { author: 'john', name: 'house' } },
      })
      expect(state.current).toBeNull()
      expect(state.backups['req-1'].previousCurrent).toEqual(bp)
    })

    it('rejected restaura el blueprint eliminado en su posición original', () => {
      const bp = { author: 'john', name: 'house' }
      const other = { author: 'john', name: 'garage' }
      const prev = {
        ...initial(),
        byAuthor: { john: [other] },
        backups: { 'req-1': { author: 'john', index: 0, item: bp, previousCurrent: null } },
      }
      const state = reducer(prev, {
        type: deleteBlueprint.rejected.type,
        meta: { requestId: 'req-1' },
        error: { message: 'fail' },
      })
      expect(state.byAuthor.john).toEqual([bp, other])
      expect(state.backups['req-1']).toBeUndefined()
    })
  })

  describe('selectores', () => {
    it('selectRequests devuelve el objeto de estados de peticiones', () => {
      const blueprints = initial()
      expect(selectRequests({ blueprints })).toEqual(blueprints.requests)
    })

    it('selectTopBlueprints ordena por cantidad de puntos y limita a 5', () => {
      const byAuthor = {
        john: [
          { author: 'john', name: 'a', points: [1, 2] },
          { author: 'john', name: 'b', points: [1, 2, 3] },
        ],
        jane: [
          { author: 'jane', name: 'c', points: [1] },
          { author: 'jane', name: 'd', points: [1, 2, 3, 4] },
          { author: 'jane', name: 'e', points: [] },
          { author: 'jane', name: 'f', points: [1, 2, 3, 4, 5] },
          { author: 'jane', name: 'g', points: [1, 2, 3, 4, 5, 6] },
        ],
      }
      const blueprints = { ...initial(), byAuthor }
      const top = selectTopBlueprints({ blueprints })
      expect(top).toHaveLength(5)
      expect(top.map((bp) => bp.name)).toEqual(['g', 'f', 'd', 'b', 'a'])
    })
  })

  describe('remotePointsReceived (tiempo real)', () => {
    const bp = () => ({ author: 'john', name: 'house', points: [{ x: 1, y: 1 }] })

    it('agrega los puntos remotos al plano abierto y a la lista del autor', () => {
      const prev = { ...initial(), current: bp(), byAuthor: { john: [bp()] } }
      const state = reducer(
        prev,
        remotePointsReceived({ author: 'john', name: 'house', points: [{ x: 5, y: 6 }] }),
      )
      expect(state.current.points).toEqual([{ x: 1, y: 1 }, { x: 5, y: 6 }])
      expect(state.byAuthor.john[0].points).toEqual([{ x: 1, y: 1 }, { x: 5, y: 6 }])
    })

    it('ignora puntos de otro plano', () => {
      const prev = { ...initial(), current: bp() }
      const state = reducer(
        prev,
        remotePointsReceived({ author: 'john', name: 'otro', points: [{ x: 5, y: 6 }] }),
      )
      expect(state.current.points).toEqual([{ x: 1, y: 1 }])
    })
  })
})
