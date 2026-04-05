# 🔧 CRITICAL: Complete Dev Server Restart Guide

## Problem
You're still getting "supabaseKey is required" error even though `.env.local` has been updated.

## Root Cause
The **development server has not been restarted** since updating `.env.local`. Vite caches environment variables at startup.

---

## ✅ COMPLETE FIX (Follow EXACTLY)

### **STEP 1: Close Your Terminal Completely**
- Close the terminal where `npm run dev` is running
- Close ALL terminal/PowerShell windows
- (Don't just press Ctrl+C - actually close the window)

### **STEP 2: Delete Vite Cache**

**Option A: Using PowerShell (Recommended)**
```powershell
# Navigate to your project
cd "C:\Users\Mayo\Desktop\TrikeServe3.0\TrikeServe3.0"

# Delete the Vite cache
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue

# Verify deletion (optional)
if (!(Test-Path node_modules\.vite)) {
    Write-Host "✅ .vite cache deleted successfully"
} else {
    Write-Host "⚠️ Cache still exists, trying again..."
    Remove-Item -Recurse -Force node_modules\.vite
}
```

**Option B: Manual File Delete**
1. Open File Explorer
2. Navigate to: `C:\Users\Mayo\Desktop\TrikeServe3.0\TrikeServe3.0\node_modules`
3. Find `.vite` folder
4. Delete it
5. Close File Explorer

### **STEP 3: Open Fresh PowerShell Terminal**
- Open PowerShell (fresh window, not the old one)
- Navigate to project:
```powershell
cd "C:\Users\Mayo\Desktop\TrikeServe3.0\TrikeServe3.0"
```

### **STEP 4: Start Dev Server**
```powershell
npm run dev
```

**Watch for this message in console:**
```
[Supabase Init] Checking environment variables...
[Supabase Init] VITE_SUPABASE_URL: ✅ Set
[Supabase Init] VITE_SUPABASE_ANON_KEY: ✅ Set
[Supabase Init] ✅ All credentials loaded successfully
```

✅ **If you see both checkmarks, you're good!**
❌ **If you see missing, go back to Step 2**

### **STEP 5: Clear Browser Cache**
In your browser (Chrome/Firefox/Edge):
- Press `Ctrl+Shift+Delete`
- Select "All time"
- Clear browsing data
- Close all tabs and restart browser

### **STEP 6: Test**
1. Go to `http://localhost:5173` (or your dev server URL)
2. Login as business user
3. Go to Orders page
4. **You should see orders loading!** ✅

---

## Troubleshooting

### Still Getting "supabaseKey is required"?

**Check 1: Is `.env.local` in the correct location?**
```powershell
# Run this command:
Get-Content "C:\Users\Mayo\Desktop\TrikeServe3.0\TrikeServe3.0\.env.local"

# You should see:
# VITE_SUPABASE_URL=https://azmzuucnfqqymnunntmw.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...
```

**Check 2: Did you actually restart the dev server?**
- Press Ctrl+C in terminal
- Wait 2 seconds
- Run `npm run dev` again
- Look for the ✅ checkmarks in console

**Check 3: Did you clear browser cache?**
- Press Ctrl+Shift+Delete
- Select "All time"
- Check "Cookies and other site data"
- Check "Cached images and files"
- Click Clear

### Console shows "Missing Supabase credentials"?

This means `.env.local` wasn't loaded. Try:
```powershell
# Stop server (Ctrl+C)
# Delete cache
Remove-Item -Recurse -Force node_modules\.vite

# Restart
npm run dev
```

---

## What Should You See?

### ✅ Console Output (Good)
```
[Supabase Init] Checking environment variables...
[Supabase Init] VITE_SUPABASE_URL: ✅ Set
[Supabase Init] VITE_SUPABASE_ANON_KEY: ✅ Set
[Supabase Init] ✅ All credentials loaded successfully
vite v5.0.0 building for production...
```

### ❌ Console Output (Bad - Means you missed a step)
```
[Supabase Init] Checking environment variables...
[Supabase Init] VITE_SUPABASE_URL: ❌ Missing
[Supabase Init] VITE_SUPABASE_ANON_KEY: ❌ Missing
Error: Missing Supabase credentials: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

---

## Quick Checklist

- [ ] **CLOSED** all terminal windows completely
- [ ] **DELETED** the `.vite` folder in node_modules
- [ ] **OPENED** fresh PowerShell window
- [ ] **NAVIGATED** to project directory
- [ ] **STARTED** dev server with `npm run dev`
- [ ] **VERIFIED** both environment variables loaded (✅ checkmarks)
- [ ] **CLEARED** browser cache (Ctrl+Shift+Delete)
- [ ] **REFRESHED** browser page (F5)
- [ ] **LOGGED IN** as business user
- [ ] **NAVIGATED** to Orders page
- [ ] **VERIFIED** orders appear without error ✅

---

## Still Not Working?

If after doing ALL the steps above you still see the error:

1. **Verify `.env.local` content:**
```powershell
Get-Content .env.local | Select-String "VITE_SUPABASE"
```

Should output:
```
VITE_SUPABASE_URL=https://azmzuucnfqqymnunntmw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

2. **Check if Supabase is accessible:**
```powershell
$url = "https://azmzuucnfqqymnunntmw.supabase.co"
Invoke-WebRequest -Uri $url -UseBasicParsing | Select-Object StatusCode
# Should return: StatusCode : 200
```

3. **Verify npm can read env file:**
```powershell
npm run dev 2>&1 | findstr "Supabase"
# Should show environment variable checks
```

---

## Last Resort

If nothing works:

1. **Completely uninstall and reinstall node_modules:**
```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
npm run dev
```

2. **Check if file has BOM or encoding issues:**
   - Open `.env.local` in Notepad++
   - Encoding should be: **UTF-8 without BOM**
   - If not, save as UTF-8 without BOM

---

## Success Indicator

When it's working, you'll see:
1. ✅ No "supabaseKey is required" error
2. ✅ Orders page loads
3. ✅ Business owner sees their restaurant's orders
4. ✅ Console shows successful Supabase connections

**You've got this! Follow the steps exactly and it will work.** 🚀

