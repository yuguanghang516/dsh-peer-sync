# DSH Peer Sync · 局域双端同步

简体中文 · [English](README.en.md) · [下载最新版](https://github.com/yuguanghang516/dsh-peer-sync/releases/latest)

在同一 Wi‑Fi 或热点上，把选中的聊天从 Windows DeepSeek Harness 发到安卓 DSH Go，也可以让两部安卓手机互传。同步保留可读取的原标题和附件，两端可以继续对话。

## 安装

两端都从 GitHub Release 下载相同版本的 **dsh-peer-sync-`<版本>`.tgz**，保留原文件。npm 上现有的 0.7.5 是旧版，按包名安装会拿到旧版。

- **Windows DSH**：首次使用先打开桌面版一次以初始化 profile，再完全退出 DSH（包括托盘），用 DSH 的 CLI 安装。已有 `dsh` 命令时，运行 `dsh plugin --profile desktop add "file:C:/路径/dsh-peer-sync-<版本>.tgz"`。桌面客户端自带的 CLI 一般在安装目录下的 `resources/runtime/cli/bin/dsh.cmd`。
- **安卓 DSH Go**：把安装包放到手机的「下载」目录。在 **DSH Go 本机引擎的终端**运行 `dsh plugin --profile web add "file:/sdcard/Download/dsh-peer-sync-<版本>.tgz"`。

命令中的 `<版本>` 换成下载文件的实际版本号。安装后重启各自的本机引擎，再在两端各打开一个 DSH 工作区。

## 首次配对与发送

1. 手机打开聊天页的「局域双端同步」，或在「全部功能」里打开「同步中心」。Windows 启动 DSH 后，在本机浏览器打开 [同步中心](http://127.0.0.1:39580/)。
2. 建议在安卓的「配对新设备」里点「创建邀请」。另一端打开「配对新设备 → 查找附近设备」，点邀请方，输入显示的 20 位邀请码。查找不到时，填写邀请方显示的 IP 和端口。邀请码五分钟内有效。创建邀请的一端需要 OpenSSL。
3. 在「设备设置」确认本机工作区。新版首次配对会使用一个已注册且可访问的 DSH 工作区，已有配对沿用原配置。新配对的聊天清单初始为空。
4. 回到首页点接收设备，进入「选择聊天」勾选，再点「同步一次」。两端需要保持本机引擎运行。首页会显示方向和本机所选数量。

## 常用设置

- **传输方向**：在该配对的「设备设置」选择「双向手动同步」「本机为主」或「对端为主」。主设备开启「允许本机发送」后，每次仍由本人点「同步一次」发起。
- **删除聊天**：主设备选择一条聊天，预览后确认删除本机或指定对端。对端可独立允许删除，存在不同续写的对端记录会保留。删除的文件在对应设备暂存七天。
- **本机自动整理**：默认关闭。可在设备设置里打开。内容完全相同、符合归档条件的同步副本会进入 DSH 的归档列表。
- **文件与插件**：共享文档可放在工作区的 `DSH-Shared`（常见格式，单个 16 MiB 以内）。插件传输沿用配对设置中的 `portablePlugins`、`autoInstallPlugins` 或 `syncAllPlugins`。同步插件本身在各设备分别升级。

## 兼容性和更新

包声明 Node.js 20 或以上、DSH 引擎 `>=0.2.2-rc.1 <0.3.0-0`。手机需要支持插件面板的 DSH Go 和本机引擎。访客网络、路由器的设备隔离或 VPN 可能影响发现和连接。

旧版手动配置可继续保留在本机。高级用户仍可用 [pair.py](pair.py) 创建配置或查看 `peer-sync-settings.json`。配对密钥和账号凭据留在本机。检查更新时，在相应 profile 运行 `node node_modules/dsh-peer-sync/update.js`，加 `--download` 可下载经过 SHA‑256 校验的 GitHub Release 安装包。

作者 [yuguanghang516](https://github.com/yuguanghang516)。遇到问题可以在 [Issues](https://github.com/yuguanghang516/dsh-peer-sync/issues) 附上两端版本与现象。欢迎给仓库点 Star。
