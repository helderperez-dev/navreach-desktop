# Publishing Guide for NavReach

This guide provides detailed instructions on how to package and publish NavReach for macOS and Windows.

---

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js**: Version 18 or higher.
- **Apple Developer Account**: Required for macOS code signing and notarization.
- **Windows Code Signing Certificate**: Required to avoid "Windows Protected your PC" warnings (SmartScreen).
- **Environment**: 
  - macOS builds are best performed on a Mac.
  - Windows builds can be performed on Windows or Mac (using Wine), but native is recommended.

---

## 1. Preparation

### Update Version
Update the version number in `package.json` before every release:
```json
"version": "1.0.1"
```

### Build Assets
The `electron-builder.json` configuration expects icons in a `build/` directory. Currently, this directory may not exist.

1. Create the `build/` directory in the project root.
2. Place your source icon (e.g., `icon.png`, at least 512x512px) in this directory.
3. Generate the required formats:
   - **macOS**: `icon.icns`
   - **Windows**: `icon.ico`

**Recommended Tool for Icons:**
You can use the [Electron Icon Builder](https://www.npmjs.com/package/electron-icon-builder) to generate all formats from a single PNG:
```bash
npx electron-icon-builder --input=./build/icon.png --output=./build --flatten
```

---

## 2. Building the Application

First, build the frontend and main process source code:

```bash
npm run build
```

This will generate the compiled files in the `out/` directory.

---

## 3. macOS Publishing

To publish for macOS, you must **sign** and **notarize** the application. Without this, users will see a message saying the app "cannot be opened because it is from an unidentified developer."

### Step 3a: Code Signing
You need a "Developer ID Application" certificate from the Apple Developer portal.

1.  Download and install your certificate into Keychain Access.
2.  Set the following environment variables (or let `electron-builder` find them in your keychain):
    - `CSC_LINK`: Path to your `.p12` certificate (optional if in keychain).
    - `CSC_PASSWORD`: Password for the `.p12` file.

### Step 3b: Notarization
Starting with macOS 10.15, all distributed apps must be notarized by Apple.

1.  Create an **App-Specific Password** at [appleid.apple.com](https://appleid.apple.com).
2.  Configure `electron-builder.json` with your Apple ID info (or use environment variables):
    ```json
    "mac": {
      "notarize": {
        "teamId": "YOUR_TEAM_ID"
      }
    }
    ```
3.  Set environment variables:
    - `APPLE_ID`: Your Apple ID email.
    - `APPLE_PASSWORD`: The app-specific password created above.
    - `APPLE_TEAM_ID`: Your 10-character Team ID.

### Step 3c: Run Mac Build
```bash
npm run build:mac
```

The output will be in `dist/` (or `out/` depending on builder config, usually `dist/` for installers).

---

## 4. Windows Publishing

### Step 4a: Code Signing
To avoid the "Windows Protected your PC" warning, you should sign your `.exe`.

1.  Obtain a certificate from a CA (like Digicert or Sectigo).
2.  Set environment variables for `electron-builder`:
    - `WIN_CSC_LINK`: Path to your `.pfx` certificate.
    - `WIN_CSC_PASSWORD`: Password for the certificate.

### Step 4b: Run Windows Build
```bash
npm run build:win
```

This generates an NSIS installer and a portable ZIP in the output directory.

---

## 5. Automated Releases (GitHub Actions)

It is highly recommended to use GitHub Actions to build for both platforms simultaneously.

### Workflow Example
Create `.github/workflows/build.yml`:

```yaml
name: Build/Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest]

    steps:
      - name: Check out git repository
        uses: actions/checkout@v4

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Build and Release
        uses: samuelmeuli/action-electron-builder@v1
        with:
          github_token: ${{ secrets.github_token }}
          release: true
          # Apple notarization env vars
          mac_certs: ${{ secrets.MAC_CERTS }}
          mac_certs_password: ${{ secrets.MAC_CERTS_PASSWORD }}
          apple_id: ${{ secrets.APPLE_ID }}
          apple_id_password: ${{ secrets.APPLE_ID_PASSWORD }}
          # Windows signing
          windows_certs: ${{ secrets.WINDOWS_CERTS }}
          windows_certs_password: ${{ secrets.WINDOWS_CERTS_PASSWORD }}
```

---

## 6. Common Commands Summary

| Command | Purpose |
| :--- | :--- |
| `npm run build` | Compile source code |
| `npm run build:mac` | Create Mac DMG and Zip |
| `npm run build:win` | Create Windows Installer |
| `npm run build:unpack` | Create an unpacked version (for testing) |

---

## 7. Troubleshooting

- **Signing Errors**: Ensure your certificates are not expired and are in the correct format (`.p12` for Mac, `.pfx` for Windows).
- **Notarization Failures**: Check that you are using an app-specific password, not your main Apple ID password.
- **Path Issues**: Electron-builder expects assets in specific locations. Ensure `build/icon.icns` exists.
