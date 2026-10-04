/**
 * Egern Widget · 订阅流量监控（优化版）
 *
 * 基于 pronounAI/Egern 的 Subscription-Widget.js 二次优化：
 *  1. 双订阅支持（SUBSCRIPTION_URL / SUBSCRIPTION_URL2，对标 iBL3ND 双订阅工作流）
 *  2. 去掉 quickchart.io 外部仪表盘依赖，纯原生渲染，离线可用、国内更快
 *  3. 每月重置日倒计时（RESET_DAY；机场多为月结，服务端经常不给 expire）
 *  4. 进度条三档状态色：已用 <75% 绿 / 75–90% 橙 / ≥90% 红
 *  5. 数据层原样保留：多 UA 重试抓取、subscription-userinfo 解析、body 解析兜底、
 *     失败读缓存（stale）、PLAN_TOTAL_GB 兜底、锁屏小组件
 *
 * 在 Egern 中创建 Generic 脚本，粘贴本文件。
 *
 * 必填 env（至少配一组）：
 *   SUBSCRIPTION_URL    订阅地址 1
 * 可选 env：
 *   SUBSCRIPTION_NAME   订阅名称 1（默认 SUBSCRIPTION）
 *   RESET_DAY           每月重置日 1（1–31，如 25；不填则用服务端到期日）
 *   PLAN_TOTAL_GB       套餐总量 GB 1（订阅不返回 total 时的兜底，默认 100）
 *   SUBSCRIPTION_URL2 / SUBSCRIPTION_NAME2 / RESET_DAY2 / PLAN_TOTAL_GB2  订阅 2
 *   REFRESH_HOURS       刷新间隔（小时，默认 2，范围 0.5–24）
 *   SUBSCRIPTION_USER_AGENT  自定义 UA（默认自动多 UA 重试）
 *   WIDGET_STYLE        glass（默认，壁纸透出）| classic（纯色背景）
 */

const C = {
  bg:       { light: '#FFFFFF', dark: '#121111' },
  text:     { light: '#111114', dark: '#F7F7F8' },
  dim:      { light: '#7B7B84', dark: '#85858E' },
  panel:    { light: '#F5F5F7', dark: '#111114' },
  hairline: { light: '#E4E4E8', dark: '#242429' },
  track:    { light: '#E8E8ED', dark: '#202025' },
  accent:   { light: '#7446D8', dark: '#B765FF' },
  ok:       { light: '#2F9E58', dark: '#30D158' },
  warn:     { light: '#A06400', dark: '#FFBE3F' },
  fail:     { light: '#D64545', dark: '#FF626A' }
};

function numberEnv(ctx, key, fallback, min, max) {
  const value = Number(ctx.env?.[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function styleMode(ctx) {
  const value = String(ctx.env?.WIDGET_STYLE || 'glass').trim().toLowerCase();
  return value === 'classic' ? 'classic' : 'glass';
}

function rootBackground(mode) {
  return mode === 'classic' ? { backgroundColor: C.bg } : {};
}

function hashString(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

function storageKey(url) {
  return `egern.subscription.traffic.v2.${hashString(url)}`;
}

function readHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const target = String(name).toLowerCase();
  const matchedKey = Object.keys(headers).find(key => key.toLowerCase() === target);
  return matchedKey ? headers[matchedKey] : '';
}

function parseUserInfo(raw) {
  const values = {};
  String(raw || '').split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index < 1) return;
    const key = part.slice(0, index).trim().toLowerCase();
    const value = Number(part.slice(index + 1).trim());
    if (Number.isFinite(value)) values[key] = value;
  });

  if (!Number.isFinite(values.upload) || !Number.isFinite(values.download) || !Number.isFinite(values.total)) {
    return null;
  }

  const upload = Math.max(0, values.upload);
  const download = Math.max(0, values.download);
  const total = Math.max(0, values.total);
  const used = upload + download;
  const unlimited = total === 0;
  const remaining = unlimited ? Infinity : Math.max(0, total - used);
  const expireValue = Number(values.expire) || 0;
  const expireAt = expireValue > 1000000000000 ? expireValue : expireValue * 1000;

  return { upload, download, total, used, remaining, unlimited, expireAt };
}

function unitBytes(value, unit) {
  const powers = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4, PB: 5 };
  const power = powers[String(unit || '').toUpperCase()];
  if (power == null) return null;
  return Number(value) * (1024 ** power);
}

