import { createAsyncThunk, createSlice, createSelector } from '@reduxjs/toolkit'
import service from '../../services/BlueprintsService.js'

// Los thunks no conocen Axios ni las URLs: hablan con el servicio (mock o API real).

// ---------- Thunks ----------

export const fetchAuthors = createAsyncThunk('blueprints/fetchAuthors', async() => {
    const data = await service.getAll()
        // Se espera un arreglo de { author, name, points }
    return [...new Set(data.map((bp) => bp.author))]
})

export const fetchByAuthor = createAsyncThunk('blueprints/fetchByAuthor', async(author) => {
    const items = await service.getByAuthor(author)
    return { author, items }
})

export const fetchBlueprint = createAsyncThunk(
    'blueprints/fetchBlueprint',
    async({ author, name }) => service.getByAuthorAndName(author, name),
)

export const createBlueprint = createAsyncThunk('blueprints/createBlueprint', async(payload) =>
    service.create(payload),
)

// Update (PUT): agrega un punto a un plano existente. Argumento: { author, name, point: { x, y } }
export const addPoint = createAsyncThunk('blueprints/addPoint', async({ author, name, point }) => {
    await service.addPoint(author, name, point)
    return { author, name, point }
})

// Delete: elimina un plano. Argumento: { author, name }
export const deleteBlueprint = createAsyncThunk(
    'blueprints/deleteBlueprint',
    async({ author, name }) => {
        await service.remove(author, name)
        return { author, name }
    },
)

// ---------- Ayudantes ----------

// Cada thunk tiene su propio estado: { status: 'idle' | 'loading' | 'succeeded' | 'failed', error }
const idleRequest = () => ({ status: 'idle', error: null })

const start = (s, key) => {
    s.requests[key] = { status: 'loading', error: null }
}
const succeed = (s, key) => {
        s.requests[key] = { status: 'succeeded', error: null }
    }
    // Errores que tiene sentido reintentar: de red, tiempo agotado o del servidor (5xx).
    // Los 4xx (404, 403...) se repetirían igual, así que en esos casos no se ofrece "Reintentar".
    // (Axios pone ERR_BAD_REQUEST a los 4xx y ERR_BAD_RESPONSE a los 5xx.)
const RETRYABLE_CODES = ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ERR_BAD_RESPONSE']

const errorMessage = (error) => {
    if (error.code === 'ERR_NETWORK') return 'No se pudo conectar con el servidor'
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return 'El servidor tardó demasiado en responder'
    }
    return error.message
}

const fail = (s, key, action) => {
    s.requests[key] = {
        status: 'failed',
        error: errorMessage(action.error),
        retryable: RETRYABLE_CODES.includes(action.error.code),
    }
}

const isSameBlueprint = (bp, author, name) => bp?.author === author && bp?.name === name

// Operación inversa de "agregar un punto": quitar el último punto que coincida con (x, y).
const removeLastPoint = (bp, point) => {
    if (!bp?.points) return
    for (let i = bp.points.length - 1; i >= 0; i--) {
        if (bp.points[i].x === point.x && bp.points[i].y === point.y) {
            bp.points.splice(i, 1)
            return
        }
    }
}

// ---------- Slice ----------

