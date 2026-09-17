import { Map as MaplibreMap, NavigationControl, MercatorCoordinate } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { LINIE_TYPEN, ZONE_TYPEN } from './planspielTypen'

// Externe 3D-Modelle je Subtyp (Fahrzeug- oder Punkt-Objekt). Ohne Eintrag: generischer Klotz.
// Neues Modell ergänzen: Datei(en) nach public/models/<ordner>/ legen und hier eintragen.
export const FAHRZEUG_MODELLE = {
  lkw: { url: '/models/lkw-daf/truck_daf.fbx', skalierung: 0.01, drehungX: Math.PI / 2 },
}

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const SATELLIT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SATELLIT_LAYER_ID = 'planspiel-satellit'
const KARTENMODUS_KEY = 'planspiel-kartenmodus'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

function findLabelLayerId(map) {
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol' && layer.layout?.['text-field']) return layer.id
  }
  return undefined
}

function findFirstLineOderSymbolLayerId(map) {
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'line' || layer.type === 'symbol') return layer.id
  }
  return undefined
}

function addSatellitenLayer(map) {
  map.addSource(SATELLIT_LAYER_ID, {
    type: 'raster',
    tiles: [SATELLIT_URL],
    tileSize: 256,
    // Esri liefert i.d.R. nur bis Zoom 19 echte Kacheln; darüber die letzte Kachel hochskalieren
    // statt (nicht vorhandene) höher aufgelöste Kacheln anzufragen, die sonst als Lücke erscheinen.
    maxzoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  })
  // Direkt vor der ersten Linie/Beschriftung einfügen: liegt damit über Hintergrund/Landnutzung/Wasser,
  // aber unter Straßen, Gebäuden und Labels.
  map.addLayer({
    id: SATELLIT_LAYER_ID,
    type: 'raster',
    source: SATELLIT_LAYER_ID,
    layout: { visibility: 'none' },
  }, findFirstLineOderSymbolLayerId(map))
}

export function setKartenModus(map, modus) {
  if (!map.getLayer(SATELLIT_LAYER_ID)) return
  map.setLayoutProperty(SATELLIT_LAYER_ID, 'visibility', modus === 'luftbild' ? 'visible' : 'none')
  try { localStorage.setItem(KARTENMODUS_KEY, modus) } catch {}
}

class KartenModusControl {
  onAdd(map) {
    this._map = map
    this._container = document.createElement('div')
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.title = 'Vektorkarte / Luftbild umschalten'
    btn.style.fontSize = '15px'
    btn.textContent = '🛰️'
    let gespeichert = null
    try { gespeichert = localStorage.getItem(KARTENMODUS_KEY) } catch {}
    if (gespeichert === 'luftbild') btn.style.background = '#DBEAFE'
    btn.onclick = () => {
      if (!map.getLayer(SATELLIT_LAYER_ID)) return
      const aktiv = map.getLayoutProperty(SATELLIT_LAYER_ID, 'visibility') === 'visible'
      setKartenModus(map, aktiv ? 'vektor' : 'luftbild')
      btn.style.background = aktiv ? '' : '#DBEAFE'
    }
    this._container.appendChild(btn)
    this._btn = btn
    return this._container
  }
  onRemove() {
    this._container.parentNode?.removeChild(this._container)
    this._map = undefined
  }
}

function add3DBuildings(map) {
  map.addLayer({
    id: 'planspiel-3d-buildings',
    source: 'openmaptiles',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': '#aab4be',
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, ['coalesce', ['get', 'render_height'], 6]],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.85,
    },
  }, findLabelLayerId(map))
}

