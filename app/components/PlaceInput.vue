<script setup lang="ts">
import type { LatLng, Place } from '~/utils/routes'

const props = defineProps<{ tag: string, name: string, value: string, near: () => LatLng, locating: boolean }>()
const emit = defineEmits<{ pick: [place: Place], locate: [] }>()

const { tomtomKey } = useRuntimeConfig().public
const listId = useId()
const input = ref<HTMLInputElement>()
const query = ref(props.value)
const results = shallowRef<Place[]>([])
const active = ref(-1)
const status = ref('')

let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined

watch(() => props.value, (value) => { query.value = value })

function cancel() {
  clearTimeout(timer)
  controller?.abort()
}

function close() {
  cancel()
  results.value = []
  active.value = -1
  status.value = ''
}

async function search() {
  cancel()
  controller = new AbortController()
  const { signal } = controller
  try {
    const found = await searchPlaces(query.value.trim(), props.near(), signal, tomtomKey)
    results.value = found
    active.value = -1
    status.value = found.length ? '' : 'Não encontrei. Busque a rua ou o bairro e arraste o ponto no mapa.'
  }
  catch {
    if (signal.aborted) return
    results.value = []
    status.value = navigator.onLine ? 'Busca indisponível. Tente de novo.' : 'Busca precisa de internet.'
  }
}

function onInput() {
  cancel()
  if (query.value.trim().length < 3) {
    close()
    return
  }
  // ponytail: each pause spends one of the 2,500 free monthly TomTom requests. Raise the delay if quota runs out.
  timer = setTimeout(search, 500)
}

function pick(place: Place) {
  close()
  emit('pick', place)
  input.value?.blur()
}

function onEnter() {
  const place = results.value[active.value] ?? results.value[0]
  if (place) pick(place)
  else if (query.value.trim().length >= 3) search()
}

function move(step: number) {
  const size = results.value.length
  if (size) active.value = (active.value + step + size) % size
}

// Text that was never picked is not a point, so show the real one again
function onBlur() {
  close()
  query.value = props.value
}
</script>

<template>
  <div class="place" :class="{ empty: !value }">
    <div class="place-row">
      <span class="tag" aria-hidden="true">{{ tag }}</span>
      <input
        ref="input"
        v-model="query"
        type="text"
        role="combobox"
        enterkeyhint="search"
        autocomplete="off"
        :aria-label="`Endereço de ${name}`"
        :aria-expanded="results.length > 0"
        :aria-controls="listId"
        aria-autocomplete="list"
        :aria-activedescendant="active >= 0 ? `${listId}-${active}` : undefined"
        :placeholder="`Buscar ${name}`"
        @input="onInput"
        @blur="onBlur"
        @focus="($event.target as HTMLInputElement).select()"
        @keydown.enter.prevent="onEnter"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.esc="close"
      >
      <button
        type="button"
        class="locate"
        :class="{ busy: locating }"
        :disabled="locating"
        :aria-label="`Usar minha localização como ${name}`"
        :title="`Usar minha localização como ${name}`"
        @click="emit('locate')"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="6.5" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" />
        </svg>
      </button>
    </div>
    <p v-if="status" class="place-status" role="status">{{ status }}</p>
    <ul :id="listId" role="listbox" :aria-label="`Resultados para ${name}`">
      <!-- mousedown.prevent keeps focus in the input, otherwise blur closes the list before the click lands -->
      <li
        v-for="(place, i) in results"
        :id="`${listId}-${i}`"
        :key="i"
        role="option"
        :aria-selected="active === i"
        @mousedown.prevent
        @click="pick(place)"
      >
        <span class="place-title">{{ place.title }}</span>
        <span class="place-detail">{{ place.detail }}</span>
      </li>
    </ul>
    <p v-if="results.length" class="place-status">Não é este? Busque a rua ou o bairro e arraste o ponto no mapa.</p>
  </div>
</template>
