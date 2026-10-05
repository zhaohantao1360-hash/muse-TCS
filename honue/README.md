# honue 插件（优化版）

来源：[honue/rules](https://github.com/honue/rules) 仓库 `Loon/plugin/` 目录（2026-10-05 同步）。
本目录下的三个插件均为**优化后的版本**，可直接在 Loon 里通过链接安装。
原版如有更新，可对照下面的"优化点"自行决定是否跟进。

## 文件一览

| 文件 | 说明 | 上游原版 |
|---|---|---|
| `115.plugin` | 115 网盘 Cookie 获取：打开 115 小程序领券页（`vip.115.com/?ct=order&ac=coupon&app_type`）即自动抓取 Cookie 并通知 | [原版](https://github.com/honue/rules/blob/master/Loon/plugin/115.plugin) |
| `Douban.plugin` | 豆瓣开屏广告屏蔽 | [原版](https://github.com/honue/rules/blob/master/Loon/plugin/Douban.plugin) |
| `FanQieNovel.plugin` | 番茄小说去广告（底部 + 章末），不影响金币获取 | [原版](https://github.com/honue/rules/blob/master/Loon/plugin/FanQieNovel.plugin) |

## 相对原版的优化点

### 115.plugin —— 修了一个致命 bug，原版装上是完全不工作的
- **原版 `script-path=https://115.js` 是个死地址**（`115.js` 不是合法域名，脚本永远加载不到），插件装上等于没装。已修正为上游真实脚本地址 `https://raw.githubusercontent.com/honue/rules/refs/heads/master/Loon/scripts/115.js`（仓库里 `Loon/scripts/115.js` 真实存在，29KB）。
- 按脚本作者自己的注释补了 `requires-body=false, timeout=10`。
- 触发点保持原版（小程序领券页）：脚本本身只是读 `$request.headers` 里的 Cookie（过滤 UID/CID/SEID/KID），任何带登录态的 115 请求都能触发，所以触发点没问题。
- MITM `vip.115.com` 保持不变。

### Douban.plugin —— 清理
- 删掉两行已注释掉的死规则（`splash_preload` / `splash_show` 已被上面的宽泛规则覆盖）。
- 正则 `app_ads.+` → `app_ads.*`：连裸路径 `v2/app_ads` 也能命中，更稳。
- 改写统一为三段式 `_ reject` 写法（与 FanQieNovel 保持一致）。
- `#!desc` 去掉作者的 TODO 碎碎念；`#!icon` 换成 `refs/heads/master` 格式。

### FanQieNovel.plugin —— 去重、去误杀、去无关
1. **删重复**：`IP-CIDR,117.167.107.56/32` 在原版里出现了两次。
2. **注释掉"待定 IP 段"**：原版最后 10 条 `/32` IP（117.167.x.x、120.232/233.x.x）作者自己都写着"不清楚是获取章节还是广告"——这类 IP 误杀会直接断章节/听书，已整体注释并保留原 IP 备查。真遇到漏网广告 IP 再单独放开。
3. **移除 3 条抖音直播 URL-REGEX**（`douyincdn.com` 的 pull-flv、`douyinpic.com` / `douyinstatic.com` 的 webcast）：它们跟番茄小说毫无关系，装着本插件时刷抖音直播会被断流。
4. **MITM 清理**：删掉 `*.pangolin-sdk-toutiao` 这一条（没有顶级域名，永远匹配不到任何真实请求，属于笔误残留；带 `.com` 的那条还在）。
5. `#!icon` 换成 `refs/heads/master` 格式。

## 安装

Loon → 插件 → 右上角 + → 通过链接安装，粘贴下面对应链接（也可整仓订阅，见根 README）。

## 注意事项

- `FanQieNovel.plugin` 里仍保留了 `*default.ixigua.com` / `*novelapp.ixigua.com` 的 REJECT：这是番茄视频广告走的西瓜 CDN，同机房下西瓜视频 App 的部分请求也可能被误杀。如果平时还用西瓜视频，把这两行删掉即可（注释里有标）。
- 三个插件的上游作者是 honue，有问题先看上游仓库有没有更新。
