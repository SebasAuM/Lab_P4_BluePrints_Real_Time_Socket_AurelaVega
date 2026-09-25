import api from './apiClient.js'

const enc = encodeURIComponent

// Implementación real: habla con el backend. Devuelve datos planos (no la respuesta de Axios)
// para que tenga exactamente el mismo contrato que blueprintsApiMock.
const blueprintsApiClient = {
    // GET /api/blueprints -> [{ author, name, points }]
    async getAll() {
        const { data } = await api.get('/blueprints')
        return data
    },

    // GET /api/blueprints/{author} -> [{ author, name, points }]
    async getByAuthor(author) {
        const { data } = await api.get(`/blueprints/${enc(author)}`)
        return data
    },

    // GET /api/blueprints/{author}/{name} -> { author, name, points }
    async getByAuthorAndName(author, name) {
        const { data } = await api.get(`/blueprints/${enc(author)}/${enc(name)}`)
        return data
    },

    // POST /api/blueprints (requiere scope blueprints.write).
    // El backend responde 201 sin cuerpo, así que se devuelve lo enviado.
    async create(blueprint) {
        await api.post('/blueprints', blueprint)
        return blueprint
    },

    // Update: PUT /api/blueprints/{author}/{name}/points con cuerpo { x, y } (requiere blueprints.write).
    // El backend responde 202 sin cuerpo, así que se devuelve el punto enviado.
    async addPoint(author, name, point) {
        await api.put(`/blueprints/${enc(author)}/${enc(name)}/points`, point)
        return point
    },

    // Delete: DELETE /api/blueprints/{author}/{name} (requiere blueprints.write).
    // El backend responde 204 sin cuerpo.
    async remove(author, name) {
        await api.delete(`/blueprints/${enc(author)}/${enc(name)}`)
    },
}

export default blueprintsApiClient