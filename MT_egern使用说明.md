# 美团App去广告（Egern 模块）使用说明

## 这是什么

美团 App 去广告的 Egern 原生模块，由上游 Surge 模块自动转换而来：

- 上游：[muktsoen/SurgeRules](https://github.com/muktsoen/SurgeRules) 的 `MT.sgmodule`（美团 App 12.67.403）
- 上游的原始来源：ZenmoFeiShi 的 Qx `MT.snippet`，上游每日自动同步
- 本仓库每天 18:00（北京时间）自动跟随上游更新，转换脚本见 [`scripts/convert_mt_egern.py`](scripts/convert_mt_egern.py)

模块内容（以 2026-10-25 上游为准）：

- **35 条拦截规则**：广告/统计域名（`shark-*`、`httpdns*` 等）与广告 IP 段直拒
- **8 条响应改写脚本**（均引用上游原版 `MT.js`，无需本地托管）：
  - 首页 Tab、猜你喜欢/个人中心信息流、个人中心
  - 搜索默认词、搜索热词推荐
  - 助手角标、购物车入口、开屏图
- **MITM 域名**：`apimobile.meituan.com`、`feedguess.meituan.com`、`mop.meituan.com`、`mt-personalcenter.meituan.com`、`assistify.meituan.com`

## 安装

Egern → 模块 → 右上角 `+` → 通过链接添加，粘贴：

```
https://raw.githubusercontent.com/zhaohantao1360-hash/muse-TCS/refs/heads/main/MT_egern.yaml
```

## 必须开 MITM，否则脚本不生效

8 条改写脚本要解密 HTTPS 响应，必须在 Egern 里安装并信任 MITM 证书：

1. Egern → 设置 → MITM，生成并安装证书
2. 按提示去系统设置里信任证书（设置 → 通用 → 关于本机 → 证书信任设置 → 开启）
3. 保持本模块启用（模块自带 MITM 域名，无需手动填）

注意：不开 MITM 时，35 条拦截规则照常生效（域名/IP 直拒不需要解密），只是 8 条接口改写不会跑。

## 更新

- Egern 模块默认每 24 小时自动检查更新，上游有新版会自动跟上，无需手动操作
- 本仓库每天 18:00（北京时间）自动从上游拉取并转换，有变化才提交；无变化不产生新提交

## 故障排除

- **美团打不开或某个功能异常**：先停用本模块，看是否恢复；恢复了就是模块规则误伤，把异常页面告诉我，我从上游同步或单独处理
- **更新后没变化**：Egern 会缓存旧模块，先把 Egern 从后台彻底划掉重开，再不行就删掉模块重新添加
- **广告还在**：确认 MITM 证书已信任且模块处于启用状态；脚本类去广告依赖 MITM，证书没信任等于只生效了一半
