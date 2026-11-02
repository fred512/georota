export type LatLng = { lat: number, lng: number }
export type Route = { distance: number, duration: number, coords: [number, number][] }
export type Place = LatLng & { title: string, detail: string }

// ponytail: OSRM public demo server, car only and no uptime promise. Swap this file for GraphHopper to get more alternatives.
const OSRM = 'https://router.project-osrm.org/route/v1/driving'
// Photon allows search-as-you-type on OSM data. Nominatim's usage policy forbids it.
const PHOTON = 'https://photon.komoot.io/api/'

export async function fetchRoutes(a: LatLng, b: LatLng, signal?: AbortSignal): Promise<Route[]> {
  const url = `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?alternatives=3&overview=full&geometries=geojson`
  const res = await fetch(url, { signal })
  return parseRoutes(await res.json())
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

export async function searchPlaces(query: string, near?: LatLng, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: '6' })
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lon', String(near.lng))
  }
  const res = await fetch(`${PHOTON}?${params}`, { signal })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  return parsePlaces(await res.json())
}

// OSM splits one long street into many features, so identical labels collapse into the first
export function parsePlaces(data: any): Place[] {
  const seen = new Set<string>()
  const places: Place[] = []
  for (const { properties: p, geometry } of data.features) {
    const street = [p.street, p.housenumber].filter(Boolean).join(', ')
    const title = p.name ?? street
    const detail = [...new Set([p.district, p.city, p.state])].filter(Boolean).join(' · ')
    const key = `${title}|${detail}`
    if (!title || seen.has(key)) continue
    seen.add(key)
    const [lng, lat] = geometry.coordinates
    places.push({ title, detail, lat, lng })
  }
  return places
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
