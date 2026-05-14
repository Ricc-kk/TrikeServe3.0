# Android Studio Configuration Guide for TrikeServe 3.0

## Quick Configuration Checklist

### Step 1: Configure Gradle JDK
**File → Settings → Languages & Frameworks → Android SDK**

1. Go to **Gradle Settings** tab
2. Set **Gradle JDK** to: `C:\Program Files\Java\jdk-25.0.2`
3. Click **Apply** then **OK**

### Step 2: Configure Android SDK
**File → Settings → Languages & Frameworks → Android SDK**

1. Check **SDK Platforms**:
   - Android 14 (API 34) ✓
   - Android 13 (API 33) ✓ (recommended for compatibility)
   
2. Check **SDK Tools**:
   - Android SDK Build-Tools 35.0.0+
   - Android Emulator (optional)
   - Intel x86 Emulator Accelerator (HAXM) - if using Intel CPU

### Step 3: Open Run Configurations
**Run → Edit Configurations**

Verify these configurations exist:
- ✓ TrikeServe Debug
- ✓ TrikeServe Release (optional)

### Step 4: Gradle Settings
**File → Settings → Build, Execution, Deployment → Build Tools → Gradle**

Recommended settings:
- **Gradle JDK**: `C:\Program Files\Java\jdk-25.0.2` ✓
- **Offline mode**: Unchecked (unless using offline builds)
- **Gradle VM options**: `-Xmx2048m` (increase if running out of memory)

### Step 5: Code Style & Inspections
**File → Settings → Editor → Code Style**

- Language: Java
- Scheme: Project (or Default)

### Step 6: Version Control (Optional)
**File → Settings → Version Control → Git**

- Ensure Git is detected
- Path to Git executable should auto-detect

---

## Running Configurations

### Run Debug Configuration
1. Select: **Run > TrikeServe Debug** (or press Shift+F10)
2. Choose deployment target:
   - Connected Android device (USB debugging enabled)
   - Running Android emulator
3. Click **Run** (or **Debug** for debugging)

### Build Menu Options
- **Build → Make Project** - Build without installing
- **Build → Rebuild Project** - Clean + build
- **Build → Clean Project** - Clear build cache
- **Run → Run 'app'** - Build and install
- **Run → Debug 'app'** - Build, install, and debug

---

## Common Configuration Issues

### Issue: "Gradle DSL method not found: android()"
**Solution:**
1. Open `android/build.gradle`
2. Ensure `apply from: "variables.gradle"` is present
3. File → Invalidate Caches → Invalidate and Restart

### Issue: "Could not find com.android.tools.build:gradle:8.7.2"
**Solution:**
1. Check internet connection
2. File → Settings → HTTP Proxy
3. Ensure "No proxy" or proxy is correctly configured
4. Try syncing again: `npm run android:sync`

### Issue: "AndroidManifest.xml not found"
**Solution:**
1. Run `npm run android:sync`
2. File → Settings → Invalidate and Restart
3. Ensure `android/app/src/main/AndroidManifest.xml` exists

### Issue: Device not showing in Run Configuration
**Solution:**
1. Connect Android device via USB
2. Enable USB Debugging on device (Settings → Developer Options)
3. Check: `adb devices` in terminal
4. If device shows offline: `adb kill-server` then `adb devices`

---

## IDE Keyboard Shortcuts

| Action | Windows | macOS |
|--------|---------|-------|
| Run App | Shift+F10 | Control+R |
| Debug App | Shift+F9 | Control+D |
| Build Project | Ctrl+F9 | Cmd+F9 |
| Rebuild Project | Ctrl+Shift+F9 | Cmd+Shift+F9 |
| Stop Running App | Ctrl+F2 | Cmd+F2 |
| Toggle Breakpoint | Ctrl+F8 | Cmd+F8 |
| Resume Program | F9 | Cmd+Option+R |
| Step Over | F8 | F8 |
| Step Into | F7 | F7 |
| Open Run Configuration | Alt+Shift+F10 | Control+Option+R |

