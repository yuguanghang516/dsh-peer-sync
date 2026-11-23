# DSH Peer Sync

[![npm](https://img.shields.io/npm/v/dsh-peer-sync?label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-peer-sync)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.2.2--rc.1%20%3C0.3-4B5563)](package.json)
[![DSH Go](https://img.shields.io/badge/DSH%20Go-%E2%89%A51.0-3B82F6)](https://github.com/ccch1mneyyy/dsh-go-market)

[简体中文](README.md) · **English** · [npm](https://www.npmjs.com/package/dsh-peer-sync) · [Download the latest release](https://github.com/yuguanghang516/dsh-peer-sync/releases/latest)

Start a conversation in DeepSeek Harness on Windows and continue it under the same title in DSH Go on Android. Both devices run their own local engines. While they share a LAN, the plugin exchanges conversation history, selected files and portable plugins roughly every 30 seconds. No cloud storage, Syncthing or USB connection is required.

### Install

The plugin is on npm, so one command is enough (replace `web` with your profile name, see `ls ~/.dsh/profiles/`):

```bash
dsh plugin --profile web add dsh-peer-sync          # phone engine / web profile
dsh plugin --profile desktop add dsh-peer-sync      # desktop profile
```

Or install it from a plugin market:

- **DSH Go app**: Settings › Plugins › Plugin market, search `dsh-peer-sync` (`All` fills in from dshfind automatically; `Official / DSH Go ready` appears after review)
- **DSH web / desktop**: Plugins › enable “Custom plugin market” › Discover › Add index source, then paste
  `https://raw.githubusercontent.com/yuguanghang516/dsh-peer-sync/main/market/index.json`

Restart the engine afterwards. **Syncing still needs one pairing step** (see Setup below); pairing files and private keys are never shipped with the package.

Supported DSH range: `>=0.2.2-rc.1 <0.3.0`.

### Setup

1. Download and unpack the release ZIP on Windows. Start the local DSH Go engine on Android at least once.
2. In PowerShell in the extracted folder, run the commands below. Substitute the desktop engine’s actual data directory, your workspace and the phone’s Wi-Fi IPv4 address.

   ```powershell
   py -m pip install cryptography
   py pair.py --windows-home "D:\dsh\.dsh" --windows-workspace "D:\dsh\workspace" --phone-ip 192.168.1.20
   ```

3. From the generated **windows** folder, copy `peer-sync-settings.json` to the desktop data directory and `peer.crt` to its `peer-sync-packages` subdirectory. From **android**, copy the settings to `/root/.dsh` inside the phone engine, and the certificate and private key to `/root/.dsh/peer-sync-packages`. Create the subdirectories if necessary. Generate a fresh pair for each user. Never distribute the generated files.
4. Install the same package in both engines. Skip this if you already installed from npm above. Otherwise run `dsh plugin --profile desktop add "file:ABSOLUTE_PATH_TO_TGZ"` on the desktop, place the package in Downloads on the phone and run `dsh plugin --profile web add "file:/sdcard/Download/dsh-peer-sync-0.7.3.tgz"` in the local DSH Go terminal. Restart both engines. If Windows has no global dsh command, use the desktop install’s `resources/runtime/cli/bin/dsh.cmd`.
5. Put a small text file in the desktop workspace’s `DSH-Shared` directory and look for it in the phone workspace after one or two polling cycles.

### What syncs

- **Chat:** Session events and original titles. Concurrent offline edits can produce separate branches. Referenced DSH images and file attachments sync with the session. Existing sessions are backfilled when a paired device still has the original bytes.
- **Files:** Supported documents and media in `DSH-Shared`, up to 16 MiB per file. Conflicting versions are kept under `file-conflicts` in the local exchange cache.
- **Plugins:** Android phone pairs discover installed profile bundles and install missing or newer compatible packages. Built-in bundles use the receiving engine’s own copy. Desktop pairs keep the selected-package list, initially Free Search.

Tested with DSH Desktop 0.2.2-rc.5 and DSH Go 1.2.0 (engine 0.2.2-rc.1). Device tests compared event histories for 17 sessions, restored all 16 existing titles, and upgraded Free Search from 0.9.19 to 0.9.73 on Android. Sleeping engines pause sync. Pair only trusted devices; transport is encrypted, while the local cache contains readable chat snapshots.

If it helps you, a **Star** is welcome. For [bug reports](https://github.com/yuguanghang516/dsh-peer-sync/issues), include the two engine versions and symptoms. Leave out private messages, credentials and pairing files.

### Updating Peer Sync
Author: yuguanghang516 · Repository: https://github.com/yuguanghang516/dsh-peer-sync

Checks the latest stable GitHub Release after startup and every 24 hours. A newer package is verified against the release asset SHA-256 and saved under peer-sync-updates in your DSH data directory. Install it when ready. From your profile directory run `node node_modules/dsh-peer-sync/update.js` to check manually; append `--download` to download. Set autoDownloadUpdates to false for checks only, or autoCheckUpdates to false for manual mode. Upgrade older versions manually once.

### Two Android phones (v0.6.0)
Run both DSH Go local engines on the same Wi-Fi. Generate one fresh pair with `python pair.py --two-phones --phone-ip 192.168.1.20 --out private-pair` (use phone A's address). Install the tgz on both web profiles. Copy each device's settings from its own phone-a or phone-b folder to /root/.dsh; put certificates and A's private key in /root/.dsh/peer-sync-packages. Restart both engines. A listens and B connects; chats, titles, shared files and approved plugins flow both ways without a PC. One pair is active at a time; back up existing settings and certificates before switching.

Existing phone pairs can enable this in both pairing settings with `"syncAllPlugins": true` (JSON). Restart both engines after upgrading. Peer Sync itself is updated separately on each device. Plugin settings, accounts and keys stay local. The archive limit is 16 MiB. Dependencies may require internet access. Check plugin-pack-status and plugin-install-status in the exchange directory for individual failures.

Version 0.7.2 also transfers images returned by tools. Attachments are verified by SHA-256; the per-object transfer limit is 64 MiB. Upgrade both ends. Missing hashes are listed in attachment-status.json in the exchange directory.