function addDrawLayers(map) {
  map.addSource('planspiel-linien', { type: 'geojson', data: EMPTY_FC })
  map.addLayer({
    id: 'planspiel-linien', type: 'line', source: 'planspiel-linien',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'farbe'], 'line-width': ['get', 'breite'] },
  })

  map.addSource('planspiel-zonen', { type: 'geojson', data: EMPTY_FC })
  map.addLayer({
    id: 'planspiel-zonen-fill', type: 'fill', source: 'planspiel-zonen',
    paint: { 'fill-color': ['get', 'farbe'], 'fill-opacity': ['get', 'fuellung'] },
  })
  map.addLayer({
    id: 'planspiel-zonen-outline-solid', type: 'line', source: 'planspiel-zonen',
    filter: ['!=', ['get', 'gestrichelt'], true],
    paint: { 'line-color': ['get', 'farbe'], 'line-width': 2 },
  })
  map.addLayer({
    id: 'planspiel-zonen-outline-dash', type: 'line', source: 'planspiel-zonen',
    filter: ['==', ['get', 'gestrichelt'], true],
    paint: { 'line-color': ['get', 'farbe'], 'line-width': 2, 'line-dasharray': [2, 2] },
  })

  map.addSource('planspiel-vorschau-linie', { type: 'geojson', data: EMPTY_FC })
  map.addLayer({
    id: 'planspiel-vorschau-linie', type: 'line', source: 'planspiel-vorschau-linie',
    paint: { 'line-color': ['get', 'farbe'], 'line-width': ['get', 'breite'], 'line-dasharray': [2, 2] },
  })
  map.addSource('planspiel-vorschau-zone', { type: 'geojson', data: EMPTY_FC })
  map.addLayer({
    id: 'planspiel-vorschau-zone-fill', type: 'fill', source: 'planspiel-vorschau-zone',
    paint: { 'fill-color': ['get', 'farbe'], 'fill-opacity': ['get', 'fuellung'] },
  })
  map.addLayer({
    id: 'planspiel-vorschau-zone-outline', type: 'line', source: 'planspiel-vorschau-zone',
    paint: { 'line-color': ['get', 'farbe'], 'line-width': 2, 'line-dasharray': [2, 2] },
  })
}

export function linienZuGeoJSON(linien) {
  return {
    type: 'FeatureCollection',
    features: (linien ?? []).map(l => {
      const typ = LINIE_TYPEN.find(x => x.id === l.typ) ?? LINIE_TYPEN[0]
      return {
        type: 'Feature', id: l.id,
        properties: { farbe: typ.farbe, breite: typ.breite ?? 3 },
        geometry: { type: 'LineString', coordinates: l.punkte },
      }
    }),
  }
}

export function zonenZuGeoJSON(zonen) {
  return {
    type: 'FeatureCollection',
    features: (zonen ?? []).map(z => {
      const typ = ZONE_TYPEN.find(x => x.id === z.typ) ?? ZONE_TYPEN[0]
      return {
        type: 'Feature', id: z.id,
        properties: { farbe: typ.farbe, fuellung: typ.fill ?? 0.2, gestrichelt: !!typ.dash },
        geometry: { type: 'Polygon', coordinates: [[...z.punkte, z.punkte[0]]] },
      }
    }),
  }
}

export function setLinienDaten(map, linien) {
  map.getSource('planspiel-linien')?.setData(linienZuGeoJSON(linien))
}
export function setZonenDaten(map, zonen) {
  map.getSource('planspiel-zonen')?.setData(zonenZuGeoJSON(zonen))
}
export function setVorschauLinie(map, punkte, typ) {
  const t = LINIE_TYPEN.find(x => x.id === typ) ?? LINIE_TYPEN[0]
  const fc = punkte.length >= 2
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { farbe: t.farbe, breite: t.breite ?? 3 }, geometry: { type: 'LineString', coordinates: punkte } }] }
    : EMPTY_FC
  map.getSource('planspiel-vorschau-linie')?.setData(fc)
}
export function setVorschauZone(map, punkte, typ) {
  const t = ZONE_TYPEN.find(x => x.id === typ) ?? ZONE_TYPEN[0]
  const fc = punkte.length >= 3
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { farbe: t.farbe, fuellung: t.fill ?? 0.15 }, geometry: { type: 'Polygon', coordinates: [[...punkte, punkte[0]]] } }] }
    : EMPTY_FC
  map.getSource('planspiel-vorschau-zone')?.setData(fc)
}
export function clearVorschau(map) {
  map.getSource('planspiel-vorschau-linie')?.setData(EMPTY_FC)
  map.getSource('planspiel-vorschau-zone')?.setData(EMPTY_FC)
}

