import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Polygon } from '@react-google-maps/api'
import buildings_data from './data/buildings.json'
import flex_data     from './data/flex.json'
import { MICROMARKET_POLYGONS } from './data/micromarkets.js'
import AddBuildingModal from './components/AddBuildingModal'
import { getSubmarketColor, getOperatorColor, preassignColors, areaToRadius } from './utils/colors'

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

const CITY_CONFIG = {
  'Delhi NCR':  { center: { lat: 28.502, lng: 77.200 }, zoom: 11 },
  'Mumbai':     { center: { lat: 19.076, lng: 72.877 }, zoom: 12 },
  'Bangalore':  { center: { lat: 12.972, lng: 77.594 }, zoom: 12 },
  'Hyderabad':  { center: { lat: 17.385, lng: 78.487 }, zoom: 12 },
  'Pune':       { center: { lat: 18.520, lng: 73.856 }, zoom: 12 },
  'Chennai':    { center: { lat: 13.083, lng: 80.270 }, zoom: 12 },
}
const INDIA_VIEW = { center: { lat: 20.593, lng: 78.962 }, zoom: 5 }

const LS_BUILDINGS = 'cwmap_custom_buildings'
const LS_CITIES    = 'cwmap_custom_cities'

const containerStyle = { width: '100%', height: '100%' }
const mapOptions = {
  mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
  styles: [
    { featureType: 'poi',     elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  ],
}

// ─── MARKER HELPERS ───────────────────────────────────────────────────────────

// Pin marker for buildings
function pinIcon(color, isCustom = false) {
  const inner = isCustom
    ? `<text x="14" y="19" text-anchor="middle" font-size="11" fill="white" font-weight="bold">+</text>`
    : `<circle cx="14" cy="14" r="5" fill="white"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.63 14 22 14 22s14-12.37 14-22C28 6.27 21.73 0 14 0z"
      fill="${color}" stroke="white" stroke-width="2"/>${inner}</svg>`
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: { width: 24, height: 30 },
    anchor: { x: 12, y: 30 },
  }
}