---

## Memory & Performance

### Optimize IDE Memory
**File → Settings → Appearance & Behavior → System Settings → Memory Settings**

Recommended settings:
- IDE heap size: 2048 MB (for projects this size)
- Code Cache: 512 MB

### Gradle Heap Size
Edit `android/gradle.properties`:
```ini
org.gradle.jvmargs=-Xmx2048m
```

### Disable Unnecessary Features
To speed up the IDE:
1. File → Settings → Plugins
2. Disable unused plugins (e.g., if not using Python, PHP, etc.)
3. Restart IDE

---

## Plugin Recommendations

Useful plugins for Android development:

1. **ADB Idea** - Quick device management
2. **GradleInside** - Gradle build visualization
3. **JsonToKotlin** - JSON to data class conversion
4. **SonarLint** - Code quality checking
5. **Rainbow Brackets** - Better code readability

Install: File → Settings → Plugins → Marketplace

---

## Multi-Device Testing

### Set Up Multiple Emulators
1. Tools → Virtual Device Manager
2. Create multiple devices with different:
   - Screen sizes
   - Android versions (API 33, 34)
   - Device types (phone, tablet)

### Run on All Devices
1. Run → Edit Configurations → TrikeServe Debug
2. Set **Deployment Target Options** → "All devices"
3. Run → it will install on all connected devices

### Test on Physical Devices
1. Enable USB Debugging on device
2. Connect via USB
3. Click "Trust" on the device prompt
4. Device appears in Run target selection

---

## Git Integration (Optional)

If version control is needed:

1. File → Settings → Version Control → Git
2. Click "Test" button to verify Git path
3. VCS → Enable Version Control Integration
4. Select: Git
5. VCS menu now has Git options:
   - Commit
   - Push
   - Pull
   - History
   - Branches
   - Merge

---

## Terminal Integration

Access terminal in IDE:

1. View → Tool Windows → Terminal (or Alt+F12)
2. Or click **Terminal** tab at bottom
3. Run commands directly:
   ```bash
   npm run build
   npm run android:sync
   ./gradlew assembleDebug
   ```

---

## Debugging Tips

### Set Breakpoints
1. Click line number in editor to set breakpoint
2. Run with Debug: Shift+F9
3. Execution pauses at breakpoint

### Inspect Variables
1. Hover over variable to preview value
2. Or View → Tool Windows → Debug → Variables
3. Type expression in Expressions window to evaluate

### View Logs
1. View → Tool Windows → Logcat
2. Filter: `com.trikeserve.app`
3. Use `logcat` AndroidStudio integration search

### Step Through Code
- F8 - Step over
- F7 - Step into
- Shift+F8 - Step out
- F9 - Resume

---

## Profiling & Performance

### Profile App
1. Run → Edit Configurations
2. Add option: Profiler
3. Run app
4. Profiler tool window shows:
   - CPU usage
   - Memory usage
   - Network activity
   - Battery usage

### Monitor Performance
1. View → Tool Windows → Profiler
2. Check:
   - Memory leaks
   - Slow frame rendering
   - Battery drain

---

## APK Analysis

### View Built APK
1. Build → Analyze APK
2. Select from: `android/app/build/outputs/apk/debug/` or `/release/`
3. View:
   - File sizes
   - Method count
   - Resource breakdown

---

## Project Structure in IDE

**Project View Settings:** View → Project Structure

```
TrikeServe
├── android/ (Android Module)
│   ├── app/ (Main App Module)
│   │   ├── manifests/
│   │   ├── java/
│   │   ├── kotlin/
│   │   └── res/
│   ├── capacitor-android/
│   └── build.gradle
├── src/ (Web Source - for reference)
└── build/ (Generated)
```

To switch views:
- **Android View** - Android project structure
- **Project View** - File system structure

---

**Last Updated:** May 13, 2026  
**Compatibility:** Android Studio Koala 2024.1.1 or later