function parseBodyInfo(body) {
  const source = String(body || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  const expireMatch = source.match(/(?:有效期|到期(?:时间)?|过期(?:时间)?)[：:\s]*([12]\d{3}[-/.]\d{1,2}[-/.]\d{1,2})/i);
  const remainingMatch = source.match(/剩余(?:流量)?[：:\s]*([0-9]+(?:\.[0-9]+)?)\s*(PB|TB|GB|MB|KB|B)/i);
  if (!remainingMatch) return null;

  const remaining = unitBytes(remainingMatch[1], remainingMatch[2]);
  if (!Number.isFinite(remaining)) return null;

  const totalMatch = source.match(/(?:总(?:流量|量)|套餐流量)[：:\s]*([0-9]+(?:\.[0-9]+)?)\s*(PB|TB|GB|MB|KB|B)/i);
  const usedMatch = source.match(/已用(?:流量)?[：:\s]*([0-9]+(?:\.[0-9]+)?)\s*(PB|TB|GB|MB|KB|B)/i);
  const total = totalMatch ? unitBytes(totalMatch[1], totalMatch[2]) : null;
  const explicitUsed = usedMatch ? unitBytes(usedMatch[1], usedMatch[2]) : null;
  const used = Number.isFinite(explicitUsed)
    ? explicitUsed
    : Number.isFinite(total)
      ? Math.max(0, total - remaining)
      : null;

  let expireAt = 0;
  if (expireMatch) {
    const normalized = expireMatch[1].replace(/[/.]/g, '-');
    const parsed = new Date(`${normalized}T23:59:59`);
    if (!Number.isNaN(parsed.getTime())) expireAt = parsed.getTime();
  }

  return {
    upload: null,
    download: null,
    total,
    used,
    remaining,
    unlimited: false,
    expireAt,
    partial: !Number.isFinite(total),
    source: 'body'
  };
}

function applyPlanTotal(planGB, traffic) {
  if (!traffic || Number.isFinite(traffic.total) || !Number.isFinite(planGB) || planGB <= 0) return traffic;
  const total = planGB * (1024 ** 3);
  return {
    ...traffic,
    total,
    used: Math.max(0, total - traffic.remaining),
    partial: false,
    totalEstimated: true,
    source: `${traffic.source || 'body'}+env`
  };
}

async function fetchSubscription(ctx, url) {
  const customUA = String(ctx.env?.SUBSCRIPTION_USER_AGENT || '').trim();
  const userAgents = [...new Set([
    customUA,
    'clash.meta',
    'clash-verge/v2.2.3',
    'Surge/5.0',
    'Quantumult%20X/1.5.0'
  ].filter(Boolean))];

  const extract = async response => {
    const headerData = parseUserInfo(readHeader(response?.headers, 'subscription-userinfo'));
    if (headerData) return headerData;
    try {
      return parseBodyInfo(await response.text());
    } catch {
      return null;
    }
  };

  for (const userAgent of userAgents) {
    try {
      const response = await ctx.http.get(url, {
        timeout: 8000,
        redirect: 'manual',
        headers: { 'User-Agent': userAgent }
      });
      const direct = await extract(response);
      if (direct) return direct;

      const location = readHeader(response.headers, 'location');
      if (location && response.status >= 300 && response.status < 400) {
        const target = new URL(location, url).toString();
        const redirected = await ctx.http.get(target, {
          timeout: 8000,
          redirect: 'follow',
          headers: { 'User-Agent': userAgent }
        });
        const final = await extract(redirected);
        if (final) return final;
      }
    } catch {
      // Try next UA
    }
  }

  throw new Error('订阅未返回可识别的流量信息');
}

function parseResetDay(value) {
  const n = Number(String(value || '').trim());
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 0;
}

function subConfig(ctx, n) {
  const suffix = n === 1 ? '' : String(n);
  const planRaw = Number(ctx.env?.[`PLAN_TOTAL_GB${suffix}`]);
  return {
    url: String(ctx.env?.[`SUBSCRIPTION_URL${suffix}`] || '').trim(),
    name: String(ctx.env?.[`SUBSCRIPTION_NAME${suffix}`] || (n === 1 ? 'SUBSCRIPTION' : `订阅${n}`)).trim(),
    resetDay: parseResetDay(ctx.env?.[`RESET_DAY${suffix}`]),
    planGB: Number.isFinite(planRaw) && planRaw > 0 ? planRaw : 100
  };
}

async function loadOne(ctx, cfg) {
  if (!cfg.url) return { cfg, mode: 'setup' };
  const key = storageKey(cfg.url);
  try {
    const traffic = applyPlanTotal(cfg.planGB, await fetchSubscription(ctx, cfg.url));
    const result = { mode: 'live', traffic, updatedAt: Date.now() };
    ctx.storage?.setJSON(key, result);
    return { cfg, ...result };
  } catch (error) {
    const cached = ctx.storage?.getJSON(key);
    if (cached?.traffic) {
      return {
        cfg,
        mode: 'stale',
        traffic: applyPlanTotal(cfg.planGB, cached.traffic),
        updatedAt: cached.updatedAt,
        error: String(error?.message || error)
      };
    }
    return { cfg, mode: 'error', error: String(error?.message || error || '加载失败') };
  }
}

/** 距下次重置日天数（月结）。当天即重置日时返回整月天数。 */
function daysToReset(resetDay, nowMs = Date.now()) {
  if (!resetDay) return null;
  const now = new Date(nowMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let y = today.getFullYear();
  let m = today.getMonth();
  const mk = (yy, mm) => new Date(yy, mm, Math.min(resetDay, new Date(yy, mm + 1, 0).getDate()));
  let target = mk(y, m);
  if (target <= today) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    target = mk(y, m);
  }
  return Math.round((target - today) / 86400000);
}

function daysRemaining(expireAt) {
  if (!expireAt) return null;
  return Math.ceil((expireAt - Date.now()) / 86400000);
}

/* ---------------- 状态 ---------------- */

const STATUS = {
  setup:  { level: 0, label: '待配置',     icon: 'gearshape.fill',                bg: 'rgba(255,255,255,0.22)', fg: '#FFFFFF' },
  ok:     { level: 1, label: '数据已更新', icon: 'checkmark.circle.fill',         bg: 'rgba(255,255,255,0.25)',  fg: '#FFFFFF' },
  soon:   { level: 2, label: '即将重置',   icon: 'clock.badge.exclamationmark.fill', bg: 'rgba(255,190,63,0.30)', fg: '#FFBE3F' },
  low:    { level: 3, label: '流量偏低',   icon: 'exclamationmark.triangle.fill', bg: 'rgba(255,190,63,0.30)', fg: '#FFBE3F' },
  stale:  { level: 4, label: '数据延迟',   icon: 'clock.arrow.circlepath',        bg: 'rgba(255,190,63,0.30)', fg: '#FFBE3F' },
  error:  { level: 5, label: '更新失败',   icon: 'exclamationmark.circle.fill',   bg: 'rgba(214,69,69,0.35)',   fg: '#FF626A' },
  expired:{ level: 5, label: '套餐已过期', icon: 'xmark.circle.fill',             bg: 'rgba(214,69,69,0.35)',   fg: '#FF626A' }
};

function statusOfSub(sub) {
  if (sub.mode === 'setup') return STATUS.setup;
  if (sub.mode === 'error') return STATUS.error;
  const t = sub.traffic;
  const resetIn = daysToReset(sub.cfg.resetDay);
  const expDays = daysRemaining(t.expireAt);
  // 展示用天数：优先重置日，其次服务端到期日
  const days = resetIn != null ? resetIn : expDays;
  const ratio = t.unlimited || !Number.isFinite(t.total) || t.total <= 0
    ? null
    : t.remaining / t.total;

  if ((!t.unlimited && t.remaining <= 0) || (expDays != null && expDays <= 0)) return STATUS.expired;

  // 流量偏低、即将到期/重置是两个独立条件，不共用文案
  const trafficLow =
    (!t.unlimited && ratio != null && ratio <= 0.2) ||
    (t.partial && t.remaining <= 10 * (1024 ** 3));
  const timeSoon = days != null && days <= 7;

  if (sub.mode === 'stale') return STATUS.stale;
  if (trafficLow && timeSoon) return { ...STATUS.low, label: '流量/时间提醒' };
  if (trafficLow) return STATUS.low;
  if (timeSoon) {
    return resetIn != null ? STATUS.soon : { ...STATUS.soon, label: '即将到期' };
  }
  return STATUS.ok;
}

/** 多订阅取最严重的状态 */
function overallStatus(subs) {
  let worst = STATUS.ok;
  let anySetup = false;
  for (const s of subs) {
    if (s.mode === 'setup') { anySetup = true; continue; }
    const st = statusOfSub(s);
    if (st.level > worst.level) worst = st;
  }
  if (anySetup && worst.level <= STATUS.ok.level) return STATUS.setup;
  return worst;
}

/* ---------------- 格式化 ---------------- */

function formatBytes(bytes, decimals = 1) {
  if (!Number.isFinite(bytes)) return '不限量';
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / (1024 ** index);
  const digits = value >= 100 ? 0 : value >= 10 ? Math.min(1, decimals) : decimals;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '长期有效';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/** 剩余百分比 0–100；不限量/未知返回 null */
function percentRemaining(traffic) {
  if (traffic.unlimited || !Number.isFinite(traffic.total) || traffic.total <= 0) return null;
  return Math.max(0, Math.min(100, (traffic.remaining / traffic.total) * 100));
}

function optionalBytes(value) {
  return Number.isFinite(value) ? formatBytes(value) : '--';
}

function totalLabel(traffic) {
  if (traffic.unlimited) return '不限量';
  return optionalBytes(traffic.total);
}

/** 进度条三档色：按已用比例 绿<75% / 橙75–90% / 红≥90% */
function usageColor(percent) {
  if (percent == null) return C.accent;
  const used = 100 - percent;
  if (used >= 90) return C.fail;
  if (used >= 75) return C.warn;
  return C.ok;
}

/* ---------------- 基础组件 ---------------- */

function icon(name, color, size = 14) {
  return { type: 'image', src: `sf-symbol:${name}`, width: size, height: size, color };
}

function text(value, size, color, weight = 'regular', extra = {}) {
  return {
    type: 'text',
    text: String(value),
    font: { size, weight },
    textColor: color,
    maxLines: 1,
    ...extra
  };
}

function refreshAfterISO(ctx) {
  const hours = numberEnv(ctx, 'REFRESH_HOURS', 2, 0.5, 24);
  return new Date(Date.now() + hours * 3600000).toISOString();
}

function headerRow(status, isSmall = false) {
  const badge = isSmall
    ? {
        type: 'stack', direction: 'row', alignItems: 'center', justifyContent: 'center',
        padding: [4, 7, 4, 7], backgroundColor: status.bg, borderRadius: 12,
        children: [icon(status.icon, status.fg, 12)]
      }
    : {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 5,
        padding: [4, 10, 4, 8], backgroundColor: status.bg, borderRadius: 14,
        children: [icon(status.icon, status.fg, 13), text(status.label, 10, '#FFFFFF', 'semibold')]
      };

  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 7,
    children: [
      icon('chart.pie.fill', C.accent, 14),
      text('SUBSCRIPTION', 10, C.dim, 'bold', isSmall ? { minScale: 0.7 } : {}),
      { type: 'spacer' },
      badge
    ]
  };
}

function progressBar(traffic) {
  const percent = percentRemaining(traffic);
  const color = usageColor(percent);
  if (percent == null) {
    return {
      type: 'stack', direction: 'row', height: 5,
      backgroundColor: C.track, borderRadius: 3,
      children: [{
        type: 'stack', height: 5, backgroundColor: color, borderRadius: 3, flex: 1, children: []
      }]
    };
  }
  const active = Math.max(0.001, percent);
  const empty = Math.max(0.001, 100 - percent);
  return {
    type: 'stack', direction: 'row', height: 5,
    backgroundColor: C.track, borderRadius: 3,
    children: [
      { type: 'stack', height: 5, backgroundColor: color, borderRadius: 3, flex: active, children: [] },
      { type: 'spacer', flex: empty }
    ]
  };
}

/** 中尺寸单订阅行：名称 + 百分比 / 进度条 / 剩余·总量 + 重置/到期 */
function subBlock(sub) {
  const t = sub.traffic;
  const percent = percentRemaining(t);
  const pctText = t.unlimited ? '∞' : percent == null ? '--' : `${percent.toFixed(0)}%`;
  const resetIn = daysToReset(sub.cfg.resetDay);
  const rightInfo = resetIn != null
    ? `距重置 ${resetIn} 天`
    : `到期 ${formatDate(t.expireAt)}`;
  const leftInfo = t.unlimited
    ? '剩余 不限量'
    : `剩余 ${formatBytes(t.remaining)} · 共 ${totalLabel(t)}`;

  return {
    type: 'stack', direction: 'column', gap: 4,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          text(sub.cfg.name, 11, C.text, 'semibold', { minScale: 0.8 }),
          { type: 'spacer' },
          text(pctText, 11, usageColor(percent), 'bold')
        ]
      },
      progressBar(t),
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          text(leftInfo, 9, C.dim, 'medium', { minScale: 0.75 }),
          { type: 'spacer' },
          text(rightInfo, 9, C.dim, 'medium', { minScale: 0.75 })
        ]
      }
    ]
  };
}

