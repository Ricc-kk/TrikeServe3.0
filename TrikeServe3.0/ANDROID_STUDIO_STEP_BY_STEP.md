# Android Studio: Step-by-Step Setup Guide

## 📖 Complete Guide to Open & Configure Android Studio

### STEP 1: Open Android Studio with TrikeServe Project

#### Method A: Using npm script (Recommended)
```powershell
cd "C:\Users\Nixon\AndroidStudioProjects\TrikeServe3.0\TrikeServe3.0\TrikeServe3.0"
npm run android:open
```
Android Studio will open automatically with the `android/` folder.

#### Method B: Manual open in Android Studio
1. **Launch Android Studio**
2. Click **File → Open**
3. Navigate to: `C:\Users\Nixon\AndroidStudioProjects\TrikeServe3.0\TrikeServe3.0\TrikeServe3.0\android`
4. Click **Open**

---

### STEP 2: Wait for Gradle Sync to Complete

When Android Studio opens:
1. **Wait** for "Gradle sync..." message to complete
2. **Check** the status bar at bottom (should say "Gradle sync successful")
3. **Expected time**: 1-3 minutes on first sync
4. **Do NOT close** Android Studio during sync

**What you should see:**
```
Status: Gradle sync successful
Project Files Indexed
Ready for development
```

---

### STEP 3: If Gradle Sync Fails

#### Issue: "Gradle JDK not found"
1. **File → Settings** (Edit → Settings on Mac)
2. Navigate to: **Languages & Frameworks → Android SDK**
3. Click **Gradle Settings**
4. Find: **Gradle JDK** dropdown
5. Select: `C:\Program Files\Java\jdk-25.0.2`
6. Click **Apply** then **OK**
7. **File → Invalidate Caches → Invalidate and Restart**
8. Wait for re-sync

#### Issue: "Android SDK not found"
1. **File → Settings → Languages & Frameworks → Android SDK**
2. Check: **SDK Platforms**
   - Ensure Android 14 (API 34) is ✓ checked
3. Check: **SDK Tools**
   - Ensure Android SDK Build-Tools is checked
4. Click **Apply** then **OK**

---

### STEP 4: Configure Run Configuration

This sets up what happens when you press the green "Run" button.

#### Steps:
1. **Top menu: Run → Edit Configurations**
2. Check if **"TrikeServe Debug"** appears in the left panel
3. If not, click **+** to create new
4. Select: **Android App**
5. Fill in:
   ```
   Name: TrikeServe Debug
   Module: app
   Activity: com.trikeserve.app.MainActivity
   Debugger type: Java
   ```
6. Click **Apply** and **OK**

#### Run Configuration is now saved!

---

### STEP 5: Connect Android Device or Setup Emulator

#### Option A: Connect Physical Device (Recommended for Testing)
1. **Connect Android phone via USB cable**
2. On your device:
   - Settings → About Phone
   - Tap "Build Number" 7 times
   - Go back, Developer Options now visible
   - Settings → Developer Options
   - Enable: **USB Debugging**
   - Connect to computer → Tap "Trust"
3. **Verify in Android Studio:**
   - Top bar dropdown should show your device
   - Or: View → Tool Windows → Device Manager

#### Option B: Use Android Emulator
1. **Tools → Virtual Device Manager**
2. Click **Create Device**
3. Select device type (e.g., Pixel 6)
4. Select Android version (API 34 recommended)
5. Click **Finish**
6. Click **Play** button to start emulator
7. Wait for Android OS to fully boot (2-3 minutes)
8. Device will appear in run target dropdown

---

### STEP 6: First Build & Run

#### Safe First Run:
1. **Top menu: Build → Clean Project**
   - Wait for completion
2. **Build → Rebuild Project**
   - Wait for completion (2-5 minutes)
   - Should see: "BUILD SUCCESSFUL"

#### If Build Fails:
- Read error message
- Check: `SETUP_BUILD_GUIDE.md` → Troubleshooting
- Or: `GRADLE_JDK_REFERENCE.md`
- Try clean rebuild:
  ```powershell
  cd android
  .\gradlew.bat clean
  .\gradlew.bat assembleDebug
  ```

