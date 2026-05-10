# Android + Web Setup

This project is a Vite web app wrapped with Capacitor for Android.

## What is configured
- Web build output: `dist/`
- Capacitor Android project: `android/`
- Android SDK path: `C:\Users\Mayo\AppData\Local\Android\Sdk`
- Gradle JDK: `C:\Program Files\Java\jdk-25.0.2`
- Gradle wrapper: `android/gradle/wrapper/gradle-wrapper.properties` (Gradle 8.11.1)

## Web workflow
```powershell
npm install
npm run build
npm run dev
```

## Android workflow
```powershell
npm run android:sync
npm run android:open
```

## Android Studio
1. Open the `android/` folder in Android Studio.
2. Use the project Gradle JDK set to:
   `C:\Program Files\Java\jdk-25.0.2`
3. Run the `app` configuration.
4. For debug builds, use the `app` module or run:
```powershell
cd android
.\gradlew.bat assembleDebug
```

## Useful commands
```powershell
npm run android:debug
npm run android:install:debug
npm run android:release
```

## If Android Studio says the JDK is incompatible
Use the installed JDK 25 instead of the downloaded JDK 17.
The Gradle project is already wired to `C:\Program Files\Java\jdk-25.0.2`.