function makeDiscTexture() {
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

function buildGenerischesFahrzeug(farbeHex) {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 2.3, 2.4),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(farbeHex ?? '#DC2626') })
  )
  body.position.z = 1.2
  group.add(body)
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 2.15, 1.3),
    new THREE.MeshLambertMaterial({ color: 0xf3f4f6 })
  )
  cabin.position.set(2.5, 0, 2.55)
  group.add(cabin)
  const lightbar = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.7, 0.22),
    new THREE.MeshLambertMaterial({ color: 0x1d4ed8, emissive: 0x1d4ed8, emissiveIntensity: 0.7 })
  )
  lightbar.position.set(0.4, 0, 2.65)
  group.add(lightbar)
  group.traverse(o => { o.frustumCulled = false })
  return group
}

const modellCache = new Map()
function ladeModell(url) {
  if (!modellCache.has(url)) {
    modellCache.set(url, new Promise((resolve, reject) => {
      new FBXLoader().load(url, resolve, undefined, reject)
    }))
  }
  return modellCache.get(url)
}

function buildVehicleMesh(subtyp, farbeHex) {
  const modellDef = FAHRZEUG_MODELLE[subtyp]
  if (!modellDef) return buildGenerischesFahrzeug(farbeHex)

  const group = new THREE.Group()
  ladeModell(modellDef.url).then(vorlage => {
    const modell = vorlage.clone(true)
    modell.scale.setScalar(modellDef.skalierung ?? 0.01)
    if (modellDef.drehungX) modell.rotation.x = modellDef.drehungX
    if (modellDef.drehungZ) modell.rotation.z = modellDef.drehungZ
    modell.traverse(o => { o.frustumCulled = false })
    group.add(modell)
  }).catch(err => console.error('3D-Modell konnte nicht geladen werden:', modellDef.url, err))
  return group
}

function buildPersonMesh(farbeHex) {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(farbeHex ?? '#111827') })
  )
  body.position.z = 0.65
  group.add(body)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xf3d9b1 })
  )
  head.position.z = 1.42
  group.add(head)
  group.traverse(o => { o.frustumCulled = false })
  return group
}

const WIND_DEG = { N: 180, NO: 225, O: 270, SO: 315, S: 0, SW: 45, W: 90, NW: 135 }
const WIND_SPEED = {
  'Windstill': 0, 'Leichte Brise': 0.3, 'Mäßiger Wind': 0.6,
  'Frischer Wind': 1, 'Starker Wind': 1.6, 'Sturm': 2.4,
}

class FireEmitter {
  constructor(disc) {
    this.group = new THREE.Group()
    this.fire = this.makeSystem(disc, 70, true)
    this.smoke = this.makeSystem(disc, 40, false)
    this.group.add(this.fire.group, this.smoke.group)
  }

