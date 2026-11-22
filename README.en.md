# DSH Peer Sync

[简体中文](README.md) · **English** · [Download the latest release](https://github.com/yuguanghang516/dsh-peer-sync/releases/latest)

Start a conversation in DeepSeek Harness on Windows and continue it under the same title in DSH Go on Android. Both devices run their own local engines. While they share a LAN, the plugin exchanges conversation history, selected files and portable plugins roughly every 30 seconds. No cloud storage, Syncthing or USB connection is required.

### Setup

1. Download and unpack the release ZIP on Windows. Start the local DSH Go engine on Android at least once.
2. In PowerShell in the extracted folder, run the commands below. Substitute the desktop engine’s actual data directory, your workspace and the phone’s Wi-Fi IPv4 address.

   ```powershell
   py -m pip install cryptography
   py pair.py --windows-home "D:\dsh\.dsh" --windows-workspace "D:\dsh\workspace" --phone-ip 192.168.1.20
   ```

3. From the generated **windows** folder, copy `peer-sync-settings.json` to the desktop data directory and `peer.crt` to its `peer-sync-packages` subdirectory. From **android**, copy the settings to `/root/.dsh` inside the phone engine, and the certificate and private key to `/root/.dsh/peer-sync-packages`. Create the subdirectories if necessary. Generate a fresh pair for each user. Never distribute the generated files.
4. Install the bundled tgz in both engines. On the desktop run `dsh plugin --profile desktop add "file:ABSOLUTE_PATH_TO_TGZ"`. On the phone, place the package in Downloads and run `dsh plugin --profile web add "file:/sdcard/Download/dsh-peer-sync-0.6.0.tgz"` in the local DSH Go terminal. Restart both engines. If Windows has no global dsh command, use the desktop install’s `resources/runtime/cli/bin/dsh.cmd`.
5. Put a small text file in the desktop workspace’s `DSH-Shared` directory and look for it in the phone workspace after one or two polling cycles.

### What syncs

- **Chat:** Session events and original titles. Concurrent offline edits can produce separate branches. Deletions do not propagate, and external attachments are not automatically transferred.
- **Files:** Supported documents and media in `DSH-Shared`, up to 16 MiB per file. Conflicting versions are kept under `file-conflicts` in the local exchange cache.
- **Plugins:** Both devices exchange inventories and selected portable packages. Add a trusted package to `portablePlugins` on both devices. Also add it to `autoInstallPlugins` to install missing packages or upgrade to a newer stable version. The default is Free Search only. Restart to load newly installed code. Credentials and personal plugin settings stay local.

Tested with DSH Desktop 0.2.2-rc.5 and DSH Go 1.2.0 (engine 0.2.2-rc.1). Device tests compared event histories for 17 sessions, restored all 16 existing titles, and upgraded Free Search from 0.9.19 to 0.9.73 on Android. Sleeping engines pause sync. Pair only trusted devices; transport is encrypted, while the local cache contains readable chat snapshots.

If it helps you, a **Star** is welcome. For [bug reports](https://github.com/yuguanghang516/dsh-peer-sync/issues), include the two engine versions and symptoms. Leave out private messages, credentials and pairing files.

### Updating Peer Sync
Author: yuguanghang516 · Repository: https://github.com/yuguanghang516/dsh-peer-sync

Checks the latest stable GitHub Release after startup and every 24 hours. A newer package is verified against the release asset SHA-256 and saved under peer-sync-updates in your DSH data directory. Install it when ready. From your profile directory run `node node_modules/dsh-peer-sync/update.js` to check manually; append `--download` to download. Set autoDownloadUpdates to false for checks only, or autoCheckUpdates to false for manual mode. Upgrade older versions manually once.

### Two Android phones (v0.6.0)
Run both DSH Go local engines on the same Wi-Fi. Generate one fresh pair with `python pair.py --two-phones --phone-ip 192.168.1.20 --out private-pair` (use phone A's address). Install the tgz on both web profiles. Copy each device's settings from its own phone-a or phone-b folder to /root/.dsh; put certificates and A's private key in /root/.dsh/peer-sync-packages. Restart both engines. A listens and B connects; chats, titles, shared files and approved plugins flow both ways without a PC. One pair is active at a time; back up existing settings and certificates before switching.
