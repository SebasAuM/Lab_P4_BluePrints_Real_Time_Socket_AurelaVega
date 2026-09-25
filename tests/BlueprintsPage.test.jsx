import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import BlueprintsPage from '../src/pages/BlueprintsPage.jsx'

const idleRequests = () => ({
  fetchAuthors: { status: 'idle', error: null },
  fetchByAuthor: { status: 'idle', error: null },
  fetchBlueprint: { status: 'idle', error: null },
  createBlueprint: { status: 'idle', error: null },
  addPoint: { status: 'idle', error: null },
  deleteBlueprint: { status: 'idle', error: null },
})

const EMPTY_TOP_BLUEPRINTS = []

// Mock de thunks y selectores del slice para no requerir backend
vi.mock('../src/features/blueprints/blueprintsSlice.js', () => ({
  fetchAuthors: () => ({ type: 'blueprints/fetchAuthors' }),
  fetchByAuthor: (author) => ({ type: 'blueprints/fetchByAuthor', payload: author }),
  fetchBlueprint: (payload) => ({ type: 'blueprints/fetchBlueprint', payload }),
  addPoint: (payload) => ({ type: 'blueprints/addPoint', payload }),
  deleteBlueprint: (payload) => ({ type: 'blueprints/deleteBlueprint', payload }),
  remotePointsReceived: (payload) => ({ type: 'blueprints/remotePointsReceived', payload }),
  selectRequests: (state) => state.blueprints.requests,
  selectTopBlueprints: () => EMPTY_TOP_BLUEPRINTS,
}))

// Sin broker STOMP en los tests: el hook de tiempo real se reemplaza por un stub.
vi.mock('../src/hooks/useBlueprintStomp.js', () => ({
  default: () => ({ status: 'off', error: null, sendPoint: () => {} }),
}))

function makeStore(preloaded) {
  const slice = createSlice({
    name: 'blueprints',
    initialState: {
      authors: [],
      byAuthor: {},
      current: null,
      backups: {},
      requests: idleRequests(),
      ...preloaded,
    },
    reducers: {},
  })
  return configureStore({ reducer: { blueprints: slice.reducer } })
}

describe('BlueprintsPage', () => {
  it('despacha fetchByAuthor al hacer click en Get blueprints', () => {
    const store = makeStore()
    const spy = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <BlueprintsPage />
      </Provider>,
    )

    fireEvent.change(screen.getByPlaceholderText(/Author/i), { target: { value: 'JohnConnor' } })
    fireEvent.click(screen.getByText(/Get blueprints/i))

    expect(spy).toHaveBeenCalledWith({ type: 'blueprints/fetchByAuthor', payload: 'JohnConnor' })
  })
})
