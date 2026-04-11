import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import buildings_data from './data/buildings.json'
import AddBuildingModal from './components/AddBuildingModal'
import { getSubmarketColor, preassignColors } from './utils/colors'

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
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  styles: [
    { featureType: 'poi',     elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  ],
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function markerIcon(color, isCustom = false) {
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

function formatArea(sf) {
  return sf ? sf.toLocaleString() + ' sf' : null
}

// ─── BUILDING CARD ───────────────────────────────────────────────────────────
function BuildingCard({ building, onClick, isSelected }) {
  const color = getSubmarketColor(building.submarket)
  return (
    <div onClick={() => onClick(building)} style={{
      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
      background: isSelected ? '#EFF6FF' : 'white',
      border: `1px solid ${isSelected ? '#2563EB' : '#E5E7EB'}`,
      marginBottom: 5, transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: '#111827', lineHeight: 1.3 }}>
              {building.name}
            </div>
            {building.isCustom && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '1px 5px', borderRadius: 3 }}>
                ADDED
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
            {building.location}{building.submarket !== building.location ? ` · ${building.submarket}` : ''}
            {building.city ? ` · ${building.city}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY })
  const mapRef = useRef(null)

  // ── Persisted state ──
  const [customBuildings, setCustomBuildings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_BUILDINGS) || '[]') } catch { return [] }
  })
  const [customCities, setCustomCities] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_CITIES) || '[]') } catch { return [] }
  })

  useEffect(() => { localStorage.setItem(LS_BUILDINGS, JSON.stringify(customBuildings)) }, [customBuildings])
  useEffect(() => { localStorage.setItem(LS_CITIES,    JSON.stringify(customCities))    }, [customCities])

  const allBuildings = useMemo(() => [...buildings_data, ...customBuildings], [customBuildings])

  useEffect(() => {
    preassignColors([...new Set(allBuildings.map(b => b.submarket).filter(Boolean))])
  }, [allBuildings])

  // ── UI state ──
  const [selectedCity, setSelectedCity]   = useState('All Cities')
  const [selected, setSelected]           = useState(null)
  const [searchQuery, setSearchQuery]     = useState('')
  const [activeSubmarkets, setActiveSubmarkets] = useState(() => new Set())
  const [showSidebar, setShowSidebar]     = useState(true)
  const [showAddModal, setShowAddModal]   = useState(false)
  const [showOnlyCustom, setShowOnlyCustom] = useState(false)

  const onMapLoad = useCallback((map) => { mapRef.current = map }, [])

  const allCities = useMemo(() => {
    const fromData = [...new Set(allBuildings.map(b => b.city).filter(Boolean))]
    return [...new Set([...Object.keys(CITY_CONFIG), ...fromData, ...customCities])]
  }, [allBuildings, customCities])

  const visibleSubmarkets = useMemo(() => {
    const src = selectedCity === 'All Cities'
      ? allBuildings
      : allBuildings.filter(b => b.city === selectedCity)
    return [...new Set(src.map(b => b.submarket).filter(Boolean))]
  }, [allBuildings, selectedCity])

  useEffect(() => {
    setActiveSubmarkets(new Set(visibleSubmarkets))
  }, [selectedCity]) // eslint-disable-line

  const filteredBuildings = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return allBuildings.filter(b => {
      if (selectedCity !== 'All Cities' && b.city !== selectedCity) return false
      if (!activeSubmarkets.has(b.submarket)) return false
      if (showOnlyCustom && !b.isCustom) return false
      return (
        b.name.toLowerCase().includes(q) ||
        (b.location || '').toLowerCase().includes(q) ||
        (b.submarket || '').toLowerCase().includes(q)
      )
    })
  }, [allBuildings, selectedCity, activeSubmarkets, searchQuery, showOnlyCustom])

  const handleSelect = useCallback((building) => {
    setSelected(building)
    if (mapRef.current) {
      mapRef.current.panTo({ lat: building.lat, lng: building.lng })
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

  const handleAdd = useCallback((newBuildings, newCity) => {
    if (newCity) setCustomCities(prev => prev.includes(newCity) ? prev : [...prev, newCity])
    if (newBuildings.length > 0) setCustomBuildings(prev => [...prev, ...newBuildings])
  }, [])

  const handleDelete = useCallback((buildingName) => {
    if (window.confirm(`Remove "${buildingName}" from the map?`)) {
      setCustomBuildings(prev => prev.filter(b => b.name !== buildingName))
      setSelected(null)
    }
  }, [])

  const toggleSubmarket = (sm) => {
    setActiveSubmarkets(prev => {
      const next = new Set(prev)
      next.has(sm) ? next.delete(sm) : next.add(sm)
      return next
    })
  }

  const resetView = () => {
    setSelected(null)
    setSearchQuery('')
    setShowOnlyCustom(false)
    setActiveSubmarkets(new Set(visibleSubmarkets))
    navigateToCity(selectedCity)
  }

  const mapCenter = selectedCity === 'All Cities'
    ? INDIA_VIEW.center : (CITY_CONFIG[selectedCity]?.center || INDIA_VIEW.center)
  const mapZoom = selectedCity === 'All Cities'
    ? INDIA_VIEW.zoom : (CITY_CONFIG[selectedCity]?.zoom || INDIA_VIEW.zoom)

  if (loadError) return (
    <div style={errorStyle}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h2 style={{ margin: '8px 0 4px' }}>Map failed to load</h2>
      <p style={{ color: '#6B7280', fontSize: 14 }}>Check your <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>.env</code></p>
      <p style={{ color: '#6B7280', fontSize: 13 }}>Enable <strong>Maps JavaScript API</strong> and <strong>Geocoding API</strong> in Google Cloud Console.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ─── TOP CITY TAB BAR ─── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'white', borderBottom: '1px solid #E5E7EB',
        padding: '0 16px', overflowX: 'auto', flexShrink: 0,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', zIndex: 30,
        scrollbarWidth: 'none',
      }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#111827', marginRight: 20, whiteSpace: 'nowrap', letterSpacing: '-0.3px' }}>
          🏢 CW Map
        </div>
        {['All Cities', ...allCities].map(city => (
          <button key={city} onClick={() => navigateToCity(city)} style={{
            padding: '13px 15px', border: 'none', cursor: 'pointer', fontSize: 13,
            whiteSpace: 'nowrap', fontWeight: selectedCity === city ? 700 : 400,
            color: selectedCity === city ? '#2563EB' : '#6B7280',
            background: 'transparent',
            borderBottom: `2px solid ${selectedCity === city ? '#2563EB' : 'transparent'}`,
            transition: 'all 0.15s',
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
          boxShadow: '0 1px 4px rgba(37,99,235,0.3)',
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
            background: 'white', borderRight: '1px solid #E5E7EB',
            zIndex: 10, flexShrink: 0,
          }}>

            <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #F3F4F6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                    {selectedCity === 'All Cities' ? 'All Buildings' : selectedCity}
                  </div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                    {filteredBuildings.length} shown · {allBuildings.length} total
                    {customBuildings.length > 0 && ` · ${customBuildings.length} added`}
                  </div>
                </div>
                <button onClick={resetView} style={btnStyle}>↺ Reset</button>
              </div>
              <input
                type="text"
                placeholder="Search building or micromarket…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={searchStyle}
              />
            </div>

            {customBuildings.length > 0 && (
              <div style={{ padding: '8px 14px', borderBottom: '1px solid #F3F4F6' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#6B7280' }}>
                  <input type="checkbox" checked={showOnlyCustom} onChange={e => setShowOnlyCustom(e.target.checked)} />
                  Only show added buildings
                </label>
              </div>
            )}

            <div style={{ padding: '8px 14px', borderBottom: '1px solid #F3F4F6' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.07em', marginBottom: 6 }}>
                FILTER BY SUBMARKET
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <button onClick={() => setActiveSubmarkets(new Set(visibleSubmarkets))} style={{
                  fontSize: 10, padding: '3px 7px', borderRadius: 20,
                  border: '1.5px solid #2563EB', background: '#EFF6FF',
                  color: '#2563EB', cursor: 'pointer', fontWeight: 600,
                }}>All</button>
                {visibleSubmarkets.map(sm => {
                  const color = getSubmarketColor(sm)
                  const active = activeSubmarkets.has(sm)
                  const count = (selectedCity === 'All Cities' ? allBuildings : allBuildings.filter(b => b.city === selectedCity))
                    .filter(b => b.submarket === sm).length
                  return (
                    <button key={sm} onClick={() => toggleSubmarket(sm)} style={{
                      fontSize: 10, padding: '3px 7px', borderRadius: 20,
                      border: `1.5px solid ${active ? color : '#E5E7EB'}`,
                      background: active ? color + '18' : 'transparent',
                      color: active ? color : '#9CA3AF',
                      cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
                    }}>
                      {sm} <span style={{ opacity: 0.7 }}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
              {filteredBuildings.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '40px 16px' }}>
                  No buildings found.<br />
                  <button onClick={() => setShowAddModal(true)} style={{ marginTop: 10, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    + Add a building
                  </button>
                </div>
              ) : (
                filteredBuildings.map((b, i) => (
                  <BuildingCard key={i} building={b} onClick={handleSelect} isSelected={selected?.name === b.name} />
                ))
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

          {/* Legend */}
          <div style={{
            position: 'absolute', top: 10, left: showSidebar ? 30 : 50, right: 10,
            zIndex: 20, background: 'white', border: '1px solid #E5E7EB',
            borderRadius: 8, padding: '5px 12px',
            display: 'flex', gap: 14, alignItems: 'center',
            boxShadow: '0 1px 6px rgba(0,0,0,0.07)', fontSize: 11,
            overflowX: 'auto', flexShrink: 0,
          }}>
            {visibleSubmarkets.slice(0, 9).map(sm => {
              const count = filteredBuildings.filter(b => b.submarket === sm).length
              return (
                <div key={sm} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: getSubmarketColor(sm), flexShrink: 0 }} />
                  <span style={{ color: '#374151', fontWeight: 500 }}>{sm}</span>
                  <span style={{ color: '#9CA3AF' }}>{count}</span>
                </div>
              )
            })}
            {visibleSubmarkets.length > 9 && <span style={{ color: '#9CA3AF', whiteSpace: 'nowrap' }}>+{visibleSubmarkets.length - 9} more</span>}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid #F3F4F6', paddingLeft: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C3AED', flexShrink: 0 }} />
              <span style={{ color: '#7C3AED', fontSize: 10 }}>= manually added</span>
            </div>
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
              {filteredBuildings.map((b, i) => (
                <Marker
                  key={i}
                  position={{ lat: b.lat, lng: b.lng }}
                  icon={markerIcon(getSubmarketColor(b.submarket), b.isCustom)}
                  onClick={() => handleSelect(b)}
                  title={b.name}
                />
              ))}

              {selected && (
                <InfoWindow
                  position={{ lat: selected.lat, lng: selected.lng }}
                  onCloseClick={() => setSelected(null)}
                >
                  <div style={{ maxWidth: 250, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: 'white',
                        background: getSubmarketColor(selected.submarket),
                        borderRadius: 4, padding: '2px 7px',
                      }}>{selected.submarket}</span>
                      {selected.isCustom && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '2px 5px', borderRadius: 3 }}>
                          ADDED · {selected.accuracy} accuracy
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 8 }}>
                      {selected.name}
                    </div>
                    <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                      {[
                        ['🏙️ City',     selected.city],
                        ['📍 Location',  selected.location],
                        ['🏗️ Type',      selected.type],
                        ['⭐ Grade',     selected.grade],
                        ['📅 Year',      selected.year],
                        ['📐 Area',      formatArea(selected.area)],
                        ['👷 Developer', selected.developer],
                        ['💰 Rent',      selected.rent ? `₹${selected.rent}/sf` : null],
                      ].filter(([, v]) => v).map(([label, val]) => (
                        <tr key={label}>
                          <td style={{ color: '#6B7280', paddingBottom: 3, paddingRight: 8, whiteSpace: 'nowrap' }}>{label}</td>
                          <td style={{ color: '#111827', fontWeight: 500 }}>{val}</td>
                        </tr>
                      ))}
                    </table>
                    {selected.isCustom && (
                      <button onClick={() => handleDelete(selected.name)} style={{
                        marginTop: 10, fontSize: 11, color: '#DC2626',
                        background: '#FEF2F2', border: '1px solid #FECACA',
                        borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
                      }}>
                        🗑 Remove this building
                      </button>
                    )}
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

// ─── STYLES ──────────────────────────────────────────────────────────────────
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
