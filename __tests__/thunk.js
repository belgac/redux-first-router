import { setupAll } from '../__test-helpers__/setup'
import setupThunk from '../__test-helpers__/setupThunk'
import fakeAsyncWork from '../__test-helpers__/fakeAsyncWork'
import tempMock from '../__test-helpers__/tempMock'

import redirect from '../src/action-creators/redirect'

it('middleware:callThunk global', async () => {
  const thunk = jest.fn(({ dispatch }) => {
    dispatch({ type: 'NON_ROUTE_ACTION' })
  })
  const { store } = await setupThunk('/second/bar', thunk)
  expect(thunk).toBeCalled()
  expect(store.getState().location.type).toEqual('SECOND') // route stays the same (i.e. no redirect)
})

it('middleware:callThunk route', async () => {
  const thunk = jest.fn()

  const routesMap = {
    FIRST: '/first',
    SECOND: {
      path: '/second',
      thunk
    },
    THIRD: '/third'
  }

  const { store } = await setupAll('/first', undefined, { routesMap })
  await store.dispatch({ type: 'SECOND' })

  expect(thunk).toBeCalled()
  expect(store.getState().location.type).toEqual('SECOND')
})

it('middleware:callThunk does NOT call thunk + change callback if isClientLoadSSR', async () => {
  jest.resetModules()
  jest.doMock('../src/utils/isClientLoadSSR', () => () => true)
  jest.doMock('../src/utils/isServer', () => () => false)
  const { setupAll } = require('../__test-helpers__/setup')

  const thunk = jest.fn()
  const beforeEnter = jest.fn()
  const onComplete = jest.fn()

  const routeThunk = jest.fn()
  const routeBeforeEnter = jest.fn()
  const routeOnComplete = jest.fn()

  const routesMap = {
    FIRST: {
      path: '/first',
      beforeEnter: routeBeforeEnter,
      thunk: routeThunk,
      onComplete: routeOnComplete
    }
  }

  const options = {
    beforeEnter,
    thunk,
    onComplete
  }

  const setupOptions = { routesMap, dispatchFirstRoute: false }
  const { store, firstRoute } = await setupAll('/first', options, setupOptions)

  await store.dispatch(firstRoute())

  expect(beforeEnter).not.toBeCalled()
  expect(thunk).not.toBeCalled()
  expect(onComplete).toBeCalled()

  expect(routeBeforeEnter).not.toBeCalled()
  expect(routeThunk).not.toBeCalled()
  expect(routeOnComplete).toBeCalled()
})

it('middleware:callThunk DOES call thunk if locationState.kind !== "load"', async () => {
  const thunk = jest.fn()
  const { store } = await setupThunk('/first', thunk)

  const action = { type: 'SECOND', payload: { param: 'bar' } }
  await store.dispatch(action)

  store.getState() /*? */

  expect(thunk).toBeCalled()
})

it('callThunk calls thunk with same `dispatch` argument as in middleware chain', async () => {
  const thunk = jest.fn(({ dispatch, getState }) => {
    const action = { type: 'THIRD', payload: { param: 'hurray' } }
    dispatch(action)
    return getState()
  })

  const { store } = await setupThunk('/first', thunk)

  // thunk will be called
  const action = { type: 'SECOND', payload: { param: 'bar' } }
  await store.dispatch(action)

  const { location } = store.getState() /*? $.location */

  // expect state matched that was dispatched in thunk
  expect(location.type).toEqual('THIRD')
  expect(location.pathname).toEqual('/third/hurray')
  expect(thunk).toHaveBeenCalledTimes(1)
  expect(thunk.mock.calls[0][0].action).toMatchObject(action)
  expect(thunk.mock.calls[0][0].arg).toEqual('extra-arg')
})

it.only('pathless route calls callThunk', async () => {
  const thunk = jest.fn(() => 'cat')
  const routesMap = {
    FIRST: '/',
    PATHLESS: {
      thunk,
      onComplete: () => ({
        type: 'FOO'
      })
    }
  }

  const globalThunk = jest.fn() // won't be called by default
  const options = { thunk: globalThunk }

  const { store, history } = await setupAll('/', options, { routesMap })
  const action = { type: 'PATHLESS' }
  const res = await store.dispatch(action)

  expect(res).toEqual({ type: 'FOO' })

  expect(thunk).toHaveBeenCalled()
  expect(thunk.mock.calls[0].length).toEqual(1) // 1 arg1: req
  expect(thunk.mock.calls[0][0].action).toEqual(action)

  expect(globalThunk).toHaveBeenCalledTimes(1)

  expect(store.getState().title).toEqual('FOO')
})

it('pathless routes do not break other real route dispatches', async () => {
  const thunk = jest.fn()
  const routesMap = {
    FIRST: '/',
    SECOND: '/second',
    PATHLESS: {
      thunk
    }
  }

  const { store, history } = await setupAll('/', undefined, { routesMap })
  await store.dispatch({ type: 'SECOND' })

  const { type } = store.getState().location
  expect(type).toEqual('SECOND')
})

it('pathless routes do not break history changes from real route dispatches', async () => {
  const thunk = jest.fn()
  const routesMap = {
    FIRST: '/',
    SECOND: '/second',
    PATHLESS: {
      thunk
    }
  }

  const { store, history } = await setupAll('/', undefined, { routesMap })
  await history.push('/second')

  const { type } = store.getState().location
  expect(type).toEqual('SECOND')
})