  makeSystem(disc, count, isFire) {
    const group = new THREE.Group()
    const sprites = []
    const data = []
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: disc, transparent: true, depthWrite: false,
        blending: isFire ? THREE.AdditiveBlending : THREE.NormalBlending,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.frustumCulled = false
      const baseScale = isFire ? (1.1 + Math.random()) : (2.2 + Math.random() * 2)
      sprite.userData.baseScale = baseScale
      sprite.scale.setScalar(baseScale)
      group.add(sprite)
      sprites.push(sprite)
      data.push({ age: Math.random() * (isFire ? 1.1 : 4), life: isFire ? 0.7 + Math.random() * 0.5 : 3 + Math.random() * 2 })
    }
    return { group, sprites, data, count }
  }

  update(dt, windDir, windSpeed) {
    this.step(this.fire, dt, true, windDir, windSpeed)
    this.step(this.smoke, dt, false, windDir, windSpeed)
  }

  step(sys, dt, isFire, windDir, windSpeed) {
    for (let i = 0; i < sys.count; i++) {
      const d = sys.data[i]
      const sprite = sys.sprites[i]
      d.age += dt
      if (d.age > d.life) {
        d.age = 0
        d.life = isFire ? 0.7 + Math.random() * 0.5 : 3 + Math.random() * 2
        d.startX = (Math.random() - 0.5) * (isFire ? 1.6 : 1.0)
        d.startY = (Math.random() - 0.5) * (isFire ? 1.6 : 1.0)
        d.rise = isFire ? 2.5 + Math.random() * 2 : 1.2 + Math.random()
        d.jitterX = (Math.random() - 0.5) * 2
        d.jitterY = (Math.random() - 0.5) * 2
        d.baseZ = isFire ? 0 : 3 + Math.random() * 1.5
      }
      const t = d.age / d.life
      let x = d.startX
      let y = d.startY
      if (!isFire) {
        // Rauch driftet mit dem Wind ab, plus etwas Streuung für eine natürliche Ausbreitung
        const drift = (windSpeed ?? 0) * t * 9
        x += windDir.x * drift + d.jitterX * t * 1.5
        y += windDir.y * drift + d.jitterY * t * 1.5
      }
      const z = d.baseZ + t * d.rise
      sprite.position.set(x, y, z)
      const grow = isFire ? 1 + t * 0.3 : 1 + t * 1.8
      sprite.scale.setScalar(sprite.userData.baseScale * grow)
      if (isFire) {
        sprite.material.color.setRGB(1, Math.max(0, 0.85 - t * 1.1), Math.max(0, 0.25 - t * 0.3))
        sprite.material.opacity = Math.min(1, (1 - t) * 1.4)
      } else {
        sprite.material.color.setRGB(0.3, 0.3, 0.3)
        sprite.material.opacity = 0.5 * Math.sin(Math.min(1, t) * Math.PI)
      }
    }
  }
}

export class Fx3DLayer {
  id = 'planspiel-3d-fx'
  type = 'custom'
  renderingMode = '3d'

  constructor(refLngLat) {
    this.refLngLat = refLngLat
    this.vehicles = new Map()
    this.personen = new Map()
    this.fires = new Map()
    this.windDir = { x: 0, y: 0 }
    this.windSpeed = 0
  }

  setWetter(wetterinfo) {
    const deg = WIND_DEG[wetterinfo?.windrichtung]
    if (deg == null) { this.windDir = { x: 0, y: 0 }; this.windSpeed = 0; return }
    const rad = deg * Math.PI / 180
    this.windDir = { x: Math.sin(rad), y: Math.cos(rad) }
    this.windSpeed = WIND_SPEED[wetterinfo?.windstaerke] ?? 0.6
  }

  onAdd(map, gl) {
    this.map = map
    this.camera = new THREE.Camera()
    this.scene = new THREE.Scene()
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const sun = new THREE.DirectionalLight(0xffffff, 0.7)
    sun.position.set(0, -60, 100)
    this.scene.add(sun)
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    this.renderer.autoClear = false
    this.disc = makeDiscTexture()
    this.clock = new THREE.Clock()
    this.origin = MercatorCoordinate.fromLngLat(this.refLngLat, 0)
    this.originScale = this.origin.meterInMercatorCoordinateUnits()
    // map.getZoom() darf nicht während render() aufgerufen werden (MapLibre v6) -> per Event mitführen
    this.currentZoom = map.getZoom()
    map.on('zoom', () => { this.currentZoom = map.getZoom() })
  }

  toLocal(lng, lat, altMeters = 0) {
    const m = MercatorCoordinate.fromLngLat([lng, lat], altMeters)
    return new THREE.Vector3(
      (m.x - this.origin.x) / this.originScale,
      -(m.y - this.origin.y) / this.originScale,
      (m.z - this.origin.z) / this.originScale
    )
  }

  setVehicles(list) {
    const ids = new Set(list.map(v => v.id))
    for (const [id, mesh] of this.vehicles) {
      if (!ids.has(id)) { this.scene.remove(mesh); this.vehicles.delete(id) }
    }
    for (const v of list) {
      let mesh = this.vehicles.get(v.id)
      if (!mesh) {
        mesh = buildVehicleMesh(v.subtyp, v.farbe)
        this.scene.add(mesh)
        this.vehicles.set(v.id, mesh)
      }
      mesh.position.copy(this.toLocal(v.lng, v.lat))
      mesh.rotation.z = ((v.heading ?? 0) * Math.PI) / 180
    }
  }

