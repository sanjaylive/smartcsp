# CSP2All mobile (Flutter, Android + iOS)

The CSP2All shop app. It uses the same REST API as the web portal (`apps/api`). It is a
**record-first** app: it creates manual records only and never moves money or runs provider
operations. It is not part of the pnpm workspace.

- Flutter 3.47.8 / Dart 3.13.7. Dependency versions are pinned exactly in `pubspec.yaml`, and `pubspec.lock` is committed.
- Stack: flutter_riverpod 3, go_router 18, dio 5, flutter_secure_storage (tokens only), sqflite (device drafts), connectivity_plus, shared_preferences (language/theme only), flutter_localizations.

## Layout

```
lib/
  config/env.dart            API_BASE_URL dart-define + per-platform defaults
  theme/tokens.dart          mirror of packages/shared/src/tokens.ts (keep in sync)
  theme/app_theme.dart       Material 3 light/dark themes built from the tokens
  core/money.dart            integer paise: parse rupee strings, ₹ Indian grouping
  core/dates.dart            business dates (Asia/Kolkata), "06 Nov 2026"
  core/privacy.dart          Aadhaar (Verhoeff) / card (Luhn) guard, masking
  core/registry/             Dart port of the service registry + field validators
  core/status.dart           status machines, receivable / cash-effect rules
  data/api/                  ApiClient (dio), AuthSession (single-flight refresh), errors
  data/models/               typed models (no dynamic maps reach the UI)
  data/repositories/csp_api.dart   typed endpoints
  data/local/                SQLite draft store + SyncQueue (offline drafts)
  state/providers.dart       Riverpod: auth, settings, sync coordinator, data providers
  features/…                 screens
  l10n/                      app_en.arb / app_hi.arb (+ generated strings.g.dart)
tool/                        l10n sync, icon generator, live API check, screenshots
test/                        unit + widget tests
```

## Setup

```sh
cd apps/mobile
flutter pub get
flutter analyze
flutter test
```

### Configuration (dart-defines)

| Define | Default | Notes |
|---|---|---|
| `API_BASE_URL` | Android: `http://10.0.2.2:4610`, iOS/other: `http://localhost:4610` | Required for release builds, and it must be `https://`. A release build with an `http://` URL shows a configuration error screen. |
| `DEVICE_NAME` | `CSP2All mobile` | Shown in "Active sessions". |

```sh
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4610
```

### Running against the local API

1. Start the infrastructure and API from the repo root (see the root README): `pnpm infra:up`, then `pnpm --filter @csp2all/api dev`. The API listens on `:4610`.
2. **Android emulator:** the host machine is `10.0.2.2`, which is the default. Debug builds allow cleartext HTTP only to `10.0.2.2`, `localhost` and `127.0.0.1` (`android/app/src/debug/res/xml/network_security_config.xml`).
3. **iOS simulator:** `localhost` works, which is the default. Debug builds use `ios/Runner/Info-Debug.plist`, which has an ATS exception for `localhost` only. Release and Profile builds use `Info.plist`, which has no exception.
4. **Physical phone on your LAN:** pass `--dart-define=API_BASE_URL=http://<laptop-ip>:4610`, and in a debug build add that IP as a `<domain>` in the debug network security config (Android) or as an ATS exception domain in `Info-Debug.plist` (iOS).
5. Sign-in codes go to Mailpit: open http://127.0.0.1:56626, or use `GET /api/v1/search?query=to:<email>`. The 6-digit code is at the start of the subject.

### Live end-to-end check (optional)

This runs the app's real client stack against the running API and Mailpit. It signs up a new user with an OTP, completes onboarding, and syncs a record through the offline queue. It then retries the same `clientRef`, expects exactly one record, and checks single-flight refresh and refresh-token reuse revocation:

```sh
API_BASE_URL=http://localhost:4610 MAILPIT_URL=http://127.0.0.1:56626 flutter test tool/live_api_check_test.dart
```

## Translations

The shared dictionaries `packages/shared/src/i18n/{en,hi}.ts` are the source of truth. Mobile-only keys live in `tool/l10n/mobile_{en,hi}.json`. Regenerate the ARB files and the Dart lookup maps with:

```sh
dart run tool/sync_l10n.dart   # writes lib/l10n/app_{en,hi}.arb and lib/l10n/strings.g.dart; fails if a Hindi key is missing
```

