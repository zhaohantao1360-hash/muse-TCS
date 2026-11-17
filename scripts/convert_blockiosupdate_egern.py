#!/usr/bin/env python3
"""把 Surge DOMAIN 规则列表（.list）转换成 Egern 原生模块（.yaml）。

专用于 BlockiOSUpdate（屏蔽 iOS 系统更新）：上游 ddgksf2013/Filter 的
BlockiOSUpdate.list（4 个苹果更新服务器域名）。

转换对照（以本仓库 MT_egern.yaml、AWAvenue_Ads_egern.yaml 的既有写法为准，
并以 Egern 官方模块文档 https://egernapp.com/docs/configuration/modules/ 为准）：
  - Surge DOMAIN -> Egern domain
  - RULE-SET 本身不带策略；本模块统一以 REJECT 策略装载（拦截更新检查与下载）。
  - 本列表只有规则，无脚本、无 MITM，故模块不含 scriptings 与 mitm。

确定性：输出不含本次转换时间，上游不变时重复运行输出字节完全一致
（供 GitHub Action 判断是否需要提交）。

用法：
  python3 convert_blockiosupdate_egern.py --url <上游 list 地址> --output BlockiOSUpdate_egern.yaml
  python3 convert_blockiosupdate_egern.py --input BlockiOSUpdate.list --output BlockiOSUpdate_egern.yaml
"""

import argparse
import urllib.request

UPSTREAM_URL = (
    "https://raw.githubusercontent.com/ddgksf2013/Filter/refs/heads/master/"
    "BlockiOSUpdate.list"
)

HEADER = """# 屏蔽 iOS 系统更新（Egern 模块）
# 来源：ddgksf2013/Filter 的 BlockiOSUpdate.list，由 Surge DOMAIN 规则转换而来，请勿手动编辑。
# 上游文件：https://raw.githubusercontent.com/ddgksf2013/Filter/refs/heads/master/BlockiOSUpdate.list
# 上游创建于 2025-12-21；iOS 27 可用（更新检查机制未换域名）。
# 转换对照：Surge DOMAIN -> domain；策略统一 REJECT。
# 注意：只拦更新检查与下载（{n} 个苹果更新服务器域名），不影响 App Store
# （应用下载走 appldnld.apple.com，不在内），也不删已下载的更新包；
# 只在代理开着时生效；与苹果 AI 规则（AppleIntelligence.list 26 条 +
# AppleIntelligence-Direct.list 4 条）零重叠，无冲突。
name: 屏蔽iOS系统更新
description: 屏蔽 iOS 系统更新检查与下载：拦截苹果更新服务器域名。由 ddgksf2013/Filter 的 BlockiOSUpdate.list 转换而来，iOS 27 可用，不影响 App Store 与苹果 AI 分流。
author: ddgksf2013（原版规则）；转换：Muse
homepage: https://github.com/ddgksf2013/Filter
"""


def convert(text):
    rules = []
    seen = set()
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 2 or parts[0] != "DOMAIN":
            continue
        value = parts[1]
        if value in seen:
            continue
        seen.add(value)
        rules.append(value)

    out = [HEADER.format(n=len(rules))]
    out.append("rules:")
    for match in rules:
        out.append("  - domain:")
        out.append("      match: %s" % match)
        out.append("      policy: REJECT")
    return "\n".join(out) + "\n", len(rules)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=UPSTREAM_URL)
    ap.add_argument("--input")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    if args.input:
        with open(args.input, encoding="utf-8") as f:
            text = f.read()
    else:
        req = urllib.request.Request(args.url, headers={"User-Agent": "muse-TCS-sync"})
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode("utf-8")
    out, n_rules = convert(text)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"rules={n_rules} -> {args.output}")


if __name__ == "__main__":
    main()
