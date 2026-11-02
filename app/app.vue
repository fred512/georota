<script setup lang="ts">
import L from 'leaflet'
import type { Place, Route } from '~/utils/routes'

const POINTS = [{ tag: 'A', name: 'origem' }, { tag: 'B', name: 'destino' }]
const THEME_KEY = 'georota:theme'
const LAST_KEY = 'georota:last'

const mapEl = ref<HTMLElement>()
const points = shallowRef<(L.LatLng | undefined)[]>([])
const labels = ref<string[]>([])
const routes = shallowRef<Route[]>([])
const selected = ref(0)
const loading = ref(false)
const error = ref('')
const canRetry = ref(false)
const online = ref(navigator.onLine)
const theme = ref(document.documentElement.dataset.theme)

useHead({ meta: [{ name: 'theme-color', content: () => theme.value === 'dark' ? '#141b17' : '#efe8d8' }] })

const longest = computed(() => Math.max(...routes.value.map(r => r.distance)))
const hasBoth = computed(() => !!points.value[0] && !!points.value[1])
const hint = computed(() => {
  if (hasBoth.value) return 'Arraste os pontos para ajustar.'
  if (points.value[0]) return 'Agora busque ou marque o destino.'
  if (points.value[1]) return 'Agora busque ou marque a origem.'
  return 'Busque um endereço ou marque no mapa.'
})

let map: L.Map
let markers: (L.Marker | undefined)[] = []
let lines: L.Polyline[] = []
let controller: AbortController | undefined

// Storage can throw in private windows. The app works without it.
function readStored(key: string) {
  try { return localStorage.getItem(key) }
  catch { return null }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  }
  catch {}
}

function applyTheme(next: string) {
  theme.value = next
  document.documentElement.dataset.theme = next
}

function toggleTheme() {
  const next = theme.value === 'dark' ? 'light' : 'dark'
  writeStored(THEME_KEY, next)
  applyTheme(next)
}

function colorOf(index: number) {
  return `var(--route-${index % 4 + 1})`
}

function coordsLabel({ lat, lng }: L.LatLng) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

function clearLines() {
  lines.forEach(line => line.remove())
  lines = []
  routes.value = []
}

function reset() {
  controller?.abort()
  loading.value = false
  error.value = ''
  canRetry.value = false
  clearLines()
  markers.forEach(marker => marker?.remove())
  markers = []
  points.value = []
  labels.value = []
  // Offline this copy cannot be fetched again, so keep it for the next opening
  if (online.value) writeStored(LAST_KEY, null)
}

function restyle() {
  lines.forEach((line, i) => line.setStyle(i === selected.value ? { weight: 7, opacity: 1 } : { weight: 4, opacity: 0.55 }))
  lines[selected.value]?.bringToFront()
}

// The route list resizes the map on phones, so fit the routes only after it renders
async function draw() {
  await nextTick()
  map.invalidateSize()
  lines = routes.value.map((route, i) =>
    L.polyline(route.coords, { color: colorOf(i), bubblingMouseEvents: false })
      .on('click', () => { selected.value = i })
      .addTo(map),
  )
  restyle()
  if (lines.length) map.fitBounds(L.featureGroup(lines).getBounds(), { padding: [48, 48] })
}

async function load() {
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  loading.value = true
  error.value = ''
  canRetry.value = false
  clearLines()
  try {
    const found = await fetchRoutes(points.value[0]!.wrap(), points.value[1]!.wrap(), signal)
    selected.value = 0
    routes.value = found
    if (found.length) {
      writeStored(LAST_KEY, JSON.stringify({ points: points.value.map(p => [p!.lat, p!.lng]), labels: labels.value, routes: found }))
    }
    else {
      error.value = 'Nenhuma rota de carro liga estes dois pontos.'
    }
    loading.value = false
    await draw()
  }
  catch {
    if (signal.aborted) return
    loading.value = false
    canRetry.value = true
    error.value = navigator.onLine
      ? 'Serviço de rotas indisponível. Tente de novo.'
      : 'Rota nova precisa de internet.'
  }
}

function setPoint(index: number, latlng: L.LatLng, label: string) {
  const nextPoints = [...points.value]
  nextPoints[index] = latlng
  points.value = nextPoints
  labels.value[index] = label

  const existing = markers[index]
  if (existing) {
    existing.setLatLng(latlng)
    return
  }
  const { tag, name } = POINTS[index]!
  const marker = L.marker(latlng, {
    draggable: true,
    title: name,
    alt: name,
    icon: L.divIcon({ className: 'pin', html: tag, iconSize: [36, 36] }),
  }).addTo(map)
  marker.on('dragend', () => {
    setPoint(index, marker.getLatLng(), coordsLabel(marker.getLatLng()))
    if (hasBoth.value) load()
  })
  markers[index] = marker
}

