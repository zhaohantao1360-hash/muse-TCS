#!/usr/bin/env python3
"""把 Surge 模块（.sgmodule）转换成 Egern 原生模块（.yaml）。

专用于美团去广告模块：上游 muktsoen/SurgeRules 的 MT.sgmodule（本身由
ZenmoFeiShi 的 Qx MT.snippet 每日自动同步而来）。

转换对照（以本仓库 FanQieNovel_egern.yaml、PingMeSignin_egern.yaml 的既有写法为准，
并以 Egern 官方模块文档 https://egernapp.com/docs/configuration/modules/ 为准）：
  - Surge [Rule] DOMAIN(+extended-matching) -> Egern domain（精确匹配）。
    注：Surge 的 extended-matching 只是“直连 IP 时也按 TLS SNI / HTTP Host 匹配”，
    不是匹配子域名；Egern 本来就按请求主机名匹配，故直接对应 domain，无需加后缀规则。
  - Surge DOMAIN-WILDCARD -> Egern domain_wildcard（通配符原样保留）。
  - Surge IP-CIDR / IP-CIDR6(+no-resolve) -> Egern ip_cidr / ip_cidr6 + no_resolve: true。
  - Surge [Script] type=http-response,pattern,script-path,requires-body
      -> Egern scriptings.http_response{name, match, script_url,
         body_required, binary_body: false, timeout: 60}。
    （body_required / binary_body 字段名以本仓库 PingMeSignin_egern.yaml 为准。）
  - Surge [MITM] hostname（去 %APPEND%）-> Egern mitm.hostnames.includes。

确定性：输出只含上游文件自带的版本号与更新时间，不含本次转换时间，
因此上游不变时重复运行输出字节完全一致（供 GitHub Action 判断是否需要提交）。

用法：
  python3 convert_mt_egern.py --url <上游 sgmodule 地址> --output MT_egern.yaml
  python3 convert_mt_egern.py --input MT.sgmodule --output MT_egern.yaml
"""

import argparse
import re
import sys
import urllib.request


def yaml_scalar(s):
    """把字符串写成 YAML 标量：能用 plain 就用 plain，否则单引号（单引号内 ' 写成 ''）。

    plain 标量安全条件（块上下文）：不以指示符开头、不含 ': '、不以空格结尾、
    不含 ' #'。本转换的域名、IP、正则 pattern 均满足（pattern 里的 ':' 后面都跟 '/'，
    '?' '|' 等只出现在中间位置）。
    """
    if s == "":
        return "''"
    if s[0] in "-?:,[]{}#&*!|>'\"%@`":
        return "'" + s.replace("'", "''") + "'"
    if ": " in s or " #" in s or s != s.strip():
        return "'" + s.replace("'", "''") + "'"
    return s


def parse_sgmodule(text):
    meta = {}
    sections = {}
    current = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#!"):
            m = re.match(r"#!(\w+)=(.*)", line)
            if m:
                meta[m.group(1)] = m.group(2).strip()
            continue
        if line.startswith("#"):
            m = re.match(r"#\s*更新时间：(.*)", line)
            if m:
                meta["upstream_updated"] = m.group(1).strip()
            continue
        if line.startswith("[") and line.endswith("]"):
            current = line[1:-1].strip()
            sections.setdefault(current, [])
            continue
        if current is not None:
            sections[current].append(line)
    return meta, sections


def convert_rule(line):
    """返回 (egern_type, match, extra_dict)，无法转换返回 None。"""
    parts = [p.strip() for p in line.split(",")]
    if len(parts) < 3:
        return None
    rtype, value, policy = parts[0], parts[1], parts[2]
    opts = parts[3:]
    if policy != "REJECT":
        return None
    if rtype == "DOMAIN":
        return ("domain", value, {})
    if rtype == "DOMAIN-WILDCARD":
        return ("domain_wildcard", value, {})
    if rtype == "IP-CIDR":
        extra = {"no_resolve": True} if "no-resolve" in opts else {}
        return ("ip_cidr", value, extra)
    if rtype == "IP-CIDR6":
        extra = {"no_resolve": True} if "no-resolve" in opts else {}
        return ("ip_cidr6", value, extra)
    return None


def parse_script(line):
    """Surge Script 行：NAME = k=v,k=v,..."""
    if "=" not in line:
        return None
    name, rest = line.split("=", 1)
    kv = {}
    for item in rest.strip().split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            kv[k.strip()] = v.strip()
    if kv.get("type") != "http-response":
        return None
    return {
        "name": name.strip(),
        "match": kv.get("pattern", ""),
        "script_url": kv.get("script-path", ""),
        "body_required": kv.get("requires-body", "false").lower() == "true",
    }


