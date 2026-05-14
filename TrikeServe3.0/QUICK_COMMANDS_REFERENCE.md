# TrikeServe 3.0 - Quick Build Commands Reference

## 🚀 Essential Commands (Copy & Paste Ready)

### Initial Setup (One-Time)
```powershell
# Navigate to project
cd "C:\Users\Nixon\AndroidStudioProjects\TrikeServe3.0\TrikeServe3.0\TrikeServe3.0"

# Install dependencies
npm install

# Build web app
npm run build

# Setup Android
npm run android:sync
```

### Daily Development Workflow

```powershell
# For Web Development
npm run dev                    # Start dev server (http://localhost:5173)

# For Android Development
npm run android:sync          # Update Android files after web changes
npm run android:open          # Open Android Studio

# For Building APK
npm run android:debug         # Build debug APK
npm run android:install:debug # Build and install debug APK to device
npm run android:release       # Build release APK
```

---

## 🔧 Direct Gradle Commands

```powershell
cd "C:\Users\Nixon\AndroidStudioProjects\TrikeServe3.0\TrikeServe3.0\TrikeServe3.0\android"

# Clean build
.\gradlew.bat clean

# Build debug APK
.\gradlew.bat assembleDebug

# Build release APK
.\gradlew.bat assembleRelease

# Install debug APK to device
.\gradlew.bat installDebug

# Run tests
.\gradlew.bat connectedAndroidTest

# View all available tasks
.\gradlew.bat tasks
```

---

## 📋 Full Command Reference

| Command | Purpose | Output |
|---------|---------|--------|
| `npm install` | Install npm dependencies | `node_modules/` folder |
| `npm run dev` | Start web dev server | http://localhost:5173 |
| `npm run build` | Build web for production | `dist/` folder |
| `npm run android:sync` | Sync web assets to Android | Updates android/ folder |
| `npm run android:open` | Open Android Studio | Launches Android Studio |
| `npm run android:debug` | Build debug APK | `android/app/build/outputs/apk/debug/` |
| `npm run android:install:debug` | Build & install APK | Installs on connected device |
| `npm run android:release` | Build release APK | `android/app/build/outputs/apk/release/` |

---

## 🎯 Common Workflows

### Workflow 1: Web Development Only
```powershell
cd "C:\Users\Nixon\AndroidStudioProjects\TrikeServe3.0\TrikeServe3.0\TrikeServe3.0"

npm run dev
# Open browser to http://localhost:5173
# Edit source files in src/
# HMR (Hot Module Reloading) automatically refreshes browser
```

### Workflow 2: Quick Android Build & Test
```powershell
# Terminal 1: Keep web dev server running
npm run dev

# Terminal 2: Build and run on device
npm run android:sync
npm run android:install:debug

# Or open Android Studio and use Run button
npm run android:open
```

### Workflow 3: Full Build Pipeline
```powershell
# 1. Install/update dependencies
npm install

# 2. Build web
npm run build

# 3. Sync to Android
npm run android:sync

# 4. Build APK
npm run android:debug

# Result: APK ready at android/app/build/outputs/apk/debug/
```

### Workflow 4: Create Release APK
```powershell
# 1. Full build
npm install
npm run build
npm run android:sync

# 2. Build release
npm run android:release

# 3. APK location: android/app/build/outputs/apk/release/app-release.apk

# Optional: Sign APK (if not already signed)
cd android/app/build/outputs/apk/release/
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 ^
  -keystore keystore/release-key.jks app-release.apk release_key
```

---

## 🐛 Debugging & Development

### Monitor Build Output
```powershell
# Verbose gradle output
cd android
.\gradlew.bat assembleDebug --info

# Very verbose
.\gradlew.bat assembleDebug --debug

# Gradle profiling
.\gradlew.bat assembleDebug --profile
# Check: android/build/reports/profile/
```

### View Web Logs
```powershell
# Browser DevTools: Press F12 in web app
# Check Console for errors and logs
```

### View Android Logs
```powershell
# Method 1: Android Studio Logcat
# View → Tool Windows → Logcat
# Filter by "com.trikeserve.app"

# Method 2: ADB Command Line
adb logcat | findstr TrikeServe

# Method 3: Real-time Android logs
adb logcat -v threadtime
```

---

## 🔌 Device Management

```powershell
# List connected devices
adb devices

# Show device info
adb shell getprop ro.build.version.release          # Android version
adb shell getprop ro.product.model                   # Device model
adb shell getprop ro.esim.aid                        # IMEI

# Install specific APK
adb install "./android/app/build/outputs/apk/debug/app-debug.apk"

# Uninstall app
adb uninstall com.trikeserve.app

# Push files to device
adb push C:\local\path\ /sdcard/path/

# Pull files from device
adb pull /sdcard/path/ C:\local\path\

# Take screenshot
adb shell screencap -p > screenshot.png

# Clear app data
adb shell pm clear com.trikeserve.app

# Start app
adb shell am start -n com.trikeserve.app/.MainActivity

# Stop app
adb shell am force-stop com.trikeserve.app
```

---

## 📊 Build Optimization