function pickPlace(index: number, place: Place) {
  const latlng = L.latLng(place.lat, place.lng)
  setPoint(index, latlng, place.title)
  if (hasBoth.value) load()
  else map.setView(latlng, Math.max(map.getZoom(), 15))
}

function restoreLast() {
  try {
    const saved = JSON.parse(readStored(LAST_KEY) ?? 'null')
    if (!saved) return
    saved.points.forEach(([lat, lng]: [number, number], i: number) => {
      const latlng = L.latLng(lat, lng)
      setPoint(i, latlng, saved.labels?.[i] ?? coordsLabel(latlng))
    })
    routes.value = saved.routes
    draw()
  }
  catch {
    writeStored(LAST_KEY, null)
  }
}

watch(selected, () => restyle())

onMounted(() => {
  map = L.map(mapEl.value!, { zoomControl: false }).setView([-23.5505, -46.6333], 12)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    // CORS responses, so the service worker can see the status and store real tile sizes
    crossOrigin: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · rotas <a href="https://project-osrm.org">OSRM</a> · busca <a href="https://photon.komoot.io">Photon</a>',
  }).addTo(map)
  // A stray tap must not wipe the routes: starting over goes through "Limpar mapa"
  map.on('click', (e: L.LeafletMouseEvent) => {
    if (hasBoth.value) return
    setPoint(points.value[0] ? 1 : 0, e.latlng, coordsLabel(e.latlng))
    if (hasBoth.value) load()
  })
  new ResizeObserver(() => map.invalidateSize()).observe(mapEl.value!)
  restoreLast()

  // Follow the system until the user picks a theme
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!readStored(THEME_KEY)) applyTheme(e.matches ? 'dark' : 'light')
  })
  addEventListener('offline', () => { online.value = false })
  addEventListener('online', () => {
    online.value = true
    if (hasBoth.value && !routes.value.length) load()
  })
})
</script>

<template>
  <NuxtPwaManifest />
  <div class="sheet">
    <aside class="panel">
      <header class="masthead">
        <h1>Geo<em>Rota</em></h1>
        <p>Dois pontos, cada caminho medido.</p>
        <button
          type="button"
          class="theme-toggle"
          :aria-label="theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'"
          @click="toggleTheme"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
          </svg>
        </button>
      </header>

      <div class="points">
        <PlaceInput
          v-for="(point, i) in POINTS"
          :key="point.tag"
          :tag="point.tag"
          :name="point.name"
          :value="labels[i] ?? ''"
          :near="() => map.getCenter()"
          @pick="pickPlace(i, $event)"
        />
      </div>

      <p class="hint">{{ hint }}</p>
      <p v-if="!online" class="offline" role="status">Sem internet. O mapa mostra só áreas já vistas.</p>

      <div class="legend" aria-live="polite">
        <p v-if="loading" class="status"><span class="tracing" />Traçando rotas</p>
        <template v-else-if="error">
          <p class="status error">{{ error }}</p>
          <button v-if="canRetry" type="button" class="retry" @click="load">Tentar de novo</button>
        </template>

        <template v-else-if="routes.length">
          <h2>{{ routes.length === 1 ? '1 rota encontrada' : `${routes.length} rotas encontradas` }}</h2>
          <ol>
            <li v-for="(route, i) in routes" :key="i" :style="{ '--route': colorOf(i), '--delay': `${i * 70}ms` }">
              <button type="button" :aria-pressed="selected === i" @click="selected = i">
                <span class="distance">{{ formatDistance(route.distance) }}</span>
                <span class="meta">
                  {{ formatDuration(route.duration) }}
                  <template v-if="i"> · +{{ formatDistance(route.distance - routes[0]!.distance) }}</template>
                  <template v-else> · mais curta</template>
                </span>
                <span class="scale" :style="{ width: `${route.distance / longest * 100}%` }" />
              </button>
            </li>
          </ol>
        </template>
      </div>

      <button v-if="points.some(Boolean)" type="button" class="clear" @click="reset">Limpar mapa</button>
    </aside>

    <main class="map-frame">
      <div ref="mapEl" class="map" />
    </main>
  </div>
</template>