it('CLIENT SPA: await dispatch(firstRoute())', async () => {
  jest.resetModules()
  jest.doMock('../src/utils/isClientLoadSSR', () => () => false)
  jest.doMock('../src/utils/isServer', () => () => false)

  const { setupAll } = require('../__test-helpers__/setup')

  const thunk1 = jest.fn(async ({ dispatch }) => {
    await fakeAsyncWork()
    return dispatch({ type: 'THIRD' }) // key ingredient: users must insure their thunks await a redirect dispatch so its thunk (if also async) is awaited
  })

  const thunk2 = jest.fn(async ({ dispatch }) => {
    await fakeAsyncWork()
    return 'thunk2called'
  })

  const routesMap = {
    FIRST: '/first',
    SECOND: { path: '/second', thunk: thunk1 },
    THIRD: { path: '/third', thunk: thunk2 }
  }

  const setupOptions = { routesMap, dispatchFirstRoute: false }
  const { store, firstRoute } = await setupAll('/second', undefined, setupOptions)

  // verify first route (and its thunk) has not been dispatched
  const { location } = store.getState()
  expect(location.pathname).toEqual('/second') // pathname will be correct because initialReducer state

  // but the thunk which redirects won't be called until now
  const res = await store.dispatch(firstRoute())
  const state = store.getState()

  // we'll only reach the state of the true first route here:
  expect(state.location.pathname).toEqual('/third')
  expect(state.location.type).toEqual('THIRD')
  expect(state.location.kind).toEqual('redirect')
  // expect(state.location).toMatchSnapshot()

  expect(thunk1.mock.calls.length).toEqual(1)
  expect(thunk2.mock.calls.length).toEqual(1)

  // verify second thunk is also called. This is dependent on the user returning their first thunk's
  // dispatch, which isnt required, unless they want the result in the following line like here:
  expect(res.payload).toEqual('thunk2called')
  expect(res.type).toEqual('THIRD/@@rudy/COMPLETE')
})

it('CLIENT /w SSR: await dispatch(firstRoute()) -- no thunks etc called', async () => {
  jest.resetModules()
  jest.doMock('../src/utils/isClientLoadSSR', () => () => true)
  jest.doMock('../src/utils/isServer', () => () => false)

  const { setupAll } = require('../__test-helpers__/setup')

  const thunk = jest.fn()
  const beforeEnter = jest.fn()

  const routesMap = {
    FIRST: '/first',
    SECOND: { path: '/second', thunk, beforeEnter }
  }

  const setupOptions = { routesMap, dispatchFirstRoute: false }
  const { store, firstRoute } = await setupAll('/second', undefined, setupOptions)

  // verify first route (and its thunk) has not been dispatched
  const { location } = store.getState()
  expect(location.pathname).toEqual('/second') // pathname will be correct because initialReducer state
  expect(location.kind).toEqual('init')

  // but the thunk which redirects won't be called until now
  const action = await store.dispatch(firstRoute())
  const state = store.getState()

  expect(state.location.kind).toEqual('load')

  expect(beforeEnter.mock.calls.length).toEqual(0) // no beforeEnter called!
  expect(thunk.mock.calls.length).toEqual(0) // no thunks called!

  expect(action.kind).toEqual('load')
  expect(action.type).toEqual('SECOND')

  expect(action).toMatchSnapshot()
  expect(state.location).toMatchSnapshot()
})

it('SERVER: await dispatch(firstRoute()) -- redirected route not dispatched', async () => {
  jest.resetModules()
  jest.dontMock('../src/utils/isClientLoadSSR')
  jest.doMock('../src/utils/isServer', () => () => true)
  const { setupAll } = require('../__test-helpers__/setup')

  const thunk1 = jest.fn(async ({ dispatch }) => {
    await fakeAsyncWork()
    return dispatch({ type: 'THIRD' })
  })

  const thunk2 = jest.fn()

  const routesMap = {
    FIRST: '/first',
    SECOND: { path: '/second', thunk: thunk1 },
    THIRD: { path: '/third', thunk: thunk2 }
  }

  const setupOptions = { routesMap, dispatchFirstRoute: false }
  const { store, firstRoute } = await setupAll('/second', undefined, setupOptions)

  // verify first route (and its thunk) has not been dispatched
  const { location } = store.getState()
  expect(location.pathname).toEqual('/second') // pathname will be correct because initialReducer state

  // but the thunk which redirects won't be called until now
  const action = await store.dispatch(firstRoute())
  const state = store.getState()

  // since it was a redirect on the server, the state will never change to that of the redirect
  expect(state.location.pathname).toEqual('/second')
  expect(state.location.type).toEqual('SECOND')
  expect(state.location.kind).toEqual('load')

  expect(thunk1.mock.calls.length).toEqual(1)
  expect(thunk2.mock.calls.length).toEqual(0) // second thunk never called!

  // instead, we get the action with enough info to short-circuit and call `res.redirect` on the server
  expect(action.kind).toEqual('redirect')
  expect(action.type).toEqual('THIRD')

  expect(action).toMatchSnapshot()
  expect(state.location).toMatchSnapshot()
})

it('dispatched thunk performs redirect with history.replace(path)', async () => {
  const thunk = jest.fn(({ dispatch }) => {
    const action = redirect({
      type: 'THIRD',
      payload: { param: 'hurray' }
    })
    dispatch(action)
  })
  const { store, history } = await setupThunk('/first', thunk)

  const action = { type: 'SECOND', payload: { param: 'bar' } }
  await store.dispatch(action)

  const { location } = store.getState() /*? */
  expect(location.kind).toEqual('redirect')
  expect(location.pathname).toEqual('/third/hurray')

  expect(history.length).toEqual(2) // if it wasn't a redirect, the length would be 3!
  expect(history.entries[1].pathname).toEqual('/third/hurray')
})
