import pathToAction from '../src/utils/pathToAction'
import { NOT_FOUND } from '../src/index'

it('parse path into action using routePath without /:param segment', () => {
  const routesMap = {
    INFO: { path: '/info' },
    INFO_PARAM: { path: '/info/:param' }
  }

  const action = pathToAction('/info', routesMap)
  expect(action).toMatchObject({ type: 'INFO', payload: {} }) /*? */
})

it('parse path into action using routePath with /:param segment', () => {
  const routesMap = {
    INFO: { path: '/info' },
    INFO_PARAM: { path: '/info/:param' }
  }

  const action = pathToAction('/info/foo', routesMap)
  expect(action).toMatchObject({
    type: 'INFO_PARAM',
    payload: { param: 'foo' }
  })
})

it('parse path (/info/foo-bar) into action using route object containing capitalizedWords: true: payload: { param: "Foo Bar" }', () => {
  const path = '/info/foo-bar'
  const routesMap = {
    INFO_PARAM: { path: '/info/:param/', capitalizedWords: true }
  }

  const action = pathToAction(path, routesMap) /*? */
  expect(action.payload.param).toEqual('Foo Bar')
})

it('parse path into action using route object containing fromPath() function', () => {
  const path = '/info/foo-bar/1'
  const routesMap = {
    INFO_PARAM: {
      path: '/info/:param/:param2',
      fromPath: (segment, key) =>
        key === 'param2'
          ? segment
          : `${segment} ${key}`.replace('-', ' ').toUpperCase()
    }
  }

  const action = pathToAction(path, routesMap) /*? */
  expect(action.payload.param).toEqual('FOO BAR PARAM')
  expect(action.payload.param2).toEqual('1')
})

it('parse path containing number param into action with payload value set as integer instead of string', () => {
  const path = '/info/69'
  const routesMap = {
    INFO_PARAM: { path: '/info/:param/' }
  }

  const action = pathToAction(path, routesMap) /*? */
  expect(typeof action.payload.param).toEqual('number')
  expect(action.payload.param).toEqual(69)
})

it('does not parse a blank string "" as NaN', () => {
  const path = '/info'
  const routesMap = {
    INFO_WILDCARD: { path: '/info(.*)' }
  }

  const action = pathToAction(path, routesMap)
  expect(action.payload[0]).toEqual('')
})

it('parsed path not found and return NOT_FOUND action.type: "@@redux-first-router/NOT_FOUND"', () => {
  const path = '/info/foo/bar'
  const routesMap = {
    INFO_PARAM: { path: '/info/:param/' }
  }

  const action = pathToAction(path, routesMap) /*? */
  expect(action.type).toEqual(NOT_FOUND)
})

it('strips basename if first segment in path', () => {
  const path = '/base/foo/bar'
  const routesMap = {
    FOO: { path: '/foo/bar' }
  }

  const action = pathToAction(path, routesMap, '/base') /*? */
  expect(action.type).toEqual('FOO')
})
