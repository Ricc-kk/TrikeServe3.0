# 📝 .env.local - Setup Instructions

## Current State of Your .env.local

Your file currently looks like this:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://azmzuucnfqqymnunntmw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bXp1dWNuZnFxeW1udW5udG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODgxODgsImV4cCI6MjA5MDg2NDE4OH0.ZuLt9mfyg41z1KO4PqA5w9dRxfArK8AoQiKV2AJ3LDg

# Google Maps Configuration
# Get your API key from: https://console.cloud.google.com/
# 1. Create a new project or select an existing one
# 2. Enable "Maps JavaScript API" and "Places API"
# 3. Create an API key (Credentials > Create Credentials > API Key)
# 4. Restrict the key to web browsers
# 5. Paste your API key below
VITE_GOOGLE_MAPS_API_KEY=
```

---

## What to Do

### 1. Go to Google Cloud Console

**URL:** https://console.cloud.google.com/

### 2. Get Your API Key

After following the steps in the comments above, you'll get something like:

```
AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q
```

It will look like a random string of letters, numbers, and special characters.

### 3. Update .env.local

Find this line:
```
VITE_GOOGLE_MAPS_API_KEY=
```

And replace it with YOUR key:
```
VITE_GOOGLE_MAPS_API_KEY=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q
```

### 4. Save the File

Press: `Ctrl + S`

### 5. Restart Dev Server

In terminal:
```
Ctrl + C           (stop current server)
npm run dev        (start new server)
```

---

## Example

### BEFORE:
```env
VITE_GOOGLE_MAPS_API_KEY=
```

### AFTER:
```env
VITE_GOOGLE_MAPS_API_KEY=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q
```

---

## ✅ Verification

Once you've updated the file:

1. **Check the file is saved** (look for the dot next to filename in editor)
2. **Restart dev server** (Ctrl + C, then `npm run dev`)
3. **Open rider dashboard** in browser
4. **You should see** the Google Map (not an error message)

---

## 🔒 Security Notes

✅ **DO:**
- Keep your API key private
- Add website restrictions in Google Cloud Console
- Monitor your API usage
- Set billing alerts

❌ **DON'T:**
- Share your API key publicly
- Commit it to GitHub without encryption
- Leave it unrestricted

---

## 📋 Checklist

- [ ] Got API key from Google Cloud Console
- [ ] Opened `.env.local` file
- [ ] Found `VITE_GOOGLE_MAPS_API_KEY=` line
- [ ] Pasted API key after the `=`
- [ ] Saved the file (Ctrl + S)
- [ ] Restarted dev server
- [ ] Opened rider dashboard
- [ ] Saw Google Map (not error)
- [ ] Tested clicking the marker

---

## 🆘 Troubleshooting

### Error: "Google Maps API Key Missing"

**Problem:** The .env.local file doesn't have the API key

**Solution:**
1. Open `.env.local`
2. Make sure `VITE_GOOGLE_MAPS_API_KEY=` is NOT empty
3. Paste your actual API key
4. Save file
5. Restart server

### Error: "Maps JavaScript API is not enabled"

**Problem:** You didn't enable the API in Google Cloud Console

**Solution:**
1. Go to https://console.cloud.google.com/
2. Search for "Maps JavaScript API"
3. Click "ENABLE"

### Error: "API Key Restrictions"

**Problem:** Your API key has restrictions preventing its use

**Solution:**
1. Go to Google Cloud Console → Credentials
2. Edit your API key
3. Under "API restrictions" make sure "Maps JavaScript API" is selected
4. Under "Application restrictions" select "Web browsers"
5. Save

---

## 📞 Got Help?

**File Location:** `TrikeServe3.0/.env.local`

**Other guides:**
- `GOOGLE_MAPS_QUICK_START.md` - Quick reference
- `GOOGLE_MAPS_SETUP.md` - Detailed guide
- `GOOGLE_MAPS_VISUAL_GUIDE.md` - Step-by-step with pictures

