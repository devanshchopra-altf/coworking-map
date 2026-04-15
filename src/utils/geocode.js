/**
 * Geocodes a building using Google Maps Geocoding API.
 * Tries progressively looser queries if the specific one fails.
 */
export async function geocodeBuilding(name, micromarket, city, apiKey) {
  const queries = [
    `${name}, ${micromarket}, ${city}, India`,
    `${micromarket}, ${city}, India`,
    `${city}, India`,
  ]

  for (const query of queries) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
      const res  = await fetch(url)
      const data = await res.json()
      if (data.status === 'OK' && data.results.length > 0) {
        const loc = data.results[0].geometry.location
        // Add small random jitter so stacked buildings don't overlap
        const jitter = () => (Math.random() - 0.5) * 0.004
        return {
          lat: parseFloat((loc.lat + jitter()).toFixed(6)),
          lng: parseFloat((loc.lng + jitter()).toFixed(6)),
          geocodedFrom: query,
          accuracy: query === queries[0] ? 'high' : query === queries[1] ? 'medium' : 'low',
        }
      }
    } catch (err) {
      console.warn('Geocode attempt failed for:', query, err)
    }
  }
  return null
}

/**
 * Parse bulk CSV text. Each line: Building Name, Micromarket, City
 * Returns array of { name, micromarket, city }
 */
export function parseBulkCSV(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const parts = line.split(',').map(p => p.trim())
      return {
        name:        parts[0] || '',
        micromarket: parts[1] || '',
        city:        parts[2] || '',
      }
    })
    .filter(row => row.name && row.micromarket && row.city)
}