const slice = createSlice({
    name: 'blueprints',
    initialState: {
        authors: [],
        byAuthor: {},
        current: null,
        // Copias para deshacer los cambios optimistas, indexadas por el requestId de cada petición.
        backups: {},
        requests: {
            fetchAuthors: idleRequest(),
            fetchByAuthor: idleRequest(),
            fetchBlueprint: idleRequest(),
            createBlueprint: idleRequest(),
            addPoint: idleRequest(),
            deleteBlueprint: idleRequest(),
        },
    },
    reducers: {
        // Tiempo real: puntos que otro cliente dibujó (mensaje STOMP de /topic/blueprints.{author}.{name}).
        // Solo actualiza el estado local; quien dibujó ya los guardó en la API REST.
        remotePointsReceived(s, a) {
            const { author, name, points = [] } = a.payload
            const inList = s.byAuthor[author]?.find((bp) => bp.name === name)
            if (inList) inList.points.push(...points)
            if (isSameBlueprint(s.current, author, name)) s.current.points.push(...points)
        },
    },
    extraReducers: (builder) => {
        builder
        // fetchAuthors
            .addCase(fetchAuthors.pending, (s) => start(s, 'fetchAuthors'))
            .addCase(fetchAuthors.fulfilled, (s, a) => {
                succeed(s, 'fetchAuthors')
                s.authors = a.payload
            })
            .addCase(fetchAuthors.rejected, (s, a) => fail(s, 'fetchAuthors', a))

        // fetchByAuthor
        .addCase(fetchByAuthor.pending, (s) => start(s, 'fetchByAuthor'))
            .addCase(fetchByAuthor.fulfilled, (s, a) => {
                succeed(s, 'fetchByAuthor')
                s.byAuthor[a.payload.author] = a.payload.items
            })
            .addCase(fetchByAuthor.rejected, (s, a) => fail(s, 'fetchByAuthor', a))

        // fetchBlueprint
        .addCase(fetchBlueprint.pending, (s) => start(s, 'fetchBlueprint'))
            .addCase(fetchBlueprint.fulfilled, (s, a) => {
                succeed(s, 'fetchBlueprint')
                s.current = a.payload
            })
            .addCase(fetchBlueprint.rejected, (s, a) => fail(s, 'fetchBlueprint', a))

        // createBlueprint
        .addCase(createBlueprint.pending, (s) => start(s, 'createBlueprint'))
            .addCase(createBlueprint.fulfilled, (s, a) => {
                succeed(s, 'createBlueprint')
                const bp = a.payload
                    // Solo se agrega si la lista de ese autor ya estaba cargada
                if (s.byAuthor[bp.author]) s.byAuthor[bp.author].push(bp)
            })
            .addCase(createBlueprint.rejected, (s, a) => fail(s, 'createBlueprint', a))

        // addPoint (optimistic): el punto aparece de inmediato; si la petición falla, se quita.
        .addCase(addPoint.pending, (s, a) => {
                start(s, 'addPoint')
                const { author, name, point } = a.meta.arg
                const inList = s.byAuthor[author]?.find((bp) => bp.name === name)
                if (inList) inList.points.push(point)
                if (isSameBlueprint(s.current, author, name)) s.current.points.push(point)
                s.backups[a.meta.requestId] = { author, name, point }
            })
            .addCase(addPoint.fulfilled, (s, a) => {
                succeed(s, 'addPoint')
                delete s.backups[a.meta.requestId]
            })
            .addCase(addPoint.rejected, (s, a) => {
                fail(s, 'addPoint', a)
                const backup = s.backups[a.meta.requestId]
                if (!backup) return
                const { author, name, point } = backup
                removeLastPoint(
                    s.byAuthor[author]?.find((bp) => bp.name === name),
                    point,
                )
                if (isSameBlueprint(s.current, author, name)) removeLastPoint(s.current, point)
                delete s.backups[a.meta.requestId]
            })

        // deleteBlueprint (optimistic): el plano desaparece de inmediato; si falla, vuelve a su lugar.
        .addCase(deleteBlueprint.pending, (s, a) => {
                start(s, 'deleteBlueprint')
                const { author, name } = a.meta.arg
                const list = s.byAuthor[author]
                const index = list ? list.findIndex((bp) => bp.name === name) : -1
                if (index === -1) return // no estaba en la lista: no hay nada que quitar ni que deshacer

                const backup = { author, index, item: list[index], previousCurrent: null }
                list.splice(index, 1)
                if (isSameBlueprint(s.current, author, name)) {
                    backup.previousCurrent = s.current
                    s.current = null
                }
                s.backups[a.meta.requestId] = backup
            })
            .addCase(deleteBlueprint.fulfilled, (s, a) => {
                succeed(s, 'deleteBlueprint')
                delete s.backups[a.meta.requestId]
            })
            .addCase(deleteBlueprint.rejected, (s, a) => {
                fail(s, 'deleteBlueprint', a)
                const backup = s.backups[a.meta.requestId]
                if (!backup) return
                s.byAuthor[backup.author]?.splice(backup.index, 0, backup.item)
                if (backup.previousCurrent) s.current = backup.previousCurrent
                delete s.backups[a.meta.requestId]
            })
    },
})

export const { remotePointsReceived } = slice.actions

// ---------- Selectores ----------

export const selectRequests = (state) => state.blueprints.requests

const selectByAuthorState = (state) => state.blueprints.byAuthor

// Top-5 de planos por cantidad de puntos. createSelector memoiza el resultado:
// solo se recalcula si cambia byAuthor.
export const selectTopBlueprints = createSelector([selectByAuthorState], (byAuthor) =>
    Object.values(byAuthor)
    .flat() // .flat() crea un arreglo nuevo, por eso .sort() no muta el estado de Redux
    .sort((a, b) => (b.points?.length || 0) - (a.points?.length || 0))
    .slice(0, 5),
)

export default slice.reducer