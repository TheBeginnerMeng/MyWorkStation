/* ============================================================
   工具库测试：日期时间、DOM、Markdown、剪贴板
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createEnv } = require('./harness');

test('日期：ymd / parseYmd 应使用本地时区，不发生 UTC 偏移', () => {
  const env = createEnv();
  try {
    const U = env.Utils;
    const d = new Date(2026, 10, 11, 23, 30); // 11月11日 23:30 本地时间
    assert.equal(U.ymd(d), '2026-11-11');
    assert.equal(U.ymd(new Date(2026, 0, 1)), '2026-01-01');
    // 回解析应还原同一时刻
    const back = U.parseYmd('2026-11-11');
    assert.equal(back.getFullYear(), 2026);
    assert.equal(back.getMonth(), 10);
    assert.equal(back.getDate(), 11);
    assert.equal(U.ymd(back), '2026-11-11');
  } finally {
    env.cleanup();
  }
});

test('日期：addDays 应正确跨月跨年', () => {
  const env = createEnv();
  try {
    const U = env.Utils;
    // 注意 Date 的月份参数从 0 开始：11 = 12月，2 = 3月
    // 2026-12-31 + 1 天 → 2027-01-01（跨年）
    assert.equal(U.ymd(U.addDays(new Date(2026, 11, 31), 1)), '2027-01-01');
    // 2026-12-30 + 1 天 → 2026-12-31
    assert.equal(U.ymd(U.addDays(new Date(2026, 11, 30), 1)), '2026-12-31');
    // 2027-01-01 - 1 天 → 2026-12-31（跨年回退）
    assert.equal(U.ymd(U.addDays(new Date(2027, 0, 1), -1)), '2026-12-31');
    // 2026-03-01 - 1 天 → 2026-02-28
    assert.equal(U.ymd(U.addDays(new Date(2026, 2, 1), -1)), '2026-02-28');
    // 闰年：2028-02-28 + 1 天 → 2028-02-29
    assert.equal(U.ymd(U.addDays(new Date(2028, 1, 28), 1)), '2028-02-29');
    assert.equal(U.ymd(U.addDays(new Date(2026, 1, 28), 1)), '2026-03-01');
    // 原对象不应被修改
    const base = new Date(2026, 5, 15);
    U.addDays(base, 10);
    assert.equal(U.ymd(base), '2026-06-15', 'addDays 污染了原日期对象');
  } finally {
    env.cleanup();
  }
});

test('时间：toMin / fromMin 双向一致', () => {
  const env = createEnv();
  try {
    const U = env.Utils;
    assert.equal(U.toMin('00:00'), 0);
    assert.equal(U.toMin('09:30'), 570);
    assert.equal(U.toMin('23:59'), 1439);
    assert.equal(U.fromMin(0), '00:00');
    assert.equal(U.fromMin(570), '09:30');
    assert.equal(U.fromMin(1439), '23:59');
    // 空值不应抛错
    assert.equal(U.toMin(''), 0);
    assert.equal(U.toMin(null), 0);
  } finally {
    env.cleanup();
  }
});

test('时长格式化：fmtDur 应输出 h/m 组合', () => {
  const env = createEnv();
  try {
    const U = env.Utils;
    assert.equal(U.fmtDur(0), '0m');
    assert.equal(U.fmtDur(45), '45m');
    assert.equal(U.fmtDur(60), '1h');
    assert.equal(U.fmtDur(90), '1h30m');
    assert.equal(U.fmtDur(150), '2h30m');
    assert.equal(U.fmtDur(-10), '0m');
  } finally {
    env.cleanup();
  }
});

test('HTML 转义：esc 必须转义所有危险字符', () => {
  const env = createEnv();
  try {
    const U = env.Utils;
    assert.equal(U.esc('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    assert.equal(U.esc("it's"), 'it&#39;s');
    assert.equal(U.esc('a & b'), 'a &amp; b');
    assert.equal(U.esc(null), '');
    assert.equal(U.esc(undefined), '');
  } finally {
    env.cleanup();
  }
});

test('Markdown 渲染：应正确处理标题、列表、加粗与转义', () => {
  const env = createEnv();
  try {
    const U = env.Utils;
    const html = U.mdToHtml('# 标题\n\n- 项目一\n- 项目二\n\n**加粗** 与 `代码`');
    assert.ok(html.includes('<h1>标题</h1>'), '未渲染一级标题');
    assert.ok(html.includes('<ul>') && html.includes('<li>项目一</li>'), '未渲染列表');
    assert.ok(html.includes('<strong>加粗</strong>'), '未渲染加粗');
    assert.ok(html.includes('<code>代码</code>'), '未渲染行内代码');
    // XSS 防护：Markdown 中的 HTML 应被转义
    const safe = U.mdToHtml('<img src=x onerror=alert(1)>');
    assert.ok(!safe.includes('<img'), 'Markdown 未转义 HTML，存在 XSS 风险');
    assert.ok(safe.includes('&lt;img'), '应输出转义后的标签');
  } finally {
    env.cleanup();
  }
});

test('颜色工具：alpha 应输出合法 rgba，pickText 应按亮度选色', () => {
  const env = createEnv();
  try {
    const U = env.Utils;
    assert.equal(U.alpha('#38bdf8', 0.5), 'rgba(56,189,248,0.5)');
    assert.equal(U.alpha('#fff', 1), 'rgba(255,255,255,1)');
    assert.equal(U.pickText('#ffffff'), '#0b1020'); // 亮色背景 → 深色文字
    assert.equal(U.pickText('#000000'), '#f8fafc'); // 暗色背景 → 亮色文字
  } finally {
    env.cleanup();
  }
});

test('Toast：应渲染到 toast-host 并在超时后移除', async () => {
  const env = createEnv();
  try {
    const host = env.document.getElementById('toast-host');
    env.Utils.toast('测试消息', 'success', 50);
    assert.equal(host.children.length, 1, 'Toast 未插入');
    assert.ok(host.textContent.includes('测试消息'), 'Toast 文本缺失');
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(host.children.length, 0, 'Toast 未按时移除');
  } finally {
    env.cleanup();
  }
});

test('剪贴板：copy 应写入剪贴板内容', async () => {
  const env = createEnv();
  try {
    await env.Utils.copy('hello clipboard');
    const buf = await env.window.navigator.clipboard.readText();
    assert.equal(buf, 'hello clipboard');
  } finally {
    env.cleanup();
  }
});

test('截断：trunc 应按字数裁剪并保留省略号', () => {
  const env = createEnv();
  try {
    const U = env.Utils;
    assert.equal(U.trunc('短文本', 10), '短文本');
    // 长度等于上限时不截断
    assert.equal(U.trunc('短文本', 3), '短文本');
    // 超出上限才裁剪并补省略号
    assert.equal(U.trunc('短文本', 2), '短…');
    // 连续空白压成单个空格
    assert.equal(U.trunc('a\n\n  b', 20), 'a b');
    // 空值安全
    assert.equal(U.trunc(null, 10), '');
    assert.equal(U.trunc(undefined, 10), '');
  } finally {
    env.cleanup();
  }
});

test('口播时长：speakSeconds 应按中文语速估算，fmtSeconds 输出可读文案', () => {
  const env = createEnv();
  try {
    const U = env.Utils;
    // 空文本应为 0
    assert.equal(U.speakSeconds(''), 0);
    // 约 45 个中文字 ≈ 10 秒（按 4.5 字/秒）
    const sec = U.speakSeconds('一'.repeat(45));
    assert.ok(sec >= 9 && sec <= 13, `口播估算偏差过大：${sec}s`);

    assert.equal(U.fmtSeconds(45), '45 秒');
    assert.equal(U.fmtSeconds(60), '1 分');
    assert.equal(U.fmtSeconds(75), '1 分 15 秒');
    assert.equal(U.fmtSeconds(0), '0 秒');
  } finally {
    env.cleanup();
  }
});
