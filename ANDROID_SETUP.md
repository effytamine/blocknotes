# BlockNotes — Android APK Setup Guide
**Stack:** HTML + CSS + JS wrapped with Capacitor → Android APK

---

## Prerequisites (install once)
| Tool | Download |
|------|---------|
| Node.js (v18+) | https://nodejs.org |
| Android Studio | https://developer.android.com/studio |
| JDK 17 | bundled with Android Studio |

---

## Step 1 — Install Capacitor in your project folder

Open terminal in the `blocknotes/` folder:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
```

---

## Step 2 — Initialize Capacitor (already configured)

`capacitor.config.json` is already in this folder. Just run:

```bash
npx cap init
# When asked, use:
#   App name:  BlockNotes
#   App ID:    com.blocknotes.app
#   Web dir:   .
```

---

## Step 3 — Add Android platform

```bash
npx cap add android
```

This generates an `android/` folder with the full Android project.

---

## Step 4 — Sync your web files into Android

Every time you edit HTML/CSS/JS, run:

```bash
npx cap sync android
```

---

## Step 5 — Open in Android Studio & build APK

```bash
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to finish
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. APK is saved to:
   `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Step 6 — Install on your Android device

Enable **USB Debugging** on your phone:
- Settings → About Phone → tap Build Number 7 times
- Settings → Developer Options → USB Debugging ON

Then either:
```bash
# Via ADB (USB cable)
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or just copy the APK file to your phone and open it
```

---

## Useful Commands

```bash
npx cap sync android    # re-sync after editing files
npx cap open android    # open Android Studio
npx cap run android     # build + deploy to connected device/emulator
```

---

## Notes
- `localStorage` works inside Capacitor WebView — all saved meetings persist
- Fonts load from Google Fonts (needs internet on first load; cache after)
- For offline fonts, download them and reference locally in style.css
- The app uses `viewport-fit=cover` for notch/cutout safe areas
