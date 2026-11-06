# Release guide

How to get Asta onto real phones. The backend must already be deployed (see [SETUP.md](SETUP.md)).

## Before the first build

| Item | Where | Notes |
| --- | --- | --- |
| Your app id | EAS variable `APP_ID` | A reverse-domain id such as `com.yourname.asta`. **Cannot be changed after publishing.** Defaults to the placeholder `com.example.asta`. |
| API address | `eas.json` (`preview` / `production` env) | Replace `REPLACE-WITH-YOUR-RENDER-URL` with your Render URL. |
| EAS project id | EAS variable `EAS_PROJECT_ID` | Run `npx eas-cli@latest init` once; it prints the id. Required for push notifications. |
| Maps key | EAS secret `GOOGLE_MAPS_ANDROID_API_KEY` | Android only. Restrict the key to your package name and the app's SHA-1 (`npx eas-cli@latest credentials`). |
| Server URL for invites | Render `PUBLIC_URL` | Must be the same public address. |

Set variables with `npx eas-cli@latest env:create --name APP_ID --value com.yourname.asta --environment preview` (repeat per environment: `development`, `preview`, `production`). Use `--visibility secret` for the Maps key.

## Android: an installable APK for friends

```bash
npx eas-cli@latest login
npx eas-cli@latest init                                      # once
npx eas-cli@latest build --profile preview --platform android
```

When the cloud build finishes, EAS gives a link and QR code. Open it on an Android phone, download the APK and allow "install unknown apps" for your browser. Send the same link to friends.

**Push on Android** needs Firebase Cloud Messaging credentials: create a Firebase project, add an Android app with your `APP_ID`, then upload its FCM V1 service account key with `npx eas-cli@latest credentials` (Android > production/preview > Google Service Account Key for FCM V1).

**Battery optimisation:** some phones (Xiaomi, Huawei, Samsung, OnePlus) stop background apps. Tell testers to set Asta's battery usage to "Unrestricted"/"Don't optimise" or runs can stop when the screen is off. See [dontkillmyapp.com](https://dontkillmyapp.com).

## iPhone: TestFlight

You need the **Apple Developer Program** ($99/year, [developer.apple.com/programs](https://developer.apple.com/programs/)). Without it you can only preview in Expo Go (no background tracking, no push).

1. Enrol in the Apple Developer Program and wait for approval.
2. `npx eas-cli@latest build --profile production --platform ios` — EAS asks you to sign in with your Apple ID and creates the certificates, provisioning profile and push (APNs) key for you.
3. Create the app in [App Store Connect](https://appstoreconnect.apple.com) (My Apps > + > New App) using the same bundle id as `APP_ID`.
4. `npx eas-cli@latest submit --platform ios` uploads the build to App Store Connect (it asks for the App Store Connect app id the first time; you can also put it under `submit.production.ios` in `eas.json`).
5. In App Store Connect > TestFlight, wait for processing (about 10 to 30 minutes), then add **internal testers** (up to 100 people on your App Store Connect team, no review) or **external testers** (up to 10,000 by email or public link; the first build needs a short Beta App Review).
6. Testers install the free TestFlight app and accept the invitation.

**Review notes for background location.** Apple and Google ask why the app uses location in the background. Suggested wording: "Asta records the route, distance and pace of a run while the screen is locked or the app is in the background. Location is only collected while the user has started a run and a persistent indicator is shown." Both stores also require a privacy policy URL.

## Updating

Bump nothing by hand: `production` uses `autoIncrement`. For JavaScript-only changes you can later add `eas update`; native changes (new modules, permissions) need a new build.

## Known limitations of a first release

- Email addresses are not verified and there is no password reset.
- Notification text is English only; the app strings are ready for a translation file.
- Free Render instances sleep when idle (first request takes about 30 seconds).
