# Gradle & JDK Configuration Reference

## Current Configuration

### Gradle Version
- **Version**: 8.11.1
- **Wrapper**: Located at `android/gradle/wrapper/gradle-wrapper.properties`
- **Distribution URL**: https://services.gradle.org/distributions/gradle-8.11.1-all.zip

### JDK Version
- **Installed**: Java Development Kit 25.0.2
- **Location**: `C:\Program Files\Java\jdk-25.0.2`
- **Build Tools**: Gradle 8.7.2

### Android SDK
- **Location**: `C:\Users\Nixon\AppData\Local\Android\Sdk`
- **Build Tools Version**: 35.0.0+
- **Target SDK**: Android 14 (API 34)
- **Min SDK**: Android 9 (API 28)

---

## Using Downloaded Gradle (If Current Version Incompatible)

### 1. Locate Downloaded Gradle
Check your Downloads folder:
```
C:\Users\Nixon\Downloads\gradle-X.X.X-all.zip
```

### 2. Extract Gradle
```powershell
# Option A: Extract to Program Files
$downloadPath = "C:\Users\Nixon\Downloads\gradle-X.X.X-all.zip"
$extractPath = "C:\gradle-X.X.X"
Expand-Archive -Path $downloadPath -DestinationPath $extractPath

# Option B: Extract to more permanent location
New-Item -ItemType Directory -Path "C:\tools" -Force
Expand-Archive -Path $downloadPath -DestinationPath "C:\tools\gradle-X.X.X"
```

### 3. Configure in Android Studio

#### Method A: Use Gradle Wrapper (Recommended)
Edit `android/gradle/wrapper/gradle-wrapper.properties`:
```ini
distributionUrl=file:///C:/tools/gradle-X.X.X/gradle-X.X.X-all.zip
```
Replace X.X.X with your downloaded version.

#### Method B: Use Bundled Gradle in Project
1. Copy extracted gradle folder to: `android/gradle-custom/`
2. File → Settings → Build, Execution, Deployment → Gradle
3. Select: "Use local gradle distribution"
4. Point to: `android/gradle-custom/`
5. Click Apply

#### Method C: Set GRADLE_HOME Environment Variable
```powershell
# Set environment variable
$env:GRADLE_HOME = "C:\tools\gradle-X.X.X"
[Environment]::SetEnvironmentVariable("GRADLE_HOME", "C:\tools\gradle-X.X.X", "User")

# Configure in IDE: File → Settings → Gradle
# Select: "Specified location"
# Set to: $env:GRADLE_HOME
```

---

## Using Downloaded JDK (If Current Version Incompatible)

### 1. Locate Downloaded JDK
Check your Downloads folder:
```
C:\Users\Nixon\Downloads\jdk-XX-windows-x64_bin.zip
    or
C:\Users\Nixon\Downloads\openjdk-XX-windows-x64.tar.gz
```

### 2. Extract JDK
```powershell
# Extract to Program Files
$downloadPath = "C:\Users\Nixon\Downloads\jdk-XX-windows-x64_bin.zip"
$extractPath = "C:\Program Files\Java"

Expand-Archive -Path $downloadPath -DestinationPath $extractPath
# Rename folder if needed
Rename-Item "$extractPath\jdk-XX" "$extractPath\jdk-XX.X.X"
```

### 3. Configure JDK in Android Studio

**File → Settings → Languages & Frameworks → Android SDK → Gradle Settings**

1. Find **Gradle JDK**
2. Click dropdown → "Add JDK"
3. Select: "Local JDK"
4. Navigate to downloaded JDK:
   ```
   C:\Program Files\Java\jdk-XX.X.X
   ```
5. Click OK

### 4. Update JAVA_HOME Environment Variable
```powershell
# Update to use new JDK
$env:JAVA_HOME = "C:\Program Files\Java\jdk-XX.X.X"
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Java\jdk-XX.X.X", "User")

# Verify
Write-Host $env:JAVA_HOME
```

---

## Gradle Build Properties

### Optimize gradle.properties

Edit `android/gradle.properties` for better performance:

```ini
# Maximum heap memory for Gradle daemon
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m

# Enable parallel builds
org.gradle.parallel=true

# Enable build cache
org.gradle.caching=true

# Use daemon for faster builds
org.gradle.daemon=true

# Disable aapt2 if issues occur
# android.enableAapt2=false

# AndroidX support
android.useAndroidX=true

# Enable DataBinding/ViewBinding efficiently
android.databinding.enableV2=true
```

### Available JVM Arguments

```ini
# Increase memory for large builds
-Xmx2048m          # Maximum heap: 2GB
-Xms1024m          # Initial heap: 1GB
-XX:MaxMetaspaceSize=512m  # Metaspace for classes

# Optimize compilation
-XX:+UseG1GC       # Use G1 garbage collector
-XX:+CICompilerCount=2  # Limit compiler threads

# Disable unnecessary features
-XX:-PrintGCDetails
-XX:-PrintCompilation
```