def convert(text):
    meta, sections = parse_sgmodule(text)
    out = []
    name = meta.get("name", "美团App去广告")
    # 上游 #!name 带目标 App 版本（如“美团App 12.67.403”），模块名固定为去广告名，
    # 版本号放进描述，避免每次上游改版就改模块名。
    out.append("# 美团App去广告（Egern 模块）")
    out.append("# 来源：muktsoen/SurgeRules 的 MT.sgmodule，由本脚本自动转换而来，请勿手动编辑。")
    out.append("# 上游原始来源：ZenmoFeiShi/Qx 的 MT.snippet（上游每日自动同步）。")
    out.append("# 上游模块名：%s" % name)
    if meta.get("upstream_updated"):
        out.append("# 上游更新时间：%s" % meta["upstream_updated"])
    out.append("# 转换对照：Surge [Rule] -> rules；[Script] http-response -> scriptings.http_response；")
    out.append("# [MITM] hostname -> mitm.hostnames.includes；extended-matching 在 Egern 无对应项，")
    out.append("# 其含义只是直连 IP 时也按 SNI/Host 匹配，Egern 按主机名匹配已等价，故直接用 domain。")
    out.append("name: 美团App去广告")
    out.append(
        "description: 美团App去广告：拦截广告/统计域名与 IP，改写首页、猜你喜欢、个人中心、"
        "搜索、购物车、开屏等接口响应。由 muktsoen/SurgeRules 的 MT.sgmodule 自动转换，跟随上游每日更新。"
    )
    out.append("author: TG@ZenMoFiShi（原版）；转换：muse-TCS 自动同步")
    out.append("homepage: https://github.com/muktsoen/SurgeRules")
    out.append(
        "manual: https://raw.githubusercontent.com/zhaohantao1360-hash/muse-TCS/refs/heads/main/MT_egern使用说明.md"
    )
    out.append("")

    rules = []
    for line in sections.get("Rule", []):
        r = convert_rule(line)
        if r:
            rules.append(r)
    if rules:
        out.append("rules:")
        cur_comment = None
        for rtype, match, extra in rules:
            # 按类型分组加注释（首次出现时）
            group = {
                "domain": "广告/统计域名直拒",
                "domain_wildcard": "广告域名通配直拒",
                "ip_cidr": "广告 IP 段直拒（no_resolve：不做 DNS 解析直接匹配）",
                "ip_cidr6": "广告 IPv6 段直拒（no_resolve：不做 DNS 解析直接匹配）",
            }[rtype]
            if group != cur_comment:
                out.append("  # %s" % group)
                cur_comment = group
            out.append("  - %s:" % rtype)
            out.append("      match: %s" % yaml_scalar(match))
            out.append("      policy: REJECT")
            if extra.get("no_resolve"):
                out.append("      no_resolve: true")
        out.append("")

    scripts = []
    for line in sections.get("Script", []):
        s = parse_script(line)
        if s:
            scripts.append(s)
    if scripts:
        out.append("scriptings:")
        for s in scripts:
            out.append("  - http_response:")
            out.append("      name: %s" % yaml_scalar(s["name"]))
            out.append("      match: %s" % yaml_scalar(s["match"]))
            out.append("      script_url: %s" % yaml_scalar(s["script_url"]))
            out.append("      timeout: 60")
            out.append(
                "      body_required: %s" % ("true" if s["body_required"] else "false")
            )
            out.append("      binary_body: false")
        out.append("")

    hostnames = []
    for line in sections.get("MITM", []):
        m = re.match(r"hostname\s*=\s*(.*)", line)
        if m:
            # %APPEND% 与第一个域名之间是空格分隔，不是逗号，先整体去掉
            value = re.sub(r"^%APPEND%\s+", "", m.group(1).strip())
            hostnames = [h.strip() for h in value.split(",") if h.strip()]
    if hostnames:
        out.append("mitm:")
        out.append("  hostnames:")
        out.append("    includes:")
        for h in hostnames:
            out.append("    - %s" % yaml_scalar(h))

    return "\n".join(out) + "\n", len(rules), len(scripts), len(hostnames)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--input")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    if args.url:
        req = urllib.request.Request(args.url, headers={"User-Agent": "muse-TCS-sync"})
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode("utf-8")
    elif args.input:
        with open(args.input, encoding="utf-8") as f:
            text = f.read()
    else:
        ap.error("需要 --url 或 --input")
    out, n_rules, n_scripts, n_hosts = convert(text)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"rules={n_rules} scripts={n_scripts} mitm_hostnames={n_hosts} -> {args.output}")


if __name__ == "__main__":
    main()
