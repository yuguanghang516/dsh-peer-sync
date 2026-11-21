DSH Peer Sync 0.4.0（安卓 DSH Go / Windows DSH Desktop）
本机引擎均运行时每30秒交换一次。手机作为局域网服务端，电脑连接手机；TLS 验证配对证书，手机验证配对密钥。IP 变化时客户端可通过带认证的 UDP 广播寻找手机。访客 Wi-Fi 客户隔离、系统省电挂起引擎、VPN 局域网屏蔽都会阻止同步。

聊天：通过 DSH 的接口读取、追加并关联到本机工作区。新对话双向同步，断线后补齐；同一条对话两边都有不同的新事件时保留独立分支。关闭仍占用写锁的会话可让另一端的后续记录在下次同步导入。聊天同步不重放历史工具。删除不会传到另一端。单个交换快照上限64 MiB，附件不自动随会话搬运。
文件：在工作区下的 DSH-Shared 放入需要共享的文档、图片等。单文件上限16 MiB。双端修改冲突时，接收的另一版在各自 peer-sync-cache/file-conflicts 中保留。仅支持列明的常用文档和媒体格式。
插件：两边共享插件清单，并交换 portablePlugins 名单内、具有支持的 files 清单的插件安装包。本次预设 dsh-free-search。收到的包在 peer-sync-cache/received-plugins；按需使用 DSH 的插件安装功能安装对应平台可用的版本。autoInstallPlugins 与 portablePlugins 都列出的插件会自动安装缺失版本或升级到对端较新的稳定版；重启引擎后加载。默认只为免费搜索开启。账号、API 密钥、系统权限、设备特有的插件设置不复制。
电脑设置 D:\dsh\.dsh\peer-sync-settings.json；手机引擎内 /root/.dsh/peer-sync-settings.json。设置含配对密钥，勿分享。每台主机使用自己的绝对路径。交换缓存留在本机，不要再用 Syncthing 双向复制 .dsh/sessions 和 profiles。received-plugins 在各自的 exchange 目录内。network-status.json 是最近一次网络轮询，receipts 是本机导入回执。关闭 App 引擎或禁用插件即可暂停。

首次配对（每位使用者独立操作）
1. 电脑安装 DSH Desktop，手机在 DSH Go 中启用本机引擎。电脑准备 Python 3，并运行 py -m pip install cryptography。
2. 在 Windows 运行以下命令，把路径和手机 Wi-Fi IP 换成自己的：
py pair.py --windows-home "D:\dsh\.dsh" --windows-workspace "D:\dsh\workspace" --phone-ip 192.168.1.20
3. 将 private-pair/windows/peer-sync-settings.json 放到电脑实际 DSH_HOME，peer.crt 放到该目录的 peer-sync-packages 子目录。将 private-pair/android/peer-sync-settings.json 放进手机本机引擎的 /root/.dsh；peer.crt 和 peer.key 放进 /root/.dsh/peer-sync-packages（没有则创建）。手机侧可用 DSH Go 自带终端从 /sdcard/Download 复制。不要覆盖已有配对。配对文件包含私钥和密钥，只交给这对设备，切勿再分享。
4. 两端都安装随附 tgz，在相应引擎终端执行 dsh plugin --profile desktop add "file:电脑上的安装包绝对路径"，手机用 dsh plugin --profile web add "file:/sdcard/Download/dsh-peer-sync-0.4.0.tgz"。Windows 桌面版如没有全局 dsh，可使用安装目录下 resources/runtime/cli/bin/dsh.cmd。重启两个引擎。
5. 额外插件要在两端配置的 portablePlugins 中加入可信包名，需要自动安装的再写入 autoInstallPlugins。只支持可跨平台且声明受支持 files 清单的包。不会自动降级；安装失败看 peer-sync-cache/plugin-install-status-*.json。单机版插件、密钥、登录状态和个人配置不自动迁移。