手机同步中心（0.8.1）

## 手动同步与同网设备（0.9）

打开同步中心即可查看同一局域网内运行本插件的 Windows DSH 和安卓 DSH Go。设备列表在面板打开时刷新，也可以手动刷新。配对心跳只交换控制信息。两端均需升级。

选择一个对端。选「双向」后点「同步一次」执行一次双向传输。只想由主设备发送时，进入「设备设置 → 传输方向」选择「本机为主」，开启「允许本机发送」，再回首页点「同步一次」。每个接收设备有独立开关。

删除时进入「设备设置 → 删除聊天」，点聊天标题，再选删除本机或指定对端。对端需主动开启「允许对端主设备删除」。两端记录有不同续写、聊天被置顶或正在使用时，操作会中止。聊天文件在本机 peer-sync-trash 暂存七天，插件运行时到期清理。删除标记会拦住旧缓存回传。

自动整理默认关闭。各设备在同步中心独立开启；完整内容相同的同步副本可在 DSH 归档中恢复。

在安卓 DSH Go 的聊天页点「局域双端同步」，或从「全部功能」打开「同步中心」。Windows DSH 引擎启动后，可在本机浏览器打开 http://127.0.0.1:39580 。

1. 两端连接同一 Wi-Fi 或手机热点，打开各自的本机引擎。在一端点「配对设备 → 创建邀请」。另一端点「查找附近设备」，选中邀请方并输入 20 位邀请码。广播受限时，可手动填写邀请方显示的地址和端口。邀请码五分钟内有效，创建邀请的设备需要 OpenSSL。
2. 在「同步中心」先点目标设备，然后选择「双向」「本机为主」或「对端为主」。双方仍可续写。如果离线期间各自写出了不同的内容，插件保留两份，并在插件聊天清单给主设备的版本标记「主线」。
3. 点「选择聊天 → 仅选中」，搜索本机工作区的聊天标题，逐条点选。另一端独有的聊天可以从另一端勾选。选择仅对当前这对设备生效，两端均升级后会互传这份清单。新建配对初始勾选为空，原有配对保留全部聊天。取消勾选会停止后续传输，已收到的记录仍保留。
4. 两端引擎运行时，点「同步一次」发起一次传输。聊天的附件随选中的记录传输；DSH-Shared 文件和插件按配对原有配置独立同步。手机被系统挂起时，重新打开引擎后可再次发起传输。

DSH Peer Sync（安卓 DSH Go / Windows DSH Desktop）
可直接从 npm 安装：dsh plugin --profile web add dsh-peer-sync（桌面版把 web 换成 desktop）
本机引擎均运行时可手动交换。手机作为局域网服务端，电脑连接手机；TLS 验证配对证书，手机验证配对密钥。IP 变化时客户端可通过带认证的 UDP 广播寻找手机。访客 Wi-Fi 客户隔离、系统省电挂起引擎、VPN 局域网屏蔽都会阻止同步。

聊天：通过 DSH 的接口读取、追加并关联到本机工作区。新对话双向同步，断线后补齐；同一条对话两边都有不同的新事件时保留独立分支。关闭仍占用写锁的会话可让另一端的后续记录在下次同步导入。聊天同步不重放历史工具。删除不会传到另一端。单个交换快照上限64 MiB，会话引用的图片和文件随记录传输。
文件：在工作区下的 DSH-Shared 放入需要共享的文档、图片等。单文件上限16 MiB。双端修改冲突时，接收的另一版在各自 peer-sync-cache/file-conflicts 中保留。仅支持列明的常用文档和媒体格式。
双手机配对自动发现插件，用配对手机发来的安装包补装缺失插件或升级。引擎自带模块使用本机版本。电脑配对沿用 portablePlugins 与 autoInstallPlugins 名单。
电脑设置 D:\dsh\.dsh\peer-sync-settings.json；手机引擎内 /root/.dsh/peer-sync-settings.json。设置含配对密钥，勿分享。每台主机使用自己的绝对路径。交换缓存留在本机，不要再用 Syncthing 双向复制 .dsh/sessions 和 profiles。received-plugins 在各自的 exchange 目录内。network-status.json 是最近一次网络轮询，receipts 是本机导入回执。关闭 App 引擎或禁用插件即可暂停。

首次配对（每位使用者独立操作）
1. 电脑安装 DSH Desktop，手机在 DSH Go 中启用本机引擎。电脑准备 Python 3，并运行 py -m pip install cryptography。
2. 在 Windows 运行以下命令，把路径和手机 Wi-Fi IP 换成自己的：
py pair.py --windows-home "D:\dsh\.dsh" --windows-workspace "D:\dsh\workspace" --phone-ip 192.168.1.20
3. 将 private-pair/windows/peer-sync-settings.json 放到电脑实际 DSH_HOME，peer.crt 放到该目录的 peer-sync-packages 子目录。将 private-pair/android/peer-sync-settings.json 放进手机本机引擎的 /root/.dsh；peer.crt 和 peer.key 放进 /root/.dsh/peer-sync-packages（没有则创建）。手机侧可用 DSH Go 自带终端从 /sdcard/Download 复制。不要覆盖已有配对。配对文件包含私钥和密钥，只交给这对设备，切勿再分享。
4. 两端都安装随附 tgz，在相应引擎终端执行 dsh plugin --profile desktop add "file:电脑上的安装包绝对路径"，手机用 dsh plugin --profile web add "file:/sdcard/Download/dsh-peer-sync-<版本>.tgz"。Windows 桌面版如没有全局 dsh，可使用安装目录下 resources/runtime/cli/bin/dsh.cmd。重启两个引擎。
5. 额外插件要在两端配置的 portablePlugins 中加入可信包名，需要自动安装的再写入 autoInstallPlugins。只支持可跨平台且声明受支持 files 清单的包。不会自动降级；安装失败看 peer-sync-cache/plugin-install-status-*.json。单机版插件、密钥、登录状态和个人配置不自动迁移。
### 两台安卓手机互传（v0.6.0）
两台手机都启动 DSH Go 本机引擎、连同一个 Wi-Fi。运行 `py pair.py --two-phones --phone-ip 192.168.1.20 --out private-pair`，把示例地址换成手机 A 的 Wi-Fi 地址。此命令只需运行一次，可以在电脑或装有 Python 与 cryptography 的环境中运行。生成后同步不需要电脑。

两台手机各安装同一份 tgz（web profile）。分别将 phone-a、phone-b 里的 peer-sync-settings.json 放到各自引擎的 /root/.dsh，证书和 A 的私钥放到各自 /root/.dsh/peer-sync-packages。A 监听，B 主动连接，两边都能发送和接收。重启后在 A 的 DSH-Shared 放一个小文件，在 B 核对，再反向测试。原标题、聊天续写和允许名单内插件使用同一套同步规则。每个引擎同一时间使用一套配对；从已有电脑配对切换前，备份两端原设置及证书目录。请勿公开或交叉混用配对密钥。

新版双手机配对默认开启全量插件合并。旧配对可在双方配对设置 JSON 中加入字段 `"syncAllPlugins": true`，升级后重启本机引擎。同步插件本身单独更新。插件账户、密钥和个人设置保留在各自设备。单插件安装包上限 16 MiB，安装依赖可能需要联网。个别插件失败可查看交换目录中的 plugin-pack-status 和 plugin-install-status 文件。

v0.7.2 会补传历史会话引用的图片、工具返回的图片和文件附件。两端均升级后，只要配对设备仍保有原件，就会自动补齐并校验 SHA-256。单个附件传输上限 64 MiB。交换目录中的 attachment-status.json 列出尚未找到的附件哈希。
