DSH Peer Sync 0.7.0（安卓 DSH Go / Windows DSH Desktop）
本机引擎均运行时每30秒交换一次。手机作为局域网服务端，电脑连接手机；TLS 验证配对证书，手机验证配对密钥。IP 变化时客户端可通过带认证的 UDP 广播寻找手机。访客 Wi-Fi 客户隔离、系统省电挂起引擎、VPN 局域网屏蔽都会阻止同步。

聊天：通过 DSH 的接口读取、追加并关联到本机工作区。新对话双向同步，断线后补齐；同一条对话两边都有不同的新事件时保留独立分支。关闭仍占用写锁的会话可让另一端的后续记录在下次同步导入。聊天同步不重放历史工具。删除不会传到另一端。单个交换快照上限64 MiB，附件不自动随会话搬运。
文件：在工作区下的 DSH-Shared 放入需要共享的文档、图片等。单文件上限16 MiB。双端修改冲突时，接收的另一版在各自 peer-sync-cache/file-conflicts 中保留。仅支持列明的常用文档和媒体格式。
双手机配对自动发现插件，用配对手机发来的安装包补装缺失插件或升级。引擎自带模块使用本机版本。电脑配对沿用 portablePlugins 与 autoInstallPlugins 名单。
电脑设置 D:\dsh\.dsh\peer-sync-settings.json；手机引擎内 /root/.dsh/peer-sync-settings.json。设置含配对密钥，勿分享。每台主机使用自己的绝对路径。交换缓存留在本机，不要再用 Syncthing 双向复制 .dsh/sessions 和 profiles。received-plugins 在各自的 exchange 目录内。network-status.json 是最近一次网络轮询，receipts 是本机导入回执。关闭 App 引擎或禁用插件即可暂停。

首次配对（每位使用者独立操作）
1. 电脑安装 DSH Desktop，手机在 DSH Go 中启用本机引擎。电脑准备 Python 3，并运行 py -m pip install cryptography。
2. 在 Windows 运行以下命令，把路径和手机 Wi-Fi IP 换成自己的：
py pair.py --windows-home "D:\dsh\.dsh" --windows-workspace "D:\dsh\workspace" --phone-ip 192.168.1.20
3. 将 private-pair/windows/peer-sync-settings.json 放到电脑实际 DSH_HOME，peer.crt 放到该目录的 peer-sync-packages 子目录。将 private-pair/android/peer-sync-settings.json 放进手机本机引擎的 /root/.dsh；peer.crt 和 peer.key 放进 /root/.dsh/peer-sync-packages（没有则创建）。手机侧可用 DSH Go 自带终端从 /sdcard/Download 复制。不要覆盖已有配对。配对文件包含私钥和密钥，只交给这对设备，切勿再分享。
4. 两端都安装随附 tgz，在相应引擎终端执行 dsh plugin --profile desktop add "file:电脑上的安装包绝对路径"，手机用 dsh plugin --profile web add "file:/sdcard/Download/dsh-peer-sync-0.6.0.tgz"。Windows 桌面版如没有全局 dsh，可使用安装目录下 resources/runtime/cli/bin/dsh.cmd。重启两个引擎。
5. 额外插件要在两端配置的 portablePlugins 中加入可信包名，需要自动安装的再写入 autoInstallPlugins。只支持可跨平台且声明受支持 files 清单的包。不会自动降级；安装失败看 peer-sync-cache/plugin-install-status-*.json。单机版插件、密钥、登录状态和个人配置不自动迁移。
### 两台安卓手机互传（v0.6.0）
两台手机都启动 DSH Go 本机引擎、连同一个 Wi-Fi。运行 `python pair.py --two-phones --phone-ip 192.168.1.20 --out private-pair`，把示例地址换成手机 A 的 Wi-Fi 地址。此命令只需运行一次，可以在电脑或装有 Python 与 cryptography 的环境中运行。生成后同步不需要电脑。

两台手机各安装同一份 tgz（web profile）。分别将 phone-a、phone-b 里的 peer-sync-settings.json 放到各自引擎的 /root/.dsh，证书和 A 的私钥放到各自 /root/.dsh/peer-sync-packages。A 监听，B 主动连接，两边都能发送和接收。重启后在 A 的 DSH-Shared 放一个小文件，在 B 核对，再反向测试。原标题、聊天续写和允许名单内插件使用同一套同步规则。每个引擎同一时间使用一套配对；从已有电脑配对切换前，备份两端原设置及证书目录。请勿公开或交叉混用配对密钥。

新版双手机配对默认开启全量插件合并。旧配对可在双方配对设置 JSON 中加入字段 `"syncAllPlugins": true`，升级后重启本机引擎。同步插件本身单独更新。插件账户、密钥和个人设置保留在各自设备。单插件安装包上限 16 MiB，安装依赖可能需要联网。个别插件失败可查看交换目录中的 plugin-pack-status 和 plugin-install-status 文件。
