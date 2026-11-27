# DSH Peer Sync

[简体中文](README.md) · English · [Download the latest GitHub release](https://github.com/yuguanghang516/dsh-peer-sync/releases/latest)

Manually sync selected chats between DeepSeek Harness on Windows and DSH Go on Android, or between two Android devices. The plugin retains existing titles and transfers available attachments.

## Install

Download the same **dsh-peer-sync-`<version>`.tgz** from the GitHub release on both devices. Installing by package name currently gets the older npm release, 0.7.5.

- **Windows DSH**: Open the desktop app once to initialize its profile, then fully quit it, including the tray process. Run `dsh plugin --profile desktop add "file:C:/path/dsh-peer-sync-<version>.tgz"`. The desktop app typically ships its CLI at `resources/runtime/cli/bin/dsh.cmd` inside its installation directory.
- **Android DSH Go**: Save the package to Downloads. In the DSH Go local engine terminal run `dsh plugin --profile web add "file:/sdcard/Download/dsh-peer-sync-<version>.tgz"`.

Replace `<version>` with the downloaded version. Restart both local engines and open a workspace on each device.

## Pair and sync

1. Open **LAN peer sync** in a DSH Go conversation or open **Sync center** from Features. On Windows, start DSH and visit the [local sync center](http://127.0.0.1:39580/).
2. Connect both devices to the same Wi‑Fi or hotspot. On Android choose **Pair a device → Create invite**. On the other device choose **Pair a device → Find nearby**, select the inviter and enter its 20-character code. You can enter the displayed IP and port manually. The inviter needs OpenSSL and the invitation expires after five minutes.
3. Check the local workspace in **Device settings**. New pairs use an accessible registered DSH workspace. Existing pairs keep their configured workspace.
4. Select a peer on the home screen, use **Choose chats** to pick the conversations and press **Sync once**. New pairs start with no chats selected. Both engines must be running.

## Settings

- **Direction:** use **Device settings** to choose manual two-way sync or a primary device. Turn on **Allow sending** on the primary, then press **Sync once** each time.
- **Deletion:** the primary selects one conversation and confirms the destination. Remote deletion requires permission on the receiver and matching history. Deleted files are held locally for seven days.
- **Local organizer:** off by default. Enable it in **Device settings** to archive eligible exact duplicates.
- **Files and plugins:** supported documents can be shared through the workspace's `DSH-Shared` directory (16 MiB per file). Plugin transfer follows the pair's `portablePlugins`, `autoInstallPlugins` or `syncAllPlugins` settings. Update Peer Sync on each device separately.

## Compatibility and updates

The package declares Node.js 20 or later and DSH engine `>=0.2.2-rc.1 <0.3.0-0`. Android needs a DSH Go version with plugin panels and the local engine. Guest Wi‑Fi, client isolation and some VPNs can affect discovery and connectivity.

Advanced users can still use [pair.py](pair.py) for manual configuration. To check for updates from a profile directory, run `node node_modules/dsh-peer-sync/update.js`. Add `--download` to download and verify the GitHub release asset.

Created by [yuguanghang516](https://github.com/yuguanghang516). Report version details and symptoms in [Issues](https://github.com/yuguanghang516/dsh-peer-sync/issues).
