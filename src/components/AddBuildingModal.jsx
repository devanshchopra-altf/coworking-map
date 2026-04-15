import { useState } from 'react'
import { geocodeBuilding, parseBulkCSV } from '../utils/geocode'

const CITIES = [
  'Delhi NCR', 'Mumbai', 'Bangalore', 'Hyderabad', 'Pune', 'Chennai',
]

export default function AddBuildingModal({ onAdd, onClose, customCities, apiKey }) {
  const [mode, setMode]             = useState('single') // 'single' | 'bulk'
  const [status, setStatus]         = useState(null)     // { type: 'loading'|'success'|'error', msg }

  // Single form
  const [form, setForm] = useState({
    name: '', micromarket: '', city: '', grade: '',
    type: '', category: '', year: '', area: '', developer: '', rent: '',
  })

  // Bulk
  const [bulkText, setBulkText]     = useState('')
  const [bulkResults, setBulkResults] = useState([]) // [{...building, status}]
  const [newCityName, setNewCityName] = useState('')
  const [showAddCity, setShowAddCity] = useState(false)

  const allCities = [...CITIES, ...customCities.filter(c => !CITIES.includes(c))]

  // ── Single submit ──
  async function handleSingleSubmit() {
    if (!form.name.trim() || !form.micromarket.trim() || !form.city.trim()) {
      setStatus({ type: 'error', msg: 'Building name, micromarket, and city are required.' })
      return
    }
    setStatus({ type: 'loading', msg: `Geocoding "${form.name}"…` })

    const geo = await geocodeBuilding(form.name, form.micromarket, form.city, apiKey)
    if (!geo) {
      setStatus({ type: 'error', msg: 'Could not geocode this address. Check building name and micromarket.' })
      return
    }

    const building = {
      name:        form.name.trim(),
      location:    form.micromarket.trim(),
      submarket:   form.micromarket.trim(),
      city:        form.city.trim(),
      grade:       form.grade.trim() || 'A',
      type:        form.type.trim() || '',
      category:    form.category.trim() || '',
      year:        form.year ? parseInt(form.year) : null,
      area:        form.area ? parseInt(form.area) : null,
      developer:   form.developer.trim() || '',
      rent:        form.rent ? parseFloat(form.rent) : null,
      lat:         geo.lat,
      lng:         geo.lng,
      isCustom:    true,
      geocodedFrom: geo.geocodedFrom,
      accuracy:    geo.accuracy,
    }

    onAdd([building])
    setStatus({ type: 'success', msg: `✅ "${form.name}" added successfully (${geo.accuracy} accuracy)` })
    setForm({ name: '', micromarket: '', city: '', grade: '', type: '', category: '', year: '', area: '', developer: '', rent: '' })
  }

  // ── Bulk submit ──
  async function handleBulkSubmit() {
    const rows = parseBulkCSV(bulkText)
    if (rows.length === 0) {
      setStatus({ type: 'error', msg: 'No valid rows found. Format: Building Name, Micromarket, City' })
      return
    }
    setStatus({ type: 'loading', msg: `Geocoding ${rows.length} buildings…` })
    const results = rows.map(r => ({ ...r, status: 'pending', building: null }))
    setBulkResults([...results])

    const added = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      setBulkResults(prev => prev.map((r, j) => j === i ? { ...r, status: 'geocoding' } : r))
      const geo = await geocodeBuilding(row.name, row.micromarket, row.city, apiKey)
      if (geo) {
        const b = {
          name:       row.name,
          location:   row.micromarket,
          submarket:  row.micromarket,
          city:       row.city,
          grade:      'A',
          type:       '',
          category:   '',
          year:       null,
          area:       null,
          developer:  '',
          rent:       null,
          lat:        geo.lat,
          lng:        geo.lng,
          isCustom:   true,
          accuracy:   geo.accuracy,
        }
        added.push(b)
        setBulkResults(prev => prev.map((r, j) => j === i ? { ...r, status: 'done', building: b } : r))
      } else {
        setBulkResults(prev => prev.map((r, j) => j === i ? { ...r, status: 'failed' } : r))
      }
      // small delay to avoid rate limiting
      await new Promise(res => setTimeout(res, 200))
    }

    if (added.length > 0) onAdd(added)
    setStatus({ type: 'success', msg: `✅ ${added.length} of ${rows.length} buildings geocoded and added.` })
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1.5px solid #E5E7EB', fontSize: 13, outline: 'none',
    color: '#111827', background: 'white', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 3, display: 'block' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 560,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>

        {/* Modal header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>➕ Add Buildings</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Auto-geocodes from building name + micromarket</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6B7280' }}>✕</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6' }}>
          {['single', 'bulk'].map(m => (
            <button key={m} onClick={() => { setMode(m); setStatus(null); setBulkResults([]) }} style={{
              flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: mode === m ? '#EFF6FF' : 'white',
              color: mode === m ? '#2563EB' : '#6B7280',
              borderBottom: mode === m ? '2px solid #2563EB' : '2px solid transparent',
            }}>
              {m === 'single' ? '🏢 Single Building' : '📋 Bulk Add (CSV)'}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ── SINGLE MODE ── */}
          {mode === 'single' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>BUILDING NAME *</label>
                  <input style={inputStyle} placeholder="e.g. DLF Cyber Hub" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>MICROMARKET *</label>
                  <input style={inputStyle} placeholder="e.g. DLF Cyber City" value={form.micromarket}
                    onChange={e => setForm(f => ({ ...f, micromarket: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>CITY *</label>
                  <select style={inputStyle} value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}>
                    <option value="">Select city…</option>
                    {allCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>GRADE</label>
                  <select style={inputStyle} value={form.grade}
                    onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
                    <option value="">Select…</option>
                    <option value="A">A</option>
                    <option value="A+">A+</option>
                    <option value="B">B</option>
                    <option value="B+">B+</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>PROPERTY TYPE</label>
                  <input style={inputStyle} placeholder="e.g. IT Business park" value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>CATEGORY</label>
                  <select style={inputStyle} value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="">Select…</option>
                    <option value="IT">IT</option>
                    <option value="Non IT">Non IT</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>YEAR BUILT</label>
                  <input style={inputStyle} type="number" placeholder="e.g. 2022" value={form.year}
                    onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>AREA (sq ft)</label>
                  <input style={inputStyle} type="number" placeholder="e.g. 250000" value={form.area}
                    onChange={e => setForm(f => ({ ...f, area: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>DEVELOPER</label>
                  <input style={inputStyle} placeholder="e.g. DLF Ltd" value={form.developer}
                    onChange={e => setForm(f => ({ ...f, developer: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>RENT (₹/sf)</label>
                  <input style={inputStyle} type="number" placeholder="e.g. 120" value={form.rent}
                    onChange={e => setForm(f => ({ ...f, rent: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {/* ── BULK MODE ── */}
          {mode === 'bulk' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                background: '#F0FDF4', border: '1px solid #BBF7D0',
                borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534',
              }}>
                <strong>Format:</strong> One building per line → <code>Building Name, Micromarket, City</code><br />
                <strong>Example:</strong><br />
                <code>
                  RMZ Millenia, OMR, Chennai<br />
                  Bagmane Tech Park, CV Raman Nagar, Bangalore<br />
                  One BKC, Bandra Kurla Complex, Mumbai
                </code>
              </div>
              <div>
                <label style={labelStyle}>PASTE YOUR LIST</label>
                <textarea
                  value={bulkText}
                  onChange={e => { setBulkText(e.target.value); setBulkResults([]); setStatus(null) }}
                  placeholder="Building Name, Micromarket, City&#10;RMZ Millenia, OMR, Chennai&#10;Bagmane Tech Park, CV Raman Nagar, Bangalore"
                  style={{
                    ...inputStyle, height: 160, resize: 'vertical',
                    fontFamily: 'monospace', fontSize: 12,
                  }}
                />
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                  {parseBulkCSV(bulkText).length} valid rows detected
                </div>
              </div>

              {/* Bulk results */}
              {bulkResults.length > 0 && (
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                  {bulkResults.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderBottom: i < bulkResults.length - 1 ? '1px solid #F3F4F6' : 'none',
                      background: r.status === 'done' ? '#F0FDF4' : r.status === 'failed' ? '#FEF2F2' : 'white',
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>{r.micromarket} · {r.city}</div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>
                        {r.status === 'pending'   && <span style={{ color: '#9CA3AF' }}>Waiting…</span>}
                        {r.status === 'geocoding' && <span style={{ color: '#D97706' }}>📍 Geocoding…</span>}
                        {r.status === 'done'      && <span style={{ color: '#059669' }}>✅ {r.building?.accuracy}</span>}
                        {r.status === 'failed'    && <span style={{ color: '#DC2626' }}>❌ Failed</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Status message */}
          {status && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: status.type === 'error' ? '#FEF2F2' : status.type === 'success' ? '#F0FDF4' : '#EFF6FF',
              color:      status.type === 'error' ? '#DC2626' : status.type === 'success' ? '#059669' : '#2563EB',
              border:     `1px solid ${status.type === 'error' ? '#FECACA' : status.type === 'success' ? '#BBF7D0' : '#BFDBFE'}`,
            }}>
              {status.type === 'loading' && '⏳ '}{status.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

          {/* Add city inline */}
          <div>
            {showAddCity ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  style={{ ...inputStyle, width: 130, padding: '5px 8px' }}
                  placeholder="City name…"
                  value={newCityName}
                  onChange={e => setNewCityName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCityName.trim()) {
                      onAdd([], newCityName.trim())
                      setNewCityName('')
                      setShowAddCity(false)
                    }
                  }}
                />
                <button
                  onClick={() => { if (newCityName.trim()) { onAdd([], newCityName.trim()); setNewCityName(''); setShowAddCity(false) } }}
                  style={{ padding: '5px 10px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  Add
                </button>
                <button onClick={() => setShowAddCity(false)} style={{ padding: '5px 8px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setShowAddCity(true)} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                + Add new city
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: 'white', color: '#374151' }}>
              Cancel
            </button>
            <button
              onClick={mode === 'single' ? handleSingleSubmit : handleBulkSubmit}
              disabled={status?.type === 'loading'}
              style={{
                padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: status?.type === 'loading' ? '#93C5FD' : '#2563EB',
                color: 'white',
              }}
            >
              {status?.type === 'loading' ? 'Geocoding…' : mode === 'single' ? 'Add Building' : `Add ${parseBulkCSV(bulkText).length} Buildings`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