function metric(label, value, color = C.text) {
  return {
    type: 'stack', direction: 'column', gap: 2, flex: 1,
    children: [
      text(label, 9, C.dim, 'semibold'),
      text(value, 12, color, 'semibold', { minScale: 0.68 })
    ]
  };
}

/* ---------------- 各尺寸 ---------------- */

function emptyWidget(subs, status, family, ctx) {
  const isSmall = family === 'systemSmall';
  const mode = styleMode(ctx);
  const setup = subs.every(s => s.mode === 'setup');
  const errMsg = subs.map(s => s.error).find(Boolean) || '';
  return {
    type: 'widget',
    ...rootBackground(mode),
    padding: isSmall ? [14, 16] : [16, 20],
    gap: 8,
    refreshAfter: refreshAfterISO(ctx),
    children: [
      headerRow(status, isSmall),
      { type: 'spacer' },
      {
        type: 'stack', direction: 'row',
        children: [
          { type: 'spacer' },
          {
            type: 'stack', direction: 'column', alignItems: 'center', gap: 6,
            children: [
              icon(setup ? 'link.badge.plus' : 'exclamationmark.triangle', setup ? C.dim : C.fail, isSmall ? 20 : 22),
              text(setup ? '等待订阅地址' : '无法读取流量', isSmall ? 13 : 15, C.text, 'semibold'),
              text(setup ? '请配置 SUBSCRIPTION_URL' : errMsg, 9, C.dim, 'medium', { minScale: 0.65 })
            ]
          },
          { type: 'spacer' }
        ]
      },
      { type: 'spacer' }
    ]
  };
}

