# CW Map — Commercial Buildings Map

Interactive multi-city map of commercial buildings, color-coded by submarket.

## Features
- 🗺️ Google Maps with 507 pre-loaded Delhi NCR buildings
- 🏙️ Multi-city: Delhi NCR, Mumbai, Bangalore, Hyderabad, Pune, Chennai + add more
- ➕ Add buildings manually (single) or in bulk (CSV paste) — auto-geocoded
- 🔍 Real-time search by building name, micromarket, or submarket
- 🏷️ Submarket filter toggle
- 💾 Manually added buildings persist in localStorage
- 🗑️ Remove manually added buildings

## Quick Start

```bash
npm install
cp .env.example .env
# Add your Google Maps API key to .env
npm run dev
```

## Required APIs (Google Cloud Console)
1. Maps JavaScript API
2. Geocoding API  ← needed for adding buildings

## Deploy to Vercel
1. Push to GitHub
2. Connect repo on vercel.com
3. Add env variable: VITE_GOOGLE_MAPS_API_KEY=your_key
4. Deploy

## User Guide
Open `USER_GUIDE.html` for full step-by-step instructions.