---

## JDK Version Compatibility

### Gradle Version Support

| Gradle Version | Min Java | Max Java | Recommended |
|---|---|---|---|
| 8.11.1 | Java 8 | Java 23 | Java 17-21 |
| 8.7.2 | Java 8 | Java 21 | Java 17 |
| 8.0.x | Java 8 | Java 19 | Java 17 |
| 7.x | Java 8 | Java 18 | Java 11 |

**Current Setup**: Gradle 8.11.1 with Java 25 ✓

### If Using JDK from Downloads

Common versions:
- **JDK 25** (Latest) - Recommended for new builds
- **JDK 21** (LTS) - Stable, long-term support
- **JDK 17** (LTS) - Very stable, compatible with older Gradle
- **JDK 11** (LTS) - Legacy projects

Choose based on your project requirements.

---

## Troubleshooting

### Issue: Gradle Sync Fails with JDK Error

**Check current Java version:**
```powershell
java -version
javac -version
```

**Solution 1: Update JAVA_HOME**
```powershell
# Find correct JDK installation
Get-ChildItem "C:\Program Files\Java\" | Select-Object Name

# Set JAVA_HOME to correct location
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Java\jdk-25.0.2", "User")

# Restart IDE
```

**Solution 2: Specify JDK in Android Studio**
1. File → Settings → Languages & Frameworks → Android SDK
2. Gradle Settings → Gradle JDK
3. Select correct JDK path
4. Click Apply

**Solution 3: Force Gradle to Use Specific JDK**

Edit `android/gradle.properties`:
```ini
org.gradle.java.home=C:/Program Files/Java/jdk-25.0.2
```

### Issue: "Unsupported Java Version"

**Solution:**
1. Check Gradle requirements: `gradle wrapper --gradle-version=8.11.1`
2. Ensure JDK version is compatible
3. Update Gradle if needed:
   ```powershell
   cd android
   ./gradlew wrapper --gradle-version=8.11.1
   ```

### Issue: Build Tool Version Mismatch

**View available versions:**
```powershell
cd android
.\gradlew.bat --version
```

**Update Build Tools:**
```powershell
cd android
.\gradlew.bat --refresh-dependencies
```

### Issue: Gradle Daemon Issues

**Troubleshoot Daemon:**
```powershell
# Stop all Gradle daemons
cd android
.\gradlew.bat --stop

# Force rebuild without daemon
.\gradlew.bat assembleDebug --no-daemon

# Check daemon processes
$output = Get-Process | Where-Object {$_.ProcessName -like "*gradle*"}
$output | Stop-Process -Force
```

---

## Build Commands with Custom Gradle

### Using Downloaded Gradle from Command Line

```powershell
# Set path to downloaded gradle
$env:GRADLE_HOME = "C:\tools\gradle-8.11.1"
$env:PATH = "$env:GRADLE_HOME\bin;$env:PATH"

# Verify gradle is accessible
gradle --version

# Build using gradle command
cd android
gradle assembleDebug
gradle assembleRelease
```

### Using Gradle Wrapper (Always Works)

```powershell
cd android

# Windows batch script
.\gradlew.bat assembleDebug
.\gradlew.bat assembleRelease
.\gradlew.bat clean

# Or from IDE via npm
npm run android:debug
npm run android:release
```

---

## Performance Tuning

### Faster Builds

```ini
# In android/gradle.properties
# Build cache stores artifacts between builds
org.gradle.caching=true

# Parallel compilation
org.gradle.parallel=true

# Configure worker threads
org.gradle.workers.max=4

# Disable build features you don't use
android.enableBuildFeatures=false
android.buildFeatures.aidl=false
android.buildFeatures.renderScript=false
android.buildFeatures.resValues=false
```

### Monitor Gradle Build Time

```powershell
cd android

# Profile build
.\gradlew.bat assembleDebug --profile

# Output location: android/build/reports/profile/
# Open in browser to see breakdown
```

---

## Gradle Daemon Management

### List Running Daemons
```powershell
cd android
.\gradlew.bat --status
```

### Stop Daemons
```powershell
cd android
.\gradlew.bat --stop
```

### Run Without Daemon
```powershell
.\gradlew.bat assembleDebug --no-daemon
```

### Configure Daemon Timeout
Edit `~/.gradle/gradle.properties`:
```ini
# Daemon will stop after 30 minutes of inactivity (default 3 hours)
org.gradle.daemon.idletimeout=1800000
```

---

## References

- [Gradle Installation Guide](https://gradle.org/install/)
- [Gradle Configuration Documentation](https://gradle.org/guides/performance/)
- [Android Studio Gradle Configuration](https://developer.android.com/studio/build/gradle-config)
- [JDK Download Page](https://www.oracle.com/java/technologies/downloads/)

---

**Status:** ✅ Configured and Ready  
**Last Updated:** May 13, 2026