function mediumWidget(subs, status, ctx) {
  const live = subs.filter(s => s.traffic);
  if (!live.length) return emptyWidget(subs, status, 'systemMedium', ctx);
  const mode = styleMode(ctx);
  return {
    type: 'widget',
    ...rootBackground(mode),
    padding: [16, 20, 14, 20],
    gap: live.length > 1 ? 10 : 8,
    refreshAfter: refreshAfterISO(ctx),
    children: [
      headerRow(status, false),
      ...live.map(subBlock)
    ]
  };
}

function smallWidget(subs, status, ctx) {
  const live = subs.filter(s => s.traffic);
  if (!live.length) return emptyWidget(subs, status, 'systemSmall', ctx);
  const sub = live[0];
  const t = sub.traffic;
  const percent = percentRemaining(t);
  const mode = styleMode(ctx);
  const resetIn = daysToReset(sub.cfg.resetDay);
  return {
    type: 'widget',
    ...rootBackground(mode),
    padding: [16, 18, 16, 18],
    gap: 7,
    refreshAfter: refreshAfterISO(ctx),
    children: [
      headerRow(statusOfSub(sub), true),
      { type: 'spacer' },
      text(formatBytes(t.remaining), 24, C.text, 'bold', {
        font: { size: 24, weight: 'bold', family: 'Menlo' }, minScale: 0.58
      }),
      {
        type: 'stack', direction: 'row',
        children: [
          text(sub.cfg.name, 10, C.dim, 'medium', { minScale: 0.7 }),
          { type: 'spacer' },
          text(t.unlimited ? '∞' : percent == null ? '--' : `${percent.toFixed(0)}%`, 11, usageColor(percent), 'semibold')
        ]
      },
      progressBar(t),
      { type: 'spacer' },
      text(
        resetIn != null ? `距重置 ${resetIn} 天` : `到期 ${formatDate(t.expireAt)}`,
        9, C.dim, 'medium'
      )
    ]
  };
}

