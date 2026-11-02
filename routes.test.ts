import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDistance, formatDuration, parsePlaces, parseRoutes } from './app/utils/routes.ts'

const route = (distance: number) => ({ distance, duration: 60, geometry: { coordinates: [[-46.6, -23.5]] } })

test('parseRoutes sorts by distance and flips coordinates', () => {
  const routes = parseRoutes({ code: 'Ok', routes: [route(900), route(300)] })
  assert.deepEqual(routes.map(r => r.distance), [300, 900])
  assert.deepEqual(routes[0].coords, [[-23.5, -46.6]])
})

test('parseRoutes separates no route from service failure', () => {
  assert.deepEqual(parseRoutes({ code: 'NoRoute' }), [])
  assert.deepEqual(parseRoutes({ code: 'NoSegment' }), [])
  assert.throws(() => parseRoutes({ code: 'TooBig', message: 'too big' }), /too big/)
})

test('parsePlaces builds labels, flips coordinates and drops repeats', () => {
  const point = { coordinates: [-46.66, -23.55] }
  const places = parsePlaces({ features: [
    { properties: { name: 'Avenida Paulista', district: 'Bela Vista', city: 'São Paulo', state: 'São Paulo' }, geometry: point },
    { properties: { name: 'AVENIDA PAULISTA', district: 'Bela Vista', city: 'SAO PAULO', state: 'SAO PAULO' }, geometry: point },
    { properties: { street: 'Rua Augusta', housenumber: '100', city: 'São Paulo' }, geometry: point },
    { properties: { city: 'sem nome' }, geometry: point },
  ] })
  assert.deepEqual(places, [
    { title: 'Avenida Paulista', detail: 'Bela Vista · São Paulo', lat: -23.55, lng: -46.66 },
    { title: 'Rua Augusta, 100', detail: 'São Paulo', lat: -23.55, lng: -46.66 },
  ])
})

test('formatters', () => {
  assert.equal(formatDistance(850), '850 m')
  assert.equal(formatDistance(7760.1), '7,8 km')
  assert.equal(formatDuration(858), '14 min')
  assert.equal(formatDuration(3599), '1 h 00 min')
  assert.equal(formatDuration(5), '1 min')
})
