export type LatLng = { lat: number, lng: number }
// trafficDelay is only known with live traffic: OSRM routes leave it undefined
export type Route = { distance: number, duration: number, trafficDelay?: number, coords: [number, number][] }
export type Place = LatLng & { title: string, detail: string }

// ponytail: OSRM public demo server, car only and no uptime promise. Swap this file for GraphHopper to get more alternatives.
const OSRM = 'https://router.project-osrm.org/route/v1/driving'
// Photon allows search-as-you-type on OSM data. Nominatim's usage policy forbids it.
const PHOTON = 'https://photon.komoot.io/api/'
const TOMTOM = 'https://api.tomtom.com/search/2/search'
const TOMTOM_ROUTING = 'https://api.tomtom.com/routing/1/calculateRoute'

// TomTom returns up to 6 routes where OSRM often returns 1. OSRM covers a missing key, used-up quota or outage.
export async function fetchRoutes(a: LatLng, b: LatLng, signal?: AbortSignal, tomtomKey?: string): Promise<Route[]> {
  if (tomtomKey) {
    try {
      const routes = await fetchTomTomRoutes(a, b, tomtomKey, signal)
      if (routes.length) return routes
    }
    catch (error) {
      if (signal?.aborted) throw error
    }
  }
  const url = `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?alternatives=3&overview=full&geometries=geojson`
  const res = await fetch(url, { signal })
  return parseRoutes(await res.json())
}

async function fetchTomTomRoutes(a: LatLng, b: LatLng, key: string, signal?: AbortSignal): Promise<Route[]> {
  const params = new URLSearchParams({ key, maxAlternatives: '5', alternativeType: 'anyRoute', traffic: 'true' })
  const res = await fetch(`${TOMTOM_ROUTING}/${a.lat},${a.lng}:${b.lat},${b.lng}/json?${params}`, { signal })
  if (!res.ok) throw new Error(`TomTom ${res.status}`)
  return parseTomTomRoutes(await res.json())
}

export function parseTomTomRoutes(data: any): Route[] {
  return data.routes
    .map((r: any): Route => ({
      distance: r.summary.lengthInMeters,
      duration: r.summary.travelTimeInSeconds,
      trafficDelay: r.summary.trafficDelayInSeconds ?? 0,
      coords: r.legs.flatMap((leg: any) => leg.points.map((p: any) => [p.latitude, p.longitude])),
    }))
    .sort((x: Route, y: Route) => x.distance - y.distance)
}

// Shortest first. Empty means the points are valid but nothing connects them.
export function parseRoutes(data: any): Route[] {
  if (data.code === 'NoRoute' || data.code === 'NoSegment') return []
  if (data.code !== 'Ok') throw new Error(data.message ?? data.code)
  return data.routes
    .map((r: any): Route => ({
      distance: r.distance,
      duration: r.duration,
      // GeoJSON is [lng, lat], Leaflet wants [lat, lng]
      coords: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
    }))
    .sort((x: Route, y: Route) => x.distance - y.distance)
}

// TomTom knows far more businesses. Photon covers a missing key, used-up quota, outage or empty result.
export async function searchPlaces(query: string, near?: LatLng, signal?: AbortSignal, tomtomKey?: string): Promise<Place[]> {
  if (tomtomKey) {
    try {
      const places = await searchTomTom(query, tomtomKey, near, signal)
      if (places.length) return places
    }
    catch (error) {
      if (signal?.aborted) throw error
    }
  }
  return searchPhoton(query, near, signal)
}

async function searchTomTom(query: string, key: string, near?: LatLng, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ key, countrySet: 'BR', language: 'pt-BR', limit: '6', typeahead: 'true' })
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lon', String(near.lng))
  }
  const res = await fetch(`${TOMTOM}/${encodeURIComponent(query)}.json?${params}`, { signal })
  if (!res.ok) throw new Error(`TomTom ${res.status}`)
  return parseTomTom(await res.json())
}

export function parseTomTom(data: any): Place[] {
  return uniquePlaces(data.results.map(({ poi, address: a, position }: any): Place => ({
    title: poi?.name ?? a.freeformAddress,
    detail: poi ? a.freeformAddress : [a.municipalitySubdivision, a.municipality, a.countrySubdivision].filter(Boolean).join(' · '),
    lat: position.lat,
    lng: position.lon,
  })))
}

async function searchPhoton(query: string, near?: LatLng, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: '6' })
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lon', String(near.lng))
  }
  const res = await fetch(`${PHOTON}?${params}`, { signal })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  return parsePlaces(await res.json())
}

export function parsePlaces(data: any): Place[] {
  return uniquePlaces(data.features.map(({ properties: p, geometry }: any): Place => {
    const street = [p.street, p.housenumber].filter(Boolean).join(', ')
    const [lng, lat] = geometry.coordinates
    return { title: p.name ?? street, detail: [...new Set([p.district, p.city, p.state])].filter(Boolean).join(' · '), lat, lng }
  }))
}

// OSM splits one long street into many features, and mappers type the same place as
// "JACARÉ" and "jacare", so labels are compared without case or accents
function uniquePlaces(places: Place[]): Place[] {
  const seen = new Set<string>()
  return places.filter(({ title, detail }) => {
    const key = `${title}|${detail}`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    if (!title || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

export function formatDuration(seconds: number): string {
  const total = Math.max(1, Math.round(seconds / 60))
  if (total < 60) return `${total} min`
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`
}