function largeCard(sub, mode) {
  const t = sub.traffic;
  const percent = percentRemaining(t);
  const days = daysToReset(sub.cfg.resetDay);
  const expDays = daysRemaining(t.expireAt);
  const cardBg = mode === 'glass'
    ? { light: 'rgba(255,255,255,0.18)', dark: 'rgba(255,255,255,0.08)' }
    : C.panel;
  const hairlineBg = mode === 'glass'
    ? { light: 'rgba(255,255,255,0.25)', dark: 'rgba(255,255,255,0.12)' }
    : C.hairline;
  const daily = days != null && days > 0 && Number.isFinite(t.remaining) ? t.remaining / days : null;

  return {
    type: 'stack', direction: 'column', gap: 8,
    padding: [12, 14], backgroundColor: cardBg, borderRadius: 12,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          text(sub.cfg.name, 11, C.text, 'semibold', { minScale: 0.8 }),
          { type: 'spacer' },
          text(t.unlimited ? '∞' : percent == null ? '--' : `${percent.toFixed(0)}%`, 13, usageColor(percent), 'bold')
        ]
      },
      progressBar(t),
      {
        type: 'stack', direction: 'row', gap: 12,
        children: [
          metric('剩余', formatBytes(t.remaining)),
          metric('已用', optionalBytes(t.used)),
          metric('总量', totalLabel(t))
        ]
      },
      { type: 'stack', height: 1, backgroundColor: hairlineBg, children: [] },
      {
        type: 'stack', direction: 'row', gap: 12,
        children: [
          metric('重置/到期',
            days != null ? `${days} 天` : expDays == null ? '长期' : `${Math.max(0, expDays)} 天`),
          metric('日均可用', daily == null ? '--' : formatBytes(daily)),
          metric('到期日', days != null ? `重置日 ${sub.cfg.resetDay} 号` : formatDate(t.expireAt))
        ]
      }
    ]
  };
}

