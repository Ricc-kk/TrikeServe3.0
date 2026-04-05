# 🗺️ Google Maps Integration Guide

## ✅ Changes Made

### 1. **Installed Google Maps Library**
```bash
npm install @react-google-maps/api
```

### 2. **Updated RiderDashboard Component**
- ✅ Replaced Leaflet (OpenStreetMap) with Google Maps
- ✅ Added Google Maps `LoadScript` and `GoogleMap` components
- ✅ Implemented proper marker handling with InfoWindow
- ✅ Added graceful fallback UI when API key is missing
- ✅ Updated map options (zoom control, fullscreen, etc.)

### 3. **Updated Environment Configuration**
- ✅ Added `VITE_GOOGLE_MAPS_API_KEY` to `.env.local`

---

## 🔑 What You Need to Do

### Step 1: Get a Google Maps API Key

1. **Go to Google Cloud Console:**
   - Visit: https://console.cloud.google.com/

2. **Create a New Project (or select existing):**
   - Click on the project dropdown at the top
   - Click "NEW PROJECT"
   - Enter a project name (e.g., "TrikeServe")
   - Click "CREATE"

3. **Enable Required APIs:**
   - In the search bar, search for: `Maps JavaScript API`
   - Click on it → Click "ENABLE"
   - Go back and search for: `Places API`
   - Click on it → Click "ENABLE"

4. **Create an API Key:**
   - Go to "Credentials" in the left menu
   - Click "CREATE CREDENTIALS" → "API Key"
   - Copy the generated API key
   - (Optional) Click the edit icon to restrict the key to:
     - **API restrictions:** Maps JavaScript API, Places API
     - **Application restrictions:** Web browsers
     - **Website restrictions:** Add your domain(s)

5. **Copy Your API Key:**
   - You'll need this in the next step

---

### Step 2: Add API Key to `.env.local`

1. **Open `.env.local`** in the project root:
   ```
   TrikeServe3.0/
   └── TrikeServe3.0/
       ├── .env.local          ← Open this file
       ├── src/
       └── ...
   ```

2. **Find this line:**
   ```env
   VITE_GOOGLE_MAPS_API_KEY=
   ```

3. **Paste your API key:**
   ```env
   VITE_GOOGLE_MAPS_API_KEY=YOUR_ACTUAL_API_KEY_HERE
   ```

4. **Save the file**

---

### Step 3: Restart the Development Server

1. **Stop the current dev server** (if running):
   - Press `Ctrl + C` in the terminal

2. **Restart the dev server:**
   ```bash
   npm run dev
   ```

3. **Clear browser cache** (optional but recommended):
   - Open DevTools: `F12`
   - Right-click refresh button → "Empty cache and hard refresh"
   - Or: `Ctrl + Shift + Delete`

---

## 🗺️ Features Added

✅ **Full Screen Google Map** - Displays rider's current location (Manila)
✅ **Clickable Markers** - Click marker to see location details
✅ **Info Windows** - Shows lat/lng of selected marker
✅ **Map Controls** - Zoom, fullscreen, and map type controls
✅ **Error Handling** - Graceful UI if API key is missing
✅ **Responsive** - Works on all screen sizes
✅ **Places API Ready** - Ready for location autocomplete features

---

## 🧪 Testing

### To verify the map is working:

1. **Open rider dashboard**
2. **You should see:**
   - Full-screen Google Map showing Manila (14.5995, 120.9842)
   - A red marker at the center (your location)
   - "Go Online" button at the top
   - Other dashboard UI overlays
   - No error message about missing API key

3. **Try clicking the marker:**
   - Should show info window with coordinates
   - Click the X to close it

---

## 📍 Default Location

Currently set to **Manila, Philippines**:
```typescript
const mapCenter = { lat: 14.5995, lng: 120.9842 };
```

To change the default location, edit this in `RiderDashboard.tsx` at the top of the return statement.

---

## 🚀 Future Enhancements

Once Google Maps is working, you can add:

1. **Location Autocomplete** (Places API)
   ```typescript
   import { Autocomplete } from '@react-google-maps/api';
   ```

2. **Real Rider Geolocation**
   ```typescript
   navigator.geolocation.getCurrentPosition(...)
   ```

3. **Multiple Markers** (Pickup/Dropoff locations)
4. **Polylines** (Route drawing between locations)
5. **Distance Matrix** (Calculate distances between points)
6. **Custom Marker Icons** (Different colors for pickup/dropoff)

---

## ❌ Troubleshooting

### Map shows error message instead of map

**Problem:** `VITE_GOOGLE_MAPS_API_KEY is missing`

**Solution:**
1. Check `.env.local` has a valid API key
2. Make sure file is saved
3. Restart dev server
4. Clear browser cache

### Map shows blank/gray area

**Problem:** API key is invalid or doesn't have required APIs enabled

**Solution:**
1. Go to Google Cloud Console
2. Verify "Maps JavaScript API" is ENABLED
3. Verify "Places API" is ENABLED
4. Check API key restrictions don't block it
5. Generate a new API key if needed

### CORS error in console

**Problem:** API key restrictions might be too strict

**Solution:**
1. Go to Google Cloud Console → Credentials
2. Edit your API key
3. Under "Application restrictions" select "Web browsers"
4. Under "Website restrictions" add your localhost and domain
5. Save

### "LoadScript loading" spinner forever

**Problem:** Network issue or API key hasn't loaded

**Solution:**
1. Check internet connection
2. Verify API key in `.env.local`
3. Check browser console for errors (F12)
4. Try incognito window

---

## 📝 Files Modified

1. **src/app/components/rider/RiderDashboard.tsx**
   - Removed: Leaflet imports and MapContainer
   - Added: Google Maps LoadScript and GoogleMap
   - Added: Marker and InfoWindow components
   - Added: Error UI for missing API key
   - Added: selectedMarker state

2. **.env.local**
   - Added: `VITE_GOOGLE_MAPS_API_KEY` configuration

3. **package.json** (via npm install)
   - Added: `@react-google-maps/api` dependency

---

## 🎯 Status

✅ **Installation:** Complete
✅ **Component Integration:** Complete
✅ **Configuration:** Ready (waiting for API key)
⏳ **Testing:** Waiting for your API key

---

**Next Steps:**
1. Get Google Maps API key from Google Cloud Console ← **YOU NEED TO DO THIS**
2. Add key to `.env.local` ← **YOU NEED TO DO THIS**
3. Restart dev server ← **YOU NEED TO DO THIS**
4. Test the map in the rider dashboard ← **YOU CAN TEST THIS**

Let me know if you need any clarification or help with any of these steps!

