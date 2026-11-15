# AWAvenue 去广告（Egern 模块）使用说明

## 这是什么

AWAvenue 去广告规则的 Egern 原生模块，由上游 Surge 规则集自动转换而来：

- 上游：[TG-Twilight/AWAvenue-Ads-Rule](https://github.com/TG-Twilight/AWAvenue-Ads-Rule) 的 Surge RULE-SET 列表（当前版本 1.7.9-release）
- 规则内容：拦截广告、日志埋点与设备指纹上报的域名及 IP（984 条：955 个精确域名 + 12 个域名后缀 + 4 个关键字 + 13 个 IP）
- 本仓库每天 02:30（北京时间）自动跟随上游更新，转换脚本见 [`scripts/convert_awavenue_egern.py`](scripts/convert_awavenue_egern.py)

## 安装

Egern → 模块 → 右上角 `+` → 通过链接添加，粘贴：

```
https://raw.githubusercontent.com/zhaohantao1360-hash/muse-TCS/refs/heads/main/AWAvenue_Ads_egern.yaml
```

## 不需要 MITM

本模块只有拦截规则，没有改写脚本，不用装 MITM 证书，装上即用。

## 更新

- Egern 模块默认每 24 小时自动检查更新，上游有新版会自动跟上，无需手动操作
- 本仓库每天 02:30（北京时间）自动从上游拉取并转换，有变化才提交；无变化不产生新提交

## 故障排除

- **某个 App 打不开或功能异常**：先停用本模块，看是否恢复；恢复了就是规则误伤，把异常的 App 和现象告诉我，我看是上游规则的问题还是转换的问题
- **更新后没变化**：Egern 会缓存旧模块，先把 Egern 从后台彻底划掉重开，再不行就删掉模块重新添加
- **广告还在**：确认模块处于启用状态；本模块只拦上游列表里的域名，不在列表里的广告拦不住，可以把域名发我，我看上游有没有、要不要另外补