function largeWidget(subs, status, ctx) {
  const live = subs.filter(s => s.traffic);
  if (!live.length) return emptyWidget(subs, status, 'systemLarge', ctx);
  const mode = styleMode(ctx);
  return {
    type: 'widget',
    ...rootBackground(mode),
    padding: [18, 20, 18, 20],
    gap: 10,
    refreshAfter: refreshAfterISO(ctx),
    children: [
      headerRow(status, false),
      ...live.map(sub => largeCard(sub, mode)),
      { type: 'spacer' }
    ]
  };
}

function lockWidget(subs, family) {
  const live = subs.filter(s => s.traffic);
  if (!live.length) {
    const label = subs.every(s => s.mode === 'setup') ? '订阅流量：待配置' : '订阅流量：读取失败';
    return { type: 'widget', children: [text(label, 12, C.text, 'semibold')] };
  }
  const t = live[0].traffic;
  const percent = percentRemaining(t);
  const remaining = formatBytes(t.remaining);
  if (family === 'accessoryInline') {
    return { type: 'widget', children: [text(`剩余 ${remaining}${percent == null ? '' : ` · ${percent.toFixed(0)}%`}`, 12, C.text, 'semibold')] };
  }
  if (family === 'accessoryCircular') {
    return {
      type: 'widget', padding: 4,
      children: [
        icon('chart.pie.fill', C.text, 15),
        text(t.unlimited ? '∞' : percent == null ? '--' : `${percent.toFixed(0)}%`, 12, C.text, 'bold', { textAlign: 'center' })
      ]
    };
  }
  return {
    type: 'widget', gap: 2,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 5,
        children: [icon('chart.pie.fill', C.text, 12), text(live[0].cfg.name, 11, C.text, 'semibold')]
      },
      text(`剩余 ${remaining} · 到期 ${formatDate(t.expireAt)}`, 12, C.text, 'bold')
    ]
  };
}

export default async function(ctx) {
  const subs = [await loadOne(ctx, subConfig(ctx, 1))];
  const cfg2 = subConfig(ctx, 2);
  if (cfg2.url) subs.push(await loadOne(ctx, cfg2));

  const status = overallStatus(subs);
  const family = ctx.widgetFamily || 'systemMedium';
  if (family.startsWith('accessory')) return lockWidget(subs, family);
  if (family === 'systemSmall') return smallWidget(subs, status, ctx);
  if (family === 'systemLarge' || family === 'systemExtraLarge') return largeWidget(subs, status, ctx);
  return mediumWidget(subs, status, ctx);
}
