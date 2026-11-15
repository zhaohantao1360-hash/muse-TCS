#!/usr/bin/env python3
"""把 Surge RULE-SET 列表（.list）转换成 Egern 原生模块（.yaml）。

专用于 AWAvenue 去广告规则：上游 TG-Twilight/AWAvenue-Ads-Rule 的
Filters/AWAvenue-Ads-Rule-Surge-RULE-SET.list。

转换对照（以本仓库 MT_egern.yaml、FanQieNovel_egern.yaml 的既有写法为准，
并以 Egern 官方模块文档 https://egernapp.com/docs/configuration/modules/ 为准）：
  - Surge DOMAIN -> Egern domain
  - Surge DOMAIN-SUFFIX -> Egern domain_suffix
  - Surge DOMAIN-KEYWORD -> Egern domain_keyword
  - Surge IP-CIDR -> Egern ip_cidr + no_resolve: true
    （上游 IP 条目本身不带 no-resolve；按本仓库 FanQieNovel 的既有做法与
    Egern 规则集惯例补上：IP 规则不触发 DNS 解析，直接按目标 IP 匹配。）
  - RULE-SET 本身不带策略；本模块统一以 REJECT 策略装载（去广告拦截）。
  - 本列表只有规则，无脚本、无 MITM，故模块不含 scriptings 与 mitm。

确定性：输出只含上游文件自带的版本号与更新时间，不含本次转换时间，
因此上游不变时重复运行输出字节完全一致（供 GitHub Action 判断是否需要提交）。

用法：
  python3 convert_awavenue_egern.py --url <上游 list 地址> --output AWAvenue_Ads_egern.yaml
  python3 convert_awavenue_egern.py --input AWAvenue-Ads-Rule-Surge-RULE-SET.list --output AWAvenue_Ads_egern.yaml
"""

import argparse
import re
import urllib.request

UPSTREAM_URL = (
    "https://raw.githubusercontent.com/TG-Twilight/AWAvenue-Ads-Rule/main/"
    "Filters/AWAvenue-Ads-Rule-Surge-RULE-SET.list"
)


def yaml_scalar(s):
    """把字符串写成 YAML 标量：能用 plain 就用 plain，否则单引号（单引号内 ' 写成 ''）。

    plain 标量安全条件（块上下文）：不以指示符开头、不含 ': '、不以空格结尾、
    不含 ' #'。域名、IP 均满足；以 '-' 开头的 KEYWORD 值（如 -ad.sm.cn）为保险起见
    走单引号。
    """
    if s == "":
        return "''"
    if s[0] in "-?:,[]{}#&*!|>'\"%@`":
        return "'" + s.replace("'", "''") + "'"
    if ": " in s or " #" in s or s != s.strip():
        return "'" + s.replace("'", "''") + "'"
    return s


def convert(text):
    version = ""
    updated = ""
    rules = []
    seen = set()
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            m = re.match(r"#Version:\s*(.*)", line)
            if m:
                version = m.group(1).strip()
            m = re.match(r"#Update time:\s*(.*)", line)
            if m:
                updated = m.group(1).strip()
            continue
        parts = [p.strip() for p in line.split(",")]
        rtype, value = parts[0], parts[1]
        key = (rtype, value)
        if key in seen:
            continue
        seen.add(key)
        if rtype == "DOMAIN":
            rules.append(("domain", value, {}))
        elif rtype == "DOMAIN-SUFFIX":
            rules.append(("domain_suffix", value, {}))
        elif rtype == "DOMAIN-KEYWORD":
            rules.append(("domain_keyword", value, {}))
        elif rtype == "IP-CIDR":
            rules.append(("ip_cidr", value, {"no_resolve": True}))
        elif rtype == "IP-CIDR6":
            rules.append(("ip_cidr6", value, {"no_resolve": True}))
        # 其他类型（如 PROCESS-NAME、URL-REGEX 等）上游本列表没有，出现时直接跳过。

    out = []
    out.append("# AWAvenue 去广告（Egern 模块）")
    out.append("# 来源：TG-Twilight/AWAvenue-Ads-Rule 的 Surge RULE-SET 列表，由本脚本自动转换而来，请勿手动编辑。")
    if version:
        out.append("# 上游版本：%s" % version)
    if updated:
        out.append("# 上游更新时间：%s" % updated)
    out.append("# 转换对照：Surge DOMAIN -> domain；DOMAIN-SUFFIX -> domain_suffix；")
    out.append("# DOMAIN-KEYWORD -> domain_keyword；IP-CIDR -> ip_cidr + no_resolve: true；")
    out.append("# RULE-SET 本身不带策略，本模块统一以 REJECT 策略装载。")
    out.append("name: AWAvenue去广告")
    out.append(
        "description: AWAvenue 去广告规则：拦截广告、日志埋点与设备指纹上报域名及 IP。"
        "由 TG-Twilight/AWAvenue-Ads-Rule 的 Surge 规则集自动转换，跟随上游更新。"
    )
    out.append("author: TG-Twilight（原版规则）；转换：muse-TCS 自动同步")
    out.append("homepage: https://github.com/TG-Twilight/AWAvenue-Ads-Rule")
    out.append(
        "manual: https://raw.githubusercontent.com/zhaohantao1360-hash/muse-TCS/refs/heads/main/AWAvenue_Ads_egern使用说明.md"
    )
    out.append("")

    if rules:
        out.append("rules:")
        cur_comment = None
        for rtype, match, extra in rules:
            group = {
                "domain": "广告/埋点/指纹域名直拒",
                "domain_suffix": "广告/埋点域名后缀直拒",
                "domain_keyword": "广告关键字直拒",
                "ip_cidr": "广告 IP 直拒（no_resolve：不做 DNS 解析直接匹配）",
                "ip_cidr6": "广告 IPv6 直拒（no_resolve：不做 DNS 解析直接匹配）",
            }[rtype]
            if group != cur_comment:
                out.append("  # %s" % group)
                cur_comment = group
            out.append("  - %s:" % rtype)
            out.append("      match: %s" % yaml_scalar(match))
            out.append("      policy: REJECT")
            if extra.get("no_resolve"):
                out.append("      no_resolve: true")

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