Keys keep the shared dotted names (for example `service.AEPS.name`), so registry-driven UI can look labels up dynamically. The user picks the language (English / हिंदी) in Settings.

## Offline drafts and sync

- **Save draft on this device** stores a record locally (SQLite, scoped to shop and user). The draft is labelled *"Draft on this device. Not saved to your shop yet."* Drafts are never shown in the server record list.
- The draft id is sent as `clientRef`. If a request reaches the server but the response is lost, a retry returns the original record (`duplicate: true`) instead of creating a second one. Each submission has an `Idempotency-Key` that is reused on automatic retries and replaced when the user edits the draft.
- If an online save fails with a network error, the form keeps the work as a draft with the same `clientRef`.
- **States:**
  - PENDING → SYNCING → SYNCED.
  - Network errors, 5xx, rate limits and in-progress responses: retried with exponential backoff (5 s doubling, capped at 15 min).
  - Validation, permission, quota, service-availability and closed-day errors: FAILED, with the reason and field errors shown so the user can edit and resubmit.
  - Auth errors: the draft stays PENDING.
- **Sync triggers:** app start, connectivity regained, every minute while the app is open, after each new draft, and "Sync now".
- After a draft syncs, only a summary without sensitive details is kept on the device, and it is purged after one day. Signing out deletes all device drafts. The user is warned first.

## Security notes

- Access and refresh tokens are stored only in the Keychain / Android Keystore (`flutter_secure_storage`). The pair is written as one value, so the two tokens are always updated together.
- Refresh tokens work once. `AuthSession` runs single-flight refreshes: concurrent 401s share one refresh, and callers holding a token that was already rotated just get the new pair. If the server rejects a refresh, the app returns to sign-in.
- `android:allowBackup="false"`. Release builds forbid cleartext traffic (`usesCleartextTraffic="false"`). There is no ATS exception in release on iOS.

## Building

### Android

```sh
flutter build apk --debug
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.example.com
```

**Release signing.** Create a keystore once and keep it out of git:

```sh
keytool -genkey -v -keystore ~/csp2all-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Then create `android/key.properties` (git-ignored, never commit it):

```
storePassword=…
keyPassword=…
keyAlias=upload
storeFile=/Users/you/csp2all-upload.jks
```

`android/app/build.gradle.kts` uses this file when it exists. Without it, release builds fall back to the debug key so that `flutter run --release` works locally. **Never distribute an APK signed with the debug key.** Use Play App Signing with the upload key above. The application id is `com.csp2all.csp2all_mobile`. Change it in `build.gradle.kts` before the first store upload if you want a different id.

### iOS

You need full Xcode, not only the Command Line Tools, and CocoaPods:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
brew install cocoapods
flutter build ios --debug --no-codesign
flutter build ipa --release --dart-define=API_BASE_URL=https://api.example.com
```

**Signing.** Open `ios/Runner.xcworkspace` in Xcode. Under Runner → Signing & Capabilities, choose your Team and either use automatic signing or select the provisioning profiles. The bundle id is `com.csp2all.csp2allMobile`. Do not commit personal team ids or profiles.

## Icons and splash

The current icons and splash are placeholders: an indigo→violet rounded square with a ledger page and a tick. No third-party or government logos are used. They are generated by:

```sh
flutter test tool/generate_icons_test.dart
# iOS rejects an alpha channel in the 1024px marketing icon; strip it afterwards:
cd ios/Runner/Assets.xcassets/AppIcon.appiconset && sips -s format jpeg Icon-App-1024x1024@1x.png --out /tmp/i.jpg && sips -s format png /tmp/i.jpg --out Icon-App-1024x1024@1x.png
```

To use final artwork, replace these files:

- `android/app/src/main/res/mipmap-*/ic_launcher.png`
- `android/app/src/main/res/drawable-*/splash_mark.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/*`
- `ios/Runner/Assets.xcassets/LaunchImage.imageset/*`

The splash background colours are in `android/app/src/main/res/values{,-night}/colors.xml`. You can also generate everything with `flutter_launcher_icons` / `flutter_native_splash`.

The app name is "CSP2All". Never imply any government or bank affiliation; the disclaimer from `app.disclaimer` is shown on sign-in and in Settings.
