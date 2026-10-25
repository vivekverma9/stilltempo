# Installing StillTempo — technical preview

**For experienced Chrome users only.** This build has not yet received Chrome Web Store approval. Chrome Developer mode permits installation of unpacked software that has not gone through the Store's review process; only proceed if you trust and have inspected the source and publisher.

## Download and verify

1. Visit this repository's **Releases** page and choose **StillTempo 1.0 — Technical Preview**.
2. Download **`StillTempo-v1.0-Technical-Preview.zip`** from **Assets**. Do not choose GitHub's automatically generated *Source code* archives.
3. Compare the downloaded ZIP's SHA-256 checksum with the digest displayed by GitHub on the release asset and with the provided `SHA256SUMS.txt` file. A checksum detects differences; by itself, it is not a malware scan or proof of trustworthy ownership.

   **Windows PowerShell**:
   ```powershell
   (Get-FileHash .\StillTempo-v1.0-Technical-Preview.zip -Algorithm SHA256).Hash
   ```
   **macOS**:
   ```sh
   shasum -a 256 StillTempo-v1.0-Technical-Preview.zip
   ```
   **Linux**:
   ```sh
   sha256sum StillTempo-v1.0-Technical-Preview.zip
   ```

## Install in Chrome

1. Extract the release ZIP into a permanent folder, for example `Documents/StillTempo-Preview`. **Do not install from inside the ZIP.**
2. Confirm the extracted folder contains `manifest.json`, `index.html`, `style.css`, and `js/`, `assets/` and `icons/` directories directly at its root.
3. Review `manifest.json` and, if desired, the JavaScript files before proceeding.
4. Open `chrome://extensions` in Chrome.
5. Turn on **Developer mode** and choose **Load unpacked**.
6. Select the **extracted folder containing `manifest.json`** (not the ZIP, not its parent folder).
7. Open a new tab. StillTempo should now be your New Tab page. Explore Workspace, Lounge, and Settings.

StillTempo replaces Chrome's New Tab page. Other extensions that replace New Tab can conflict, and Chrome may show notices about extensions loaded in Developer mode.

## Security, permissions and privacy

The package uses `storage`, `search`, `alarms`, `offscreen`, `notifications` and `favicon` permissions and specific hosts for wallpaper, location/weather, humour and radio. See [`extension/manifest.json`](extension/manifest.json) for the exact permission list, and [`PRIVACY.md`](PRIVACY.md) for data handling. Some requests reach external providers and may expose normal connection metadata such as IP address. There is no account requirement or extension-owned analytics backend in the source reviewed for this preview.

This is **not a claim that the extension is virus-free**. The source was checked for accidental credentials and matched against its approved file list, and the project unit tests passed. It has **not** undergone an independent security audit or full installed-Chrome verification in this preparation.

## Updates and switching to the Chrome Web Store

This unpacked GitHub build **does not auto-update** from GitHub. Future preview updates require you to download and extract the new version, then click **Reload** on the unpacked extension's card, keeping the extension folder in place.

When switching to the Chrome Web Store build, the extension ID may be different. Export your StillTempo data to a JSON backup first, install the Store version, and import the backup there if you choose. Review the import confirmation because it may replace existing data. Remove the preview extension after confirming the migration.

## Uninstall

Open `chrome://extensions`, locate **StillTempo**, and choose **Remove**. Chrome will stop using its New Tab override. Delete the extracted preview folder separately. Any exported JSON backups must be removed separately if you no longer want them.

If installation looks unfamiliar or raises doubts, don't bypass browser security warnings. You can wait for the official Chrome Web Store release instead.
