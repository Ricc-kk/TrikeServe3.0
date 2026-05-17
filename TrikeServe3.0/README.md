# TrikeServe

TrikeServe is a Vite web app wrapped with Capacitor for Android.

## Web setup

```powershell
npm install
npm run dev
npm run build
```

## Android setup

The Android project lives in `android/` and is synced from the web build output in `dist/`.

```powershell
npm run android:sync
npm run android:studio
```

### Android Studio

1. Open the `android/` folder in Android Studio.
2. Let Gradle sync finish.
3. Set **Gradle JDK** to the installed JDK if Android Studio asks for one.
4. Use the `app` module run configuration.
5. Choose a device or emulator, then click **Run** or **Debug**.

### Local Android SDK path

This workspace is pinned to the local SDK path in `android/local.properties`:

```ini
sdk.dir=C:\Users\Mayo\AppData\Local\Android\Sdk
```

## Useful commands

```powershell
npm run android:debug
npm run android:install:debug
npm run android:release
npm run android:clean
```

## If Gradle or JDK is incompatible

- Use the JDK already installed on this machine: `C:\Program Files\Java\jdk-25.0.2`
- If Android Studio requires a different JDK, point **Gradle JDK** to your downloaded JDK from `Downloads`
- Keep using the Gradle wrapper in `android/gradlew.bat`

