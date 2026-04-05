# 🗺️ Google Maps Setup - Visual Guide

## Step 1️⃣: Get Google Maps API Key

```
┌─────────────────────────────────────────────────────┐
│ Open: https://console.cloud.google.com/             │
├─────────────────────────────────────────────────────┤
│                                                       │
│  1. Click "SELECT A PROJECT" dropdown               │
│  2. Click "NEW PROJECT"                             │
│  3. Enter name: "TrikeServe"                        │
│  4. Click "CREATE"                                  │
│                                                       │
└─────────────────────────────────────────────────────┘
```

## Step 2️⃣: Enable Required APIs

```
┌──────────────────────────────────────────────────┐
│ Search bar at top:                               │
├──────────────────────────────────────────────────┤
│                                                    │
│  Search: "Maps JavaScript API"                   │
│  ↓ Click result → ENABLE                        │
│                                                    │
│  Search: "Places API"                            │
│  ↓ Click result → ENABLE                        │
│                                                    │
└──────────────────────────────────────────────────┘
```

## Step 3️⃣: Create API Key

```
┌──────────────────────────────────────────────────┐
│ Left Menu → "Credentials"                        │
├──────────────────────────────────────────────────┤
│                                                    │
│  Click: CREATE CREDENTIALS                       │
│  Select: API Key                                 │
│  ↓                                               │
│  Your new API key appears                        │
│  Copy it! ← THIS IS IMPORTANT                    │
│                                                    │
└──────────────────────────────────────────────────┘
```

## Step 4️⃣: Add to .env.local

```
File: TrikeServe3.0/.env.local

┌───────────────────────────────────────────────────┐
│ # Supabase Configuration                          │
│ VITE_SUPABASE_URL=...                            │
│ VITE_SUPABASE_ANON_KEY=...                       │
│                                                    │
│ # Google Maps Configuration                       │
│ VITE_GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE  ← Paste │
│                                                    │
│ Save! (Ctrl + S)                                 │
└───────────────────────────────────────────────────┘
```

## Step 5️⃣: Restart Dev Server

```bash
# Terminal:
Ctrl + C                    ← Stop current server
npm run dev                 ← Start again
```

## Step 6️⃣: Test It! 🎉

```
1. Open browser
2. Go to Rider Dashboard
3. You should see:
   ✅ Full-screen Google Map
   ✅ Red marker in center
   ✅ Map controls (zoom, fullscreen, map type)
   ✅ NO error message

4. Click the red marker:
   ✅ Shows location details in popup
   ✅ Can close with X
```

---

## ⚠️ If You See This Error:

```
"⚠️ Google Maps API Key Missing"
```

**Solution:**
1. Open `.env.local`
2. Check `VITE_GOOGLE_MAPS_API_KEY=` is NOT empty
3. Make sure you pasted the actual key
4. Save the file
5. Restart dev server (Ctrl + C, then `npm run dev`)
6. Clear browser cache (Ctrl + Shift + Delete)

---

## 💡 Pro Tips

✅ **Restrict your API key for security:**
   - Go to Google Cloud Console
   - Edit your API key
   - Set Application restrictions to "Web browsers"
   - Set Website restrictions to your domain
   - Limit to Maps & Places APIs only

✅ **Test with different coordinates:**
   - Edit: `src/app/components/rider/RiderDashboard.tsx`
   - Find: `const mapCenter = { lat: 14.5995, lng: 120.9842 };`
   - Change the numbers to your location
   - Map will update instantly

✅ **Monitor API usage:**
   - Go to Google Cloud Console
   - Dashboard → APIs & Services
   - See your usage statistics

---

## 📝 Checklist

- [ ] Got API key from Google Cloud Console
- [ ] Added key to `.env.local`
- [ ] Saved `.env.local`
- [ ] Restarted dev server
- [ ] Tested in browser
- [ ] Map shows correctly
- [ ] Marker is clickable
- [ ] All working! ✅

---

**Need help?** Check `GOOGLE_MAPS_SETUP.md` for detailed troubleshooting.