// Circle marker for flex operators — size based on area
function circleIcon(color, areaSf) {
  const r = areaToRadius(areaSf)
  const size = r * 2 + 4
  const cx = size / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="${color}" fill-opacity="0.75" stroke="white" stroke-width="2"/>
  </svg>`
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: size },
    anchor: { x: cx, y: cx },
  }
}

function formatArea(sf) { return sf ? sf.toLocaleString() + ' sf' : null }

// ─── BUILDING CARD ─────────────────────────────────────────────────────────────
function BuildingCard({ building, onClick, isSelected, layer }) {
  const color = layer === 'flex'
    ? getOperatorColor(building.operator)
    : getSubmarketColor(building.submarket)
  const r = layer === 'flex' ? areaToRadius(building.area) : null

  return (
    <div onClick={() => onClick(building)} style={{
      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
      background: isSelected ? '#EFF6FF' : 'white',
      border: `1px solid ${isSelected ? '#2563EB' : '#E5E7EB'}`,
      marginBottom: 5, transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Icon — circle for flex, dot for buildings */}
        {layer === 'flex' ? (
          <div style={{
            width: Math.min(r, 16), height: Math.min(r, 16),
            borderRadius: '50%', background: color, opacity: 0.8,
            flexShrink: 0, marginTop: 3,
          }} />
        ) : (
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: '#111827', lineHeight: 1.3 }}>
              {layer === 'flex' ? building.operator : building.name}
            </div>
            {building.isCustom && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '1px 5px', borderRadius: 3 }}>ADDED</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
            {layer === 'flex'
              ? `${building.building} · ${building.location}`
              : `${building.location} · ${building.submarket}`}
          </div>
          {layer === 'flex' && building.area && (
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
              {building.area.toLocaleString()} sf
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── LAYER TOGGLE ─────────────────────────────────────────────────────────────
function LayerToggle({ activeLayer, onChange }) {
  const layers = [
    { id: 'buildings', label: '🏢 Buildings',  desc: 'Grade-A offices' },
    { id: 'flex',      label: '🪑 Flex Ops',   desc: 'Coworking operators' },
    { id: 'both',      label: '⊕ Both',        desc: 'Combined view' },
  ]
  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
      {layers.map(l => (
        <button key={l.id} onClick={() => onChange(l.id)} style={{
          flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer',
          background: activeLayer === l.id ? '#2563EB' : 'white',
          color: activeLayer === l.id ? 'white' : '#6B7280',
          fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
          borderRight: l.id !== 'both' ? '1px solid #E5E7EB' : 'none',
        }}>
          {l.label}
        </button>
      ))}
    </div>
  )
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY })
  const mapRef = useRef(null)

  const [customBuildings, setCustomBuildings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_BUILDINGS) || '[]') } catch { return [] }
  })
  const [customCities, setCustomCities] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_CITIES) || '[]') } catch { return [] }
  })
  useEffect(() => { localStorage.setItem(LS_BUILDINGS, JSON.stringify(customBuildings)) }, [customBuildings])
  useEffect(() => { localStorage.setItem(LS_CITIES,    JSON.stringify(customCities))    }, [customCities])

  const allBuildings = useMemo(() => [...buildings_data, ...customBuildings], [customBuildings])
  const allFlex      = useMemo(() => flex_data, [])

  // Pre-assign colors
  useEffect(() => {
    preassignColors([
      ...new Set(allBuildings.map(b => b.submarket).filter(Boolean)),
      ...new Set(allFlex.map(f => f.operator).filter(Boolean)),
    ])
  }, [allBuildings, allFlex])

  // ── UI State ──
  const [activeLayer, setActiveLayer]     = useState('buildings')
  const [selectedCity, setSelectedCity]   = useState('All Cities')
  const [selected, setSelected]           = useState(null)
  const [searchQuery, setSearchQuery]     = useState('')
  const [activeFilters, setActiveFilters] = useState(() => new Set())
  const [showSidebar, setShowSidebar]     = useState(true)
  const [showAddModal, setShowAddModal]   = useState(false)

  const onMapLoad = useCallback((map) => { mapRef.current = map }, [])

  const allCities = useMemo(() => {
    const fromData = [...new Set([...allBuildings, ...allFlex].map(b => b.city).filter(Boolean))]
    return [...new Set([...Object.keys(CITY_CONFIG), ...fromData, ...customCities])]
  }, [allBuildings, allFlex, customCities])

  // Filter keys depend on active layer
  const visibleFilterKeys = useMemo(() => {
    const cityFilter = (b) => selectedCity === 'All Cities' || b.city === selectedCity
    if (activeLayer === 'buildings') {
      return [...new Set(allBuildings.filter(cityFilter).map(b => b.submarket).filter(Boolean))]
    } else if (activeLayer === 'flex') {
      return [...new Set(allFlex.filter(cityFilter).map(f => f.operator).filter(Boolean))].sort()
    } else {
      const subs = [...new Set(allBuildings.filter(cityFilter).map(b => b.submarket).filter(Boolean))]
      const ops  = [...new Set(allFlex.filter(cityFilter).map(f => f.operator).filter(Boolean))].sort()
      return [...subs, ...ops]
    }
  }, [activeLayer, selectedCity, allBuildings, allFlex])

  // Reset filters when layer or city changes
  useEffect(() => {
    setActiveFilters(new Set(visibleFilterKeys))
    setSelected(null)
  }, [activeLayer, selectedCity]) // eslint-disable-line

  // Filtered buildings
  const filteredBuildings = useMemo(() => {
    if (activeLayer === 'flex') return []
    const q = searchQuery.toLowerCase()
    return allBuildings.filter(b => {
      if (selectedCity !== 'All Cities' && b.city !== selectedCity) return false
      if (!activeFilters.has(b.submarket)) return false
      return b.name.toLowerCase().includes(q) || (b.location||'').toLowerCase().includes(q) || (b.submarket||'').toLowerCase().includes(q)
    })
  }, [allBuildings, activeLayer, selectedCity, activeFilters, searchQuery])

  // Filtered flex
  const filteredFlex = useMemo(() => {
    if (activeLayer === 'buildings') return []
    const q = searchQuery.toLowerCase()
    return allFlex.filter(f => {
      if (selectedCity !== 'All Cities' && f.city !== selectedCity) return false
      if (!activeFilters.has(f.operator)) return false
      return f.operator.toLowerCase().includes(q) || f.building.toLowerCase().includes(q) || (f.location||'').toLowerCase().includes(q)
    })
  }, [allFlex, activeLayer, selectedCity, activeFilters, searchQuery])

  const handleSelect = useCallback((item) => {
    setSelected(item)
    if (mapRef.current) {
      mapRef.current.panTo({ lat: item.lat, lng: item.lng })
      mapRef.current.setZoom(16)
    }
  }, [])

  const navigateToCity = useCallback((city) => {
    setSelectedCity(city)
    setSelected(null)
    setSearchQuery('')
    if (mapRef.current) {
      const cfg = city === 'All Cities' ? INDIA_VIEW : (CITY_CONFIG[city] || INDIA_VIEW)
      mapRef.current.panTo(cfg.center)
      mapRef.current.setZoom(cfg.zoom)
    }
  }, [])

  const toggleFilter = (key) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleAdd = useCallback((newBuildings, newCity) => {
    if (newCity) setCustomCities(prev => prev.includes(newCity) ? prev : [...prev, newCity])
    if (newBuildings.length > 0) setCustomBuildings(prev => [...prev, ...newBuildings])
  }, [])

  const handleDelete = useCallback((name) => {
    if (window.confirm(`Remove "${name}"?`)) {
      setCustomBuildings(prev => prev.filter(b => b.name !== name))
      setSelected(null)
    }
  }, [])

  const resetView = () => {
    setSelected(null)
    setSearchQuery('')
    setActiveFilters(new Set(visibleFilterKeys))
    navigateToCity(selectedCity)
  }

  const mapCenter = selectedCity === 'All Cities' ? INDIA_VIEW.center : (CITY_CONFIG[selectedCity]?.center || INDIA_VIEW.center)
  const mapZoom   = selectedCity === 'All Cities' ? INDIA_VIEW.zoom  : (CITY_CONFIG[selectedCity]?.zoom   || INDIA_VIEW.zoom)

  const totalShown = filteredBuildings.length + filteredFlex.length

  // Size legend for flex layer
  const sizeLegendItems = [
    { label: 'Small (≤30k sf)',  area: 15000 },
    { label: 'Mid (30–75k sf)',  area: 50000 },
    { label: 'Large (75k+ sf)', area: 100000 },
  ]

  if (loadError) return (
    <div style={errorStyle}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h2>Map failed to load</h2>
      <p style={{ color: '#6B7280', fontSize: 14 }}>Check your <code>VITE_GOOGLE_MAPS_API_KEY</code></p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ─── TOP BAR ─── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'white', borderBottom: '1px solid #E5E7EB',
        padding: '0 16px', overflowX: 'auto', flexShrink: 0,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', zIndex: 30,
        scrollbarWidth: 'none',
      }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#111827', marginRight: 20, whiteSpace: 'nowrap' }}>
          🏢 CW Map
        </div>
        {['All Cities', ...allCities].map(city => (
          <button key={city} onClick={() => navigateToCity(city)} style={{
            padding: '13px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
            whiteSpace: 'nowrap', fontWeight: selectedCity === city ? 700 : 400,
            color: selectedCity === city ? '#2563EB' : '#6B7280',
            background: 'transparent',
            borderBottom: `2px solid ${selectedCity === city ? '#2563EB' : 'transparent'}`,
          }}>
            {city}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAddModal(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', background: '#2563EB', color: 'white',
          border: 'none', borderRadius: 8, cursor: 'pointer',
          fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          ➕ Add Buildings
        </button>
      </div>

      {/* ─── BODY ─── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ─── SIDEBAR ─── */}
        {showSidebar && (
          <div style={{
            width: 300, display: 'flex', flexDirection: 'column',
            background: 'white', borderRight: '1px solid #E5E7EB', flexShrink: 0, zIndex: 10,
          }}>

            {/* Header */}
            <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #F3F4F6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                    {selectedCity === 'All Cities' ? 'All Buildings' : selectedCity}
                  </div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                    {totalShown} shown
                    {activeLayer === 'both' && ` · ${filteredBuildings.length} buildings, ${filteredFlex.length} flex`}
                  </div>
                </div>
                <button onClick={resetView} style={btnStyle}>↺ Reset</button>
              </div>

              {/* Layer Toggle */}
              <LayerToggle activeLayer={activeLayer} onChange={setActiveLayer} />

              {/* Search */}
              <input
                type="text"
                placeholder={activeLayer === 'flex' ? 'Search operator or building…' : 'Search building or location…'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ ...searchStyle, marginTop: 8 }}
              />
            </div>

            {/* Size legend for flex */}
            {(activeLayer === 'flex' || activeLayer === 'both') && (
              <div style={{ padding: '8px 14px', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.07em', marginBottom: 6 }}>
                  CIRCLE SIZE = OFFICE SIZE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {sizeLegendItems.map(item => {
                    const r = Math.min(areaToRadius(item.area), 14)
                    return (
                      <div key={item.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <div style={{
                          width: r * 2, height: r * 2, borderRadius: '50%',
                          background: '#7C3AED', opacity: 0.7,
                          border: '1.5px solid white', boxShadow: '0 0 0 1px #E5E7EB',
                        }} />
                        <div style={{ fontSize: 9, color: '#9CA3AF', textAlign: 'center', maxWidth: 60 }}>{item.label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Filter chips */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #F3F4F6', maxHeight: 130, overflowY: 'auto' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.07em', marginBottom: 5 }}>
                {activeLayer === 'flex' ? 'FILTER BY OPERATOR' : activeLayer === 'buildings' ? 'FILTER BY SUBMARKET' : 'FILTER'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <button onClick={() => setActiveFilters(new Set(visibleFilterKeys))} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 20,
                  border: '1.5px solid #2563EB', background: '#EFF6FF',
                  color: '#2563EB', cursor: 'pointer', fontWeight: 600,
                }}>All</button>
                {visibleFilterKeys.map(key => {
                  const color = activeLayer === 'flex' ? getOperatorColor(key) : getSubmarketColor(key)
                  const active = activeFilters.has(key)
                  const count = activeLayer === 'flex'
                    ? allFlex.filter(f => f.operator === key && (selectedCity === 'All Cities' || f.city === selectedCity)).length
                    : allBuildings.filter(b => b.submarket === key && (selectedCity === 'All Cities' || b.city === selectedCity)).length
                  return (
                    <button key={key} onClick={() => toggleFilter(key)} style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 20,
                      border: `1.5px solid ${active ? color : '#E5E7EB'}`,
                      background: active ? color + '18' : 'transparent',
                      color: active ? color : '#9CA3AF',
                      cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
                    }}>
                      {key} <span style={{ opacity: 0.7 }}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
              {/* Buildings list */}
              {filteredBuildings.length > 0 && (
                <>
                  {activeLayer === 'both' && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.07em', padding: '4px 2px 6px' }}>
                      BUILDINGS ({filteredBuildings.length})
                    </div>
                  )}
                  {filteredBuildings.map((b, i) => (
                    <BuildingCard key={'b'+i} building={b} onClick={handleSelect}
                      isSelected={selected?.name === b.name && selected?.operator === undefined}
                      layer="buildings" />
                  ))}
                </>
              )}

              {/* Flex list */}
              {filteredFlex.length > 0 && (
                <>
                  {activeLayer === 'both' && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.07em', padding: '8px 2px 6px' }}>
                      FLEX OPERATORS ({filteredFlex.length})
                    </div>
                  )}
                  {filteredFlex.map((f, i) => (
                    <BuildingCard key={'f'+i} building={f} onClick={handleSelect}
                      isSelected={selected?.operator === f.operator && selected?.building === f.building && selected?.lat === f.lat}
                      layer="flex" />
                  ))}
                </>
              )}

              {totalShown === 0 && (
                <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '40px 16px' }}>
                  No results found
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── MAP ─── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

          <button onClick={() => setShowSidebar(v => !v)} style={{
            position: 'absolute', top: 10, left: showSidebar ? -1 : 10,
            zIndex: 20, background: 'white', border: '1px solid #E5E7EB',
            borderRadius: 6, padding: '5px 9px', cursor: 'pointer',
            fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          }}>
            {showSidebar ? '◀' : '▶'}
          </button>

          {/* Legend strip */}
          <div style={{
            position: 'absolute', top: 10, left: showSidebar ? 30 : 50, right: 10,
            zIndex: 20, background: 'white', border: '1px solid #E5E7EB',
            borderRadius: 8, padding: '5px 12px',
            display: 'flex', gap: 12, alignItems: 'center',
            boxShadow: '0 1px 6px rgba(0,0,0,0.07)', fontSize: 11, overflowX: 'auto',
          }}>
            {/* Building submarket legend */}
            {(activeLayer === 'buildings' || activeLayer === 'both') && (
              [...new Set(filteredBuildings.map(b => b.submarket))].slice(0, 5).map(sm => (
                <div key={sm} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: getSubmarketColor(sm) }} />
                  <span style={{ color: '#374151', fontWeight: 500 }}>{sm}</span>
                  <span style={{ color: '#9CA3AF' }}>{filteredBuildings.filter(b => b.submarket === sm).length}</span>
                </div>
              ))
            )}

            {activeLayer === 'both' && filteredBuildings.length > 0 && filteredFlex.length > 0 && (
              <div style={{ width: 1, height: 16, background: '#E5E7EB', flexShrink: 0 }} />
            )}

            {/* Flex layer indicator */}
            {(activeLayer === 'flex' || activeLayer === 'both') && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#7C3AED', opacity: 0.75, border: '1.5px solid white', boxShadow: '0 0 0 1px #E5E7EB' }} />
                  <span style={{ color: '#374151', fontWeight: 500 }}>Flex operators</span>
                  <span style={{ color: '#9CA3AF' }}>{filteredFlex.length}</span>
                </div>
                <span style={{ color: '#9CA3AF', fontSize: 10 }}>· circle size = office size</span>
              </>
            )}
          </div>

          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={mapCenter}
              zoom={mapZoom}
              options={mapOptions}
              onLoad={onMapLoad}
              onClick={() => setSelected(null)}
            >
              {/* ── Micromarket polygon overlays ── */}
              {Object.entries(MICROMARKET_POLYGONS).map(([name, paths]) => {
                const color = getSubmarketColor(name)
                return (
                  <Polygon
                    key={name}
                    paths={paths}
                    options={{
                      fillColor: color,
                      fillOpacity: 0.15,
                      strokeColor: color,
                      strokeOpacity: 0.7,
                      strokeWeight: 1.5,
                    }}
                  />
                )
              })}

              {/* Building markers — pins */}
              {filteredBuildings.map((b, i) => (
                <Marker
                  key={'b'+i}
                  position={{ lat: b.lat, lng: b.lng }}
                  icon={pinIcon(getSubmarketColor(b.submarket), b.isCustom)}
                  onClick={() => handleSelect(b)}
                  title={b.name}
                  zIndex={10}
                />
              ))}

              {/* Flex markers — sized circles */}
              {filteredFlex.map((f, i) => (
                <Marker
                  key={'f'+i}
                  position={{ lat: f.lat, lng: f.lng }}
                  icon={circleIcon(getOperatorColor(f.operator), f.area)}
                  onClick={() => handleSelect(f)}
                  title={`${f.operator} · ${f.area?.toLocaleString()} sf`}
                  zIndex={5}
                />
              ))}

              {/* Info window — Buildings */}
              {selected && selected.name && !selected.operator && (
                <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelected(null)}>
                  <div style={{ maxWidth: 240, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'white', background: getSubmarketColor(selected.submarket), borderRadius: 4, padding: '2px 7px' }}>
                        {selected.submarket}
                      </span>
                      {selected.isCustom && <span style={{ fontSize: 9, fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '2px 5px', borderRadius: 3 }}>ADDED</span>}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 8 }}>{selected.name}</div>
                    <InfoTable rows={[
                      ['🏙️ City', selected.city],
                      ['📍 Location', selected.location],
                      ['🏗️ Type', selected.type],
                      ['⭐ Grade', selected.grade],
                      ['📅 Year', selected.year],
                      ['📐 Area', formatArea(selected.area)],
                      ['👷 Developer', selected.developer],
                      ['💰 Rent', selected.rent ? `₹${selected.rent}/sf` : null],
                    ]} />
                    {selected.isCustom && (
                      <button onClick={() => handleDelete(selected.name)} style={{ marginTop: 10, fontSize: 11, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>
                        🗑 Remove
                      </button>
                    )}
                  </div>
                </InfoWindow>
              )}

              {/* Info window — Flex */}
              {selected && selected.operator && (
                <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelected(null)}>
                  <div style={{ maxWidth: 250, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'white', background: getOperatorColor(selected.operator), borderRadius: 4, padding: '2px 7px' }}>
                        🪑 Flex Operator
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 2 }}>{selected.operator}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>{selected.building}</div>

                    {/* Area visual bar */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>Office size</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3 }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            background: getOperatorColor(selected.operator),
                            width: `${Math.round((areaToRadius(selected.area) - 12) / (36 - 12) * 100)}%`,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>
                          {selected.area?.toLocaleString()} sf
                        </span>
                      </div>
                    </div>

                    <InfoTable rows={[
                      ['📍 Location',   selected.location],
                      ['🗺️ Submarket',  selected.submarket],
                      ['🏙️ City',       selected.city],
                      ['⭐ Grade',      selected.grade],
                      ['📅 Year',       selected.year],
                      ['🏗️ Structure',  selected.structure],
                      ['👷 Owner',      selected.owner],
                      ['💰 Rent',       selected.rent ? `₹${selected.rent}/sf` : null],
                    ]} />
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          ) : (
            <div style={loadingStyle}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
              <div style={{ fontWeight: 600, color: '#374151' }}>Loading map…</div>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddBuildingModal
          onAdd={handleAdd}
          onClose={() => setShowAddModal(false)}
          customCities={customCities}
          apiKey={GOOGLE_MAPS_API_KEY}
        />
      )}
    </div>
  )
}

// ─── INFO TABLE ────────────────────────────────────────────────────────────────
function InfoTable({ rows }) {
  return (
    <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
      {rows.filter(([, v]) => v).map(([label, val]) => (
        <tr key={label}>
          <td style={{ color: '#6B7280', paddingBottom: 3, paddingRight: 8, whiteSpace: 'nowrap' }}>{label}</td>
          <td style={{ color: '#111827', fontWeight: 500 }}>{val}</td>
        </tr>
      ))}
    </table>
  )
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const searchStyle = {
  width: '100%', padding: '7px 10px', borderRadius: 7,
  border: '1.5px solid #E5E7EB', fontSize: 12, outline: 'none',
  color: '#111827', background: '#F9FAFB', boxSizing: 'border-box',
}
const btnStyle = {
  fontSize: 11, padding: '4px 9px', borderRadius: 6,
  border: '1px solid #E5E7EB', background: 'white',
  cursor: 'pointer', color: '#374151', fontWeight: 500,
}
const errorStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', height: '100vh', gap: 8,
  color: '#374151', background: '#FEF2F2', textAlign: 'center', padding: 20,
}
const loadingStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', height: '100%', color: '#9CA3AF',
}