#### Run on Device/Emulator:
1. **Select your device** from the device dropdown (top bar)
2. Click green **Run** button (or press Shift+F10)
3. Android Studio will:
   - Build the app
   - Package as APK
   - Install on device/emulator
   - Launch the app
4. **Wait 30-60 seconds** for app to appear

---

### STEP 7: Using the Debugger

#### Set Breakpoints:
1. Click on line number in code editor
2. A red circle appears (breakpoint set)
3. Click green **Debug** button (or press Shift+F9)
4. When app hits breakpoint, execution pauses
5. Inspect variables in Debug panel

#### Debug Controls:
- **Resume** (F9): Continue execution
- **Step Over** (F8): Next line in current function
- **Step Into** (F7): Enter function call
- **Step Out** (Shift+F8): Exit current function
- **Stop** (Ctrl+F2): Stop debugging

#### View Logs:
- **View → Tool Windows → Logcat**
- Filter by package name: `com.trikeserve.app`
- Shows all debugging output

---

### STEP 8: Edit Code & Test Changes

#### Web Changes:
1. Edit files in `src/` folder
2. Run: `npm run dev` in separate terminal
3. Changes auto-reload in browser (http://localhost:5173)

#### Android-specific Changes:
1. Edit files in `android/app/src/main/`
2. Run: `npm run android:sync` (if you modified src/)
3. Rebuild in Android Studio (Ctrl+F9)
4. Run (Shift+F10)

#### Test the Full Cycle:
1. Make a small UI change in `src/`
2. Terminal: `npm run android:sync`
3. Android Studio: Rebuild (Ctrl+F9)
4. Run (Shift+F10)
5. Verify the change appears on device

---

### STEP 9: Using Build Menu

#### Common Build Actions:
- **Build → Make Project** - Compile code
- **Build → Rebuild Project** - Clean + Compile
- **Build → Clean Project** - Delete build cache
- **Run → Run 'app'** - Build and install
- **Run → Debug 'app'** - Build, install, and debug
- **Run → Profile 'app'** - Run with profiler

#### Build Output Window:
- **Bottom panel: Build** tab shows each step
- Scroll down to see full output
- Look for "BUILD SUCCESSFUL" or error messages

---

### STEP 10: Testing Workflows

#### Workflow 1: Quick UI Test
```
1. Make change in src/
2. npm run build
3. npm run android:sync
4. Shift+F10 in Android Studio
5. See change on device in ~30 seconds
```

#### Workflow 2: Debugging Backend Logic
```
1. Open android/app/src/main/java/
2. Set breakpoint on line
3. Shift+F9 (Debug mode)
4. Trigger the action that hits breakpoint
5. Inspect variables in Debug panel
```

#### Workflow 3: Performance Profiling
```
1. Run → Profile 'app'
2. App launches with profiler attached
3. Profiler window shows: CPU, Memory, Network, Battery
4. Perform actions in app
5. View performance metrics in real-time
```

---

## 🎯 Keyboard Shortcuts Reference

### Build & Run
| Action | Shortcut |
|--------|----------|
| Run Application | Shift+F10 |
| Debug Application | Shift+F9 |
| Build Project | Ctrl+F9 |
| Rebuild Project | Ctrl+Shift+F9 |
| Stop Application | Ctrl+F2 |

### Debugging
| Action | Shortcut |
|--------|----------|
| Toggle Breakpoint | Ctrl+F8 |
| Resume Program | F9 |
| Step Over | F8 |
| Step Into | F7 |
| Step Out | Shift+F8 |
| Run to Cursor | Alt+F9 |

### Editing
| Action | Shortcut |
|--------|----------|
| Find in File | Ctrl+F |
| Replace in File | Ctrl+H |
| Go to Line | Ctrl+G |
| Go to Class | Ctrl+N |
| Go to File | Ctrl+Shift+N |
| Reformat Code | Ctrl+Alt+L |
| Organize Imports | Ctrl+Alt+O |

---

## 🔍 Important Code Locations

### Main Android Activity
```
android/app/src/main/java/com/trikeserve/app/MainActivity.java
```
This is the app entry point.

### Android Manifest
```
android/app/src/main/AndroidManifest.xml
```
App permissions and configuration.

### App Resources
```
android/app/src/main/res/
├── drawable/    # Images
├── layout/      # XML layouts
├── menu/        # Menu definitions
├── values/      # Colors, strings, dimens
└── mipmap/      # App icons
```

### Web Assets Embedded
```
android/app/src/main/assets/public/
```
Your `dist/` folder is copied here during `npm run android:sync`.

### Gradle Build Files
```
android/build.gradle              # Root build config
android/app/build.gradle          # App build config
android/gradle.properties         # Gradle settings
```

---

## ✅ Verification Checklist

After setup, verify:

**In Android Studio:**
- [ ] Project opened without errors
- [ ] Gradle sync completed successfully
- [ ] Run configuration "TrikeServe Debug" appears
- [ ] Device/Emulator shows in run target dropdown
- [ ] Green Run button is clickable

**In Code:**
- [ ] Can browse android/ files
- [ ] Can browse src/ files
- [ ] Can set breakpoints (line numbers clickable)
- [ ] Can see logcat output

**On Device/Emulator:**
- [ ] App installs after clicking Run
- [ ] App launches and shows content
- [ ] UI is responsive/interactive
- [ ] Logcat shows app output

---

## 🆘 Common Issues & Fixes

### Issue: "No devices found"
**Fix:**
1. Check USB cable connection
2. Verify USB Debugging is ON
3. Reboot device if needed
4. Run: `adb devices`
5. Check Device Manager icon in top menu

### Issue: "Wait for Gradle to finish indexing"
**Fix:**
- Just wait, usually 1-5 minutes
- Do not close Android Studio
- Do not interrupt the process
- Check progress bar at bottom

### Issue: "BUILD FAILED" on first run
**Fix:**
1. File → Invalidate Caches → Invalidate and Restart
2. Wait for re-indexing
3. Try Build → Clean Project
4. Then: Build → Rebuild Project
5. If still fails, check: `SETUP_BUILD_GUIDE.md`

### Issue: "Java.lang.OutOfMemoryError"
**Fix:**
Edit `android/gradle.properties`:
```ini
org.gradle.jvmargs=-Xmx4096m
```
Restart Android Studio.

### Issue: App crashes on launch
**Fix:**
1. View → Tool Windows → Logcat
2. Filter by: `com.trikeserve.app`
3. Look for RED error messages
4. Copy error to search
5. Follow error trace to fix

---

## 💡 Pro Tips

### Tip 1: Faster Builds
- Use: Build → Make Project (not Rebuild)
- Rebuild only when needed
- Enable: Instant Run (enabled by default)

### Tip 2: Multiple Emulators
1. Virtual Device Manager → Create Device
2. Create 2-3 devices with different screen sizes
3. Run on all simultaneously for testing

### Tip 3: Monitor Device Temperature
1. View → Tool Windows → Device Manager
2. Shows CPU usage, memory, temperature
3. Good indicator of performance issues

### Tip 4: Browse Device Files
1. View → Tool Windows → Device File Explorer
2. Browse device file system
3. Pull/push files to device

### Tip 5: Screenshot from Device
1. View → Tool Windows → Device Manager
2. Right-click device → Screenshot
3. Saves to your computer

---

## 📚 Next Steps

1. **Follow STEP 1** above to open Android Studio
2. **Follow STEP 2** and wait for Gradle sync
3. **Follow STEP 3** if sync fails
4. **Follow STEP 4** to configure run configuration
5. **Follow STEP 5** to connect device
6. **Follow STEP 6** to run app for first time
7. **Success!** - You're developing! 🎉

---

## 🎓 Online Resources

- [Android Studio User Guide](https://developer.android.com/studio)
- [Debugging Guide](https://developer.android.com/studio/debug/)
- [Performance Profiler](https://developer.android.com/studio/profile/)
- [Emulator Documentation](https://developer.android.com/studio/run/emulator)

---

**Last Updated:** May 13, 2026  
**Difficulty:** Beginner-friendly  
**Time to Complete:** 15-30 minutes  
**Result:** Fully configured development environment ✅