### Faster Builds
```powershell
cd android

# Disable unused resources
.\gradlew.bat assembleDebug -x lint

# Build only changed modules
.\gradlew.bat assembleDebug --build-cache

# Parallel build
.\gradlew.bat assembleDebug -x test -j 4
```

### Build Size Optimization
```powershell
# Analyze APK size
.\gradlew.bat analyzeApk

# Check what's in the APK
$apk = ".\app\build\outputs\apk\debug\app-debug.apk"
Expand-Archive $apk -DestinationPath apk-contents
```

---

## 🔄 Sync & Update

### Update Dependencies
```powershell
# Check npm updates
npm outdated

# Update npm packages
npm update

# Force update
npm install --force

# Re-sync Android after changes
npm run android:sync
```

### Reload Android Studio
```powershell
# If gradle cache is corrupted
cd android
.\gradlew.bat clean

# Full clean
Remove-Item -Path build, app/build -Recurse -Force

# Rebuild
.\gradlew.bat assembleDebug
```

---

## ⚡ PowerShell Alias Setup (Optional)

Add these to your PowerShell profile for faster typing:

```powershell
# Edit PowerShell profile
notepad $PROFILE

# Add these aliases
Set-Alias -Name tsbuild -Value { npm run build }
Set-Alias -Name tsdev -Value { npm run dev }
Set-Alias -Name tsandroid -Value { npm run android:sync }
Set-Alias -Name tsdebug -Value { npm run android:debug }
Set-Alias -Name tsinstall -Value { npm run android:install:debug }

# Save and reload profile
. $PROFILE
```

Usage:
```powershell
tsbuild          # Instead of: npm run build
tsdev            # Instead of: npm run dev
tsandroid        # Instead of: npm run android:sync
tsdebug          # Instead of: npm run android:debug
tsinstall        # Instead of: npm run android:install:debug
```

---

## 🆘 Emergency Fixes

### Everything is Broken - Full Clean Build
```powershell
cd "C:\Users\Nixon\AndroidStudioProjects\TrikeServe3.0\TrikeServe3.0\TrikeServe3.0"

# Clean npm
Remove-Item -Path node_modules -Recurse -Force
Remove-Item -Path package-lock.json

# Clean Android
cd android
.\gradlew.bat clean
cd ..

# Full rebuild
npm install
npm run build
npm run android:sync
```

### Gradle Daemon Stuck
```powershell
cd android

# Stop all daemons
.\gradlew.bat --stop

# Kill any remaining processes
Get-Process | Where-Object {$_.ProcessName -like "*java*"} | Stop-Process -Force

# Rebuild
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

### Port 5173 Already in Use (Web Server)
```powershell
# Use different port
npm run dev -- --port 5174

# Or find and kill process using port
Get-NetTCPConnection -LocalPort 5173 | Stop-Process -Force
```

### Out of Memory During Build
```powershell
# Increase heap in gradle.properties
cd android
# Edit android/gradle.properties
# Change: org.gradle.jvmargs=-Xmx2048m
# To:     org.gradle.jvmargs=-Xmx4096m

# Rebuild
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

---

## 📁 File Locations Quick Reference

| Item | Location |
|------|----------|
| Web source | `src/` |
| Web build output | `dist/` |
| Android project | `android/` |
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Release APK | `android/app/build/outputs/apk/release/app-release.apk` |
| Gradle cache | `~/.gradle/` |
| Android SDK | `C:\Users\Nixon\AppData\Local\Android\Sdk` |
| JDK | `C:\Program Files\Java\jdk-25.0.2` |

---

## ✅ Verification Checklist

Before testing, verify:
```powershell
# Check Node.js
node --version
npm --version

# Check Java
java -version

# Check Android SDK
$env:ANDROID_HOME
# Should output: C:\Users\Nixon\AppData\Local\Android\Sdk

# Verify project structure
Test-Path "android/app" # Should be True
Test-Path "src/" # Should be True
Test-Path "dist/" # Should be True after build
```

---

## 💡 Tips & Tricks

### Run Web & Android Simultaneously
```powershell
# Terminal 1
npm run dev

# Different Terminal 2
npm run android:debug

# Or in VS Code/Android Studio, use the built-in terminal split
```

### Hot Reload While Developing
- Web changes: Vite does auto-reload (HMR)
- Android changes: Run `npm run android:sync` then rebuild
- Gradle changes: Close and reopen Android Studio

### Reduce Build Time
1. Use `--no-daemon` only when necessary
2. Enable Gradle build cache: `org.gradle.caching=true`
3. Disable unused features in `gradle.properties`
4. Use SSD for better I/O

### Monitor Gradle Builds
```powershell
cd android
.\gradlew.bat assembleDebug --profile
# Open: android/build/reports/profile/profile-2024-xx-xx-xx-xx-xx/index.html
```

---

## 🔗 Useful Resources

- [npm Documentation](https://docs.npmjs.com/)
- [Vite Documentation](https://vitejs.dev/)
- [Capacitor Documentation](https://capacitorjs.com/docs/)
- [Gradle Documentation](https://gradle.org/guides/)
- [Android Studio Guides](https://developer.android.com/studio)

---

**Last Updated:** May 13, 2026  
**Tested On:** Windows PowerShell 5.1  
**Status:** ✅ Ready to Use

