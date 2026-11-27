# DSH Peer Sync · 局域网双端同步

**自动整理聊天记录（0.8.3）** 在同步中心按设备开启，默认关闭。插件按工作区核对完整历史、会话元数据及同步回执，使用 DSH 的归档功能收起内容完全相同的同步副本。置顶、活动中及存在不同续写的聊天不会被自动归档。可在 DSH 归档列表恢复；需要一直单独显示时，先关闭整理。

[![npm](https://img.shields.io/npm/v/dsh-peer-sync?label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-peer-sync)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.2.2--rc.1%20%3C0.3-4B5563)](package.json)
[![DSH Go](https://img.shields.io/badge/DSH%20Go-%E2%89%A51.0-3B82F6)](https://github.com/ccch1mneyyy/dsh-go-market)

**简体中文** · [English](README.en.md) · [npm](https://www.npmjs.com/package/dsh-peer-sync) · [下载最新版](https://github.com/yuguanghang516/dsh-peer-sync/releases/latest)

在电脑上聊到一半，拿起手机，打开同名对话继续。DSH Peer Sync 让 **Windows 上的 DeepSeek Harness** 和 **安卓 DSH Go 的本机引擎** 在同一 Wi‑Fi 下交换聊天、文件和选定的插件。两端各自在本机运行，重新连上后补传，无需云盘、Syncthing 或 USB。

| 想同步什么 | 怎么用 |
| --- | --- |
| 聊天记录与原标题 | 在配对的工作区里聊天。两个引擎运行时约每 30 秒检查一次；两边离线续写同一条聊天时保留分支。 |
| 文档和图片 | 放进工作区里的 `DSH-Shared`。常用文档和媒体格式支持单文件 16 MiB；两端同时改动的另一份保存在同步缓存的 `file-conflicts` 中。 |
| 插件 | 双手机配对自动发现两端已启用的插件，合并安装清单。电脑配对默认只同步免费搜索。 |

### 安装

插件已发布到 npm，一条命令装上（把 `web` 换成你实际的 profile 名，用 `ls ~/.dsh/profiles/` 查看）：

```bash
dsh plugin --profile web add dsh-peer-sync          # 手机本机引擎 / 网页版
dsh plugin --profile desktop add dsh-peer-sync      # 桌面版
```

也可以在插件市场里装：

- **DSH Go App**：设置 › 插件 › 插件市场，搜索 `dsh-peer-sync`（「全部」分区靠 dshfind 自动收录，「官方 / 适配 DSH Go」分区审核合并后出现）
- **DSH 网页版 / 桌面版**：插件 › 打开「自定义插件索引」→ 发现 › 添加索引源，填
  `https://raw.githubusercontent.com/yuguanghang516/dsh-peer-sync/main/market/index.json`

装完重启引擎生效。**同步本身还要做一次配对**（见下面的「开始使用」），配对文件和私钥不会随包分发。

### 开始使用

1. [下载发布页里的 ZIP](https://github.com/yuguanghang516/dsh-peer-sync/releases/latest)，解压到电脑；发布页只挂 tgz 时，直接取仓库里的 `pair.py` 和各 README 也一样能用。手机先在 DSH Go 中启动一次本机引擎。
2. 在 Windows 的解压目录打开 PowerShell。把下面两个目录和手机 Wi‑Fi 地址换成自己的。Python 需要安装 `cryptography`：

   ```powershell
   py -m pip install cryptography
   py pair.py --windows-home "D:\dsh\.dsh" --windows-workspace "D:\dsh\workspace" --phone-ip 192.168.1.20
   ```

3. 把 `private-pair/windows` 中的设置文件放进电脑的 DSH 数据目录，证书放进其 `peer-sync-packages` 子目录。手机使用 `private-pair/android`：设置文件放进引擎内的 `/root/.dsh`，证书和私钥放进 `/root/.dsh/peer-sync-packages`。没有子目录就创建。**每对设备单独配对，分享时只发发布页的 ZIP。**
4. 两端分别安装同一个包。已经用上面的命令从 npm 装过就跳过这步；要装 ZIP 里的 tgz，电脑在 DSH CLI 中使用 `dsh plugin --profile desktop add "file:安装包绝对路径"`；手机将包放进下载目录，在 DSH Go 本机终端执行 `dsh plugin --profile web add "file:/sdcard/Download/dsh-peer-sync-<版本>.tgz"`。重启两个引擎。
5. 在电脑的 `DSH-Shared` 放一个新的文本文件，然后在手机工作区的同名目录查看。首次传输可等一至两个轮询周期。

### 兼容性与边界

支持的 DSH 版本为 `>=0.2.2-rc.1 <0.3.0-0`（范围同时写在 package.json 的 `engines` 和 `peerDependencies` 里，第三方版本检查工具可以直接读）。已在 DSH Desktop 0.2.2-rc.5 与 DSH Go 1.2.0（引擎 0.2.2-rc.1）上真机验证。测试中比对了 17 条会话的事件内容，16 条有原标题的会话在两端恢复了原标题；免费搜索插件也在手机上从 0.9.19 自动升级到了电脑的 0.9.73。这是一组实测环境，其他版本欢迎反馈。

仅配对可信设备。聊天快照和共享文件保存在各自的本地磁盘，局域网传输使用 TLS。插件只有同时列入 `portablePlugins` 和 `autoInstallPlugins` 才会自动安装，重启引擎后加载。同步不传播删除；账号凭据和插件的个人设置保留在本机。引擎休眠时暂停。请避免同时用其他工具直接镜像 DSH 的 sessions 目录。

如果这个插件让你顺利在两台设备间接着聊，欢迎点个 **Star**。遇到问题请在 [Issues](https://github.com/yuguanghang516/dsh-peer-sync/issues) 附上两端版本和现象，请勿上传聊天内容、配对文件或 API 密钥。

### 插件自身更新
作者：yuguanghang516 · 仓库：https://github.com/yuguanghang516/dsh-peer-sync

启动后和每 24 小时自动检查 GitHub 正式版。新版经 SHA-256 校验后保存到 DSH 数据目录的 peer-sync-updates，由你选择何时安装。在对应 profile 目录运行 `node node_modules/dsh-peer-sync/update.js` 手动检查；加 `--download` 下载新版。配对设置中 autoDownloadUpdates 设为 false 即只检查，autoCheckUpdates 设为 false 可关闭自动检查。0.5.x 及更早的版本需要先手动升到 0.6.0 一次。

### 两台安卓手机互传（v0.6.0）
两台手机都启动 DSH Go 本机引擎、连同一个 Wi-Fi。运行 `py pair.py --two-phones --phone-ip 192.168.1.20 --out private-pair`，把示例地址换成手机 A 的 Wi-Fi 地址。此命令只需运行一次，可以在电脑或装有 Python 与 cryptography 的环境中运行。生成后同步不需要电脑。

两台手机各安装同一份 tgz（web profile）。分别将 phone-a、phone-b 里的 peer-sync-settings.json 放到各自引擎的 /root/.dsh，证书和 A 的私钥放到各自 /root/.dsh/peer-sync-packages。A 监听，B 主动连接，两边都能发送和接收。重启后在 A 的 DSH-Shared 放一个小文件，在 B 核对，再反向测试。原标题、聊天续写和允许名单内插件使用同一套同步规则。每个引擎同一时间使用一套配对；从已有电脑配对切换前，备份两端原设置及证书目录。请勿公开或交叉混用配对密钥。

新版双手机配对默认开启全量插件合并。旧配对可在双方配对设置 JSON 中加入字段 `"syncAllPlugins": true`，升级后重启本机引擎。同步插件本身单独更新。插件账户、密钥和个人设置保留在各自设备。单插件安装包上限 16 MiB，安装依赖可能需要联网。个别插件失败可查看交换目录中的 plugin-pack-status 和 plugin-install-status 文件。

v0.7.2 会补传历史会话引用的图片、工具返回的图片和文件附件。两端均升级后，只要配对设备仍保有原件，就会自动补齐并校验 SHA-256。单个附件传输上限 64 MiB。交换目录中的 attachment-status.json 列出尚未找到的附件哈希。
## 手机同步中心（0.8.1）

在安卓 DSH Go 的聊天页点「局域双端同步」，或从「全部功能」打开「同步中心」。Windows DSH 引擎启动后，可在本机浏览器打开 http://127.0.0.1:39580 。

1. 两端连接同一 Wi-Fi 或手机热点，打开各自的本机引擎。在一端点「配对设备 → 创建邀请」。另一端点「查找附近设备」，选中邀请方并输入 20 位邀请码。广播受限时，可手动填写邀请方显示的地址和端口。邀请码五分钟内有效，创建邀请的设备需要 OpenSSL。
2. 在「同步中心」先点目标设备，然后选择「双向」「本机为主」或「对端为主」。双方仍可续写。如果离线期间各自写出了不同的内容，插件保留两份，并在插件聊天清单给主设备的版本标记「主线」。
3. 点「选择聊天 → 仅选中」，搜索本机工作区的聊天标题，逐条点选。另一端独有的聊天可以从另一端勾选。选择仅对当前这对设备生效，两端均升级后会互传这份清单。新建配对初始勾选为空，原有配对保留全部聊天。取消勾选会停止后续传输，已收到的记录仍保留。
4. 两端引擎运行时约每 30 秒检查一次，也可点「立即同步」。聊天的附件随选中的记录传输；DSH-Shared 文件和插件按配对原有配置独立同步。手机被系统挂起时，重新打开引擎后会继续。