  setPersonen(list) {
    const ids = new Set(list.map(p => p.id))
    for (const [id, mesh] of this.personen) {
      if (!ids.has(id)) { this.scene.remove(mesh); this.personen.delete(id) }
    }
    for (const p of list) {
      let mesh = this.personen.get(p.id)
      if (!mesh) {
        mesh = buildPersonMesh(p.farbe)
        this.scene.add(mesh)
        this.personen.set(p.id, mesh)
      }
      mesh.position.copy(this.toLocal(p.lng, p.lat))
    }
  }

  setBrandherde(list) {
    const ids = new Set(list.map(b => b.id))
    for (const [id, em] of this.fires) {
      if (!ids.has(id)) { this.scene.remove(em.group); this.fires.delete(id) }
    }
    for (const b of list) {
      let em = this.fires.get(b.id)
      if (!em) {
        em = new FireEmitter(this.disc)
        this.scene.add(em.group)
        this.fires.set(b.id, em)
      }
      em.group.position.copy(this.toLocal(b.lng, b.lat))
    }
  }

  render(gl, options) {
    const dt = Math.min(this.clock.getDelta(), 0.1)
    for (const em of this.fires.values()) em.update(dt, this.windDir, this.windSpeed)

    // modelViewProjectionMatrix erwartet X/Y in Web-Mercator-"Weltpixeln" (mercatorFraction * worldSize)
    // und Z in echten Metern (die Umrechnung Meter->Pixel für Z übernimmt diese Matrix bereits selbst).
    const worldSize = 512 * Math.pow(2, this.currentZoom)
    const m = new THREE.Matrix4().fromArray(options.modelViewProjectionMatrix)
    const l = new THREE.Matrix4()
      .makeTranslation(this.origin.x * worldSize, this.origin.y * worldSize, 0)
      .scale(new THREE.Vector3(this.originScale * worldSize, -this.originScale * worldSize, 1))
    this.camera.projectionMatrix = m.multiply(l)

    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
    if (this.fires.size > 0) this.map.triggerRepaint()
  }
}

// Elemente, die als 3D-Objekt (Modell oder generischer Klotz) gerendert werden und daher drehbar sind
export function ist3DFahrzeug(el) {
  return el.typ === 'fahrzeug' || (el.typ === 'punkt' && !!FAHRZEUG_MODELLE[el.subtyp])
}

// elemente: Array aus karte.elemente ({id, typ, subtyp, position:[lng,lat], heading?})
export function fx3DElementeSynchronisieren(fx, elemente, elFarbe) {
  const fahrzeuge = elemente
    .filter(ist3DFahrzeug)
    .map(e => ({ id: e.id, lng: e.position[0], lat: e.position[1], farbe: elFarbe(e), subtyp: e.subtyp, heading: e.heading ?? 0 }))
  fx.setVehicles(fahrzeuge)

  const personen = elemente
    .filter(e => e.typ === 'trupp')
    .map(e => ({ id: e.id, lng: e.position[0], lat: e.position[1], farbe: elFarbe(e) }))
  fx.setPersonen(personen)

  const brandherde = elemente
    .filter(e => e.typ === 'punkt' && e.subtyp === 'brandherd')
    .map(e => ({ id: e.id, lng: e.position[0], lat: e.position[1] }))
  fx.setBrandherde(brandherde)
}

export function erstelleKarte(container, center) {
  const map = new MaplibreMap({
    container,
    center: [center.lng, center.lat],
    zoom: center.zoom ?? 17,
    pitch: center.pitch ?? 55,
    bearing: center.bearing ?? 0,
    style: MAP_STYLE,
    antialias: true,
  })
  map.addControl(new NavigationControl(), 'top-right')
  map.addControl(new KartenModusControl(), 'top-right')

  const fx = new Fx3DLayer([center.lng, center.lat])
  map.on('style.load', () => {
    add3DBuildings(map)
    addSatellitenLayer(map)
    addDrawLayers(map)
    map.addLayer(fx)

    let gespeicherterModus = null
    try { gespeicherterModus = localStorage.getItem(KARTENMODUS_KEY) } catch {}
    if (gespeicherterModus === 'luftbild') setKartenModus(map, 'luftbild')
  })

  return { map, fx }
}
