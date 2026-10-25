# StillTempo

**A new tab, at your own pace.**

StillTempo gives Chrome's New Tab page two distinct atmospheres: **Workspace**, a cooler space for getting things done, and **Lounge**, a warmer place to slow down. Let them change with the time of day, using a schedule you choose, or switch whenever you like.

Both modes keep your everyday essentials within reach: a Hitlist for small tasks, a focus timer, favourite sites, search, weather, curated photography, and optional jazz or lo-fi radio.

The idea started with a simple frustration: having to subscribe just to make a browser feel personal. StillTempo is **free to try**, needs **no account**, and has **no subscription** for this preview.

## Technical preview — Chrome extension 1.0

The Chrome Web Store submission is under review. This GitHub preview is intended **only for people comfortable reviewing and loading unpacked Chrome extensions**. It has **not** been approved through Chrome Web Store review.

**To get the package:** open the repository's **Releases** page and download the asset named `StillTempo-v1.0-Technical-Preview.zip`. Do **not** use GitHub's automatically generated “Source code (zip)” as an installation package.

Read [INSTALL.md](INSTALL.md) before installing, including how to check the SHA-256 digest and how to remove the extension.

## What's included

- **Workspace / Lounge:** blue and amber visual modes; switch manually or use Auto with a custom schedule.
- **Hitlist and focus timer:** tasks and timed focus sessions, available in either mode.
- **Photography and audio:** bundled fallbacks, online curated photos, optional jazz and lo-fi radio.
- **Everyday essentials:** shortcuts, browser-default search, optional weather, a clock and occasional dry humour.

Tasks and preferences live in Chrome local extension storage. Optional online features contact third-party providers. The extension does not require an account. See [PRIVACY.md](PRIVACY.md) and the declared permissions in [`extension/manifest.json`](extension/manifest.json) before installing.

## What's in this repository

`extension/` contains the **same 27 production files** as the StillTempo 1.0 approved local baseline—nothing has been changed for this preview. They are available to inspect, but **publicly viewable source is not a promise of independent security certification**. Internal build documentation and the separately managed Cloudflare Worker are deliberately not included here.

A GitHub download is not a Chrome Web Store installation. It receives **no automatic Chrome Web Store updates**, and loading unpacked extensions requires Chrome Developer mode. Use a separate Chrome profile if you want to isolate testing.

## Feedback

Bugs, confusing controls, missing features, or ideas about the two modes? Please open a GitHub Issue using the bug or feedback templates. Please **don't include private task lists, backups, credentials, location details or other personal data** in a report.

Please see [SECURITY.md](SECURITY.md) for security reporting and [RELEASE_NOTES.md](RELEASE_NOTES.md) for the scope and limitations of this preview.

**StillTempo — Find your balance between focus and calm.**
