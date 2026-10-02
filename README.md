# muse-TCS
muse贪吃蛇

## 文件一览

| 文件 | 说明 |
|---|---|
| `PingMeSignin.lpx` | PingMe 每日自动签到 Loon 插件（由 mickeu 的 Egern 版移植）。定时任务默认每天 0 点起每 4 小时运行一次；抓参开关打开后，进 PingMe App 触发一次余额查询即自动保存签到参数 |
| `PingMeSignin_loon.js` | 插件的定时签到脚本（被 `PingMeSignin.lpx` 的 cron 任务引用；2026-10-01 起基于 fmz200/wool_scripts 原版的本地优化版（重试/退避/15s超时/视频失败分类/收益汇总）） |
| `pingme_capture_loon.js` | 插件的抓参脚本（被 `PingMeSignin.lpx` 的 http-request 引用，拦截余额查询接口保存签到参数） |
| `PingMeSignin_egern.yaml` | PingMe 每日自动签到 Egern 模块（2026-10-02 新增；fmz200 原版逻辑的本地优化版：真实设备 ID/不伪造、重试仅余额查询、今日已签跳过；`api.pingmeapp.net` 走 DIRECT；安装前请先停用旧版 PingMe 模块） |
| `PingMeSignin_egern.js` | Egern 模块的定时签到脚本（`ctx` API 原生写法） |
| `pingme_capture_egern.js` | Egern 模块的抓参脚本（与旧版抓参格式兼容，共用 `pingme_capture_v3`，无需重新抓参） |
| `WeTalkSignin.lpx` | WeTalk 自动化签到 Loon 插件（签到 + 5 次视频奖励，按 email 区分多账号）。脚本内嵌 Env.js 原生支持 Loon，`script-path` 直接引用作者原版地址，自动同步上游更新 |

## 使用方法

1. 把 `.lpx` 文件导入 Loon（插件 → 右上角 + → 通过链接/文件安装）
2. 按插件内的参数开关完成抓参（PingMe：进 App 查一次余额；WeTalk：进 App 查一次余额，收到"新账号已入库"通知后关闭抓取开关）
3. 定时任务会自动运行

## 备注

- `.lpx` 是纯文本单文件，无法内嵌脚本，JS 脚本需配合存放（本仓库内）或使用插件内注明的 raw 直链
- 抓参涉及的账号 token 保存在 Loon 本地，不在本仓库的任何文件中
