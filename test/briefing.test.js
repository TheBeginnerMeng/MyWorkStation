/* ============================================================
   晨会站会稿生成器测试：聚合逻辑、精简结构与口播预算
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededEnv } = require('./harness');

/** 去掉 Markdown 标记与空白，得到「念出来」的字数口径 */
function visibleText(md) {
  return md
    .replace(/^[#>\-*\|\s]+/gm, '')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s/g, '');
}

/** 取某个段落的内容（从标题到下一个 ## 之前） */
function section(md, marker) {
  const idx = md.indexOf(marker);
  if (idx < 0) return '';
  const rest = md.slice(idx + marker.length);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

/** 日期前后平移 n 天（与 U.addDays 同语义） */
function shift(ymd, n) {
  const d = new Date(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** 站会稿首行标题 */
function titleOf(md) {
  return md.split('\n')[0];
}

/** 期望的标题行 */
function expectTitle(env, ymd) {
  return '# 晨会 · ' + env.Utils.shortDate(ymd) + ' ' + env.Utils.weekCn(env.Utils.parseYmd(ymd));
}

test('简报：生成的站会稿应包含规格要求的四个段落', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build();
    assert.ok(/📝.*昨日产出/.test(md), '缺少「昨日产出」段落');
    assert.ok(/🚨.*生产问题/.test(md), '缺少「生产问题」段落');
    assert.ok(/🎯.*重点项目/.test(md), '缺少「重点项目」段落');
    assert.ok(/📅.*今日计划/.test(md), '缺少「今日计划」段落');
  } finally {
    env.cleanup();
  }
});

test('简报：应聚合昨日/今日已完成任务', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build();
    const doneTasks = env.Store.state.tasks.filter(
      (t) => t.status === 'done' && (t.date === env.Utils.yesterday() || t.date === env.Utils.today())
    );
    doneTasks.forEach((t) => {
      assert.ok(md.includes(t.title), `站会稿缺少已完成任务「${t.title}」`);
    });

    // 精确切出「昨日产出」段落（从 📝 到下一个 ## 为止）
    const coreSection = section(md, '## 📝');
    const doing = env.Store.state.tasks.find((t) => t.status === 'doing');
    assert.ok(!coreSection.includes(doing.title), '未完成任务不应出现在昨日产出段落');
  } finally {
    env.cleanup();
  }
});

test('简报：应聚合生产问题并区分跟进中与已解决', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build();
    const incidents = env.Store.state.incidents;
    incidents.forEach((i) => {
      assert.ok(md.includes(i.title), `站会稿缺少故障「${i.title}」`);
    });
    assert.ok(md.includes('⏳'), '跟进中故障缺少 ⏳ 标记');
    assert.ok(md.includes('✅'), '已解决故障缺少 ✅ 标记');
    assert.ok(/已解决/.test(md), '已解决故障缺少状态说明');

    // 跟进中的故障应带一句进展（截断后），已解决的不再展开
    const tracking = incidents.find((i) => i.status === 'tracking');
    const resolved = incidents.find((i) => i.status === 'resolved');
    assert.ok(md.includes(tracking.solution.slice(0, 10)), '跟进中故障缺少进展说明');
    assert.ok(!section(md, '## 🚨').includes(resolved.solution), '已解决故障不应再展开处置结果');
  } finally {
    env.cleanup();
  }
});

test('简报：应突出重点项目与长线任务', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build();
    const flagship = env.Store.state.tasks.filter((t) => t.flagship);
    assert.ok(flagship.length > 0, '演示数据缺少长线任务');

    const focusSection = section(md, '## 🎯');
    // 重点段落应包含旗舰项目名称
    const flagshipProjects = env.Store.state.projects.filter((p) => p.flagship);
    flagshipProjects.forEach((p) => {
      assert.ok(focusSection.includes(p.name), `重点段落缺少项目「${p.name}」`);
    });
    // 长线任务的标题或进展应体现在重点段落里
    flagship.forEach((t) => {
      const hit = focusSection.includes(t.title) || (t.note && focusSection.includes(t.note.slice(0, 10)));
      assert.ok(hit, `重点段落缺少长线任务「${t.title}」`);
    });
  } finally {
    env.cleanup();
  }
});

test('简报：今日工作计划应带时间段', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build();
    const planSection = section(md, '## 📅');
    assert.ok(/\d{2}:\d{2}-\d{2}:\d{2}/.test(planSection), '计划段缺少时间段');

    const pending = env.Store.state.tasks
      .filter((t) => t.status !== 'done')
      .filter((t) => t.date === env.Utils.today() || t.date === env.Utils.tomorrow())
      .sort((a, b) => (a.date === b.date ? 0 : a.date === env.Utils.today() ? -1 : 1));
    // 上限内的条目必须出现
    pending.slice(0, env.Briefing.limits.plan).forEach((t) => {
      assert.ok(planSection.includes(t.title), `计划段缺少任务「${t.title}」`);
    });
    // 超出上限的应折叠提示，而不是硬塞
    if (pending.length > env.Briefing.limits.plan) {
      assert.ok(/另有 \d+ 项排期未展开/.test(planSection), '超出上限的排期应折叠提示');
    }
  } finally {
    env.cleanup();
  }
});

test('简报：应统计各段落数据量并给出口播时长', async () => {
  const env = await createSeededEnv();
  try {
    env.Briefing.build();
    const md = env.Briefing.markdown;
    assert.ok(/已完成 \d+/.test(md), '页脚缺少已完成统计');
    assert.ok(/故障 \d+/.test(md), '页脚缺少故障统计');
    assert.ok(/重点 \d+/.test(md), '页脚缺少重点统计');
    assert.ok(/排期 \d+/.test(md), '页脚缺少排期统计');
    assert.ok(/口播约 \d+ 分/.test(md), '页脚缺少口播时长估算');
  } finally {
    env.cleanup();
  }
});

test('简报：站会稿应精简到 1-2 分钟念得完', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build();
    const meta = env.Briefing.meta;
    const chars = visibleText(md).length;

    // 站会预算：口播不超过 2 分钟，念出来的字数不超过 500
    assert.ok(meta.seconds <= 120, `口播 ${meta.seconds}s 超出站会时长`);
    assert.ok(chars <= 500, `可见文本 ${chars} 字，超出站会稿预算`);
    // 与演示数据规模匹配：不应把每个字段都展开
    assert.ok(!md.includes('确认新节点磁盘配额与副本策略，输出容量测算表。'),
      '不应把任务备注整段搬进站会稿');
  } finally {
    env.cleanup();
  }
});

test('简报：条目应折叠而非无限展开', async () => {
  const env = await createSeededEnv();
  try {
    // 造 6 条今日已完成任务，验证超出上限时折叠
    env.Store.mutate((s) => {
      for (let i = 1; i <= 6; i++) {
        s.tasks.push({
          id: 'bulk_' + i,
          title: '批量完成项 ' + i,
          project: s.projects[0].id,
          date: env.Utils.today(),
          startTime: '0' + i + ':00',
          endTime: '0' + i + ':30',
          status: 'done',
          priority: 'P2',
          note: '',
          flagship: false,
          // updatedAt 必须逐条递减：站会稿按 updatedAt 倒序取前 N 条，
          // 若循环内多次取 Date.now() 跨过毫秒边界，排序会随机变化导致用例偶发失败
          createdAt: Date.now() - i,
          updatedAt: Date.now() - i,
        });
      }
    }, 'bulk');

    const md = env.Briefing.build();
    const core = section(md, '## 📝');
    assert.ok(/另有 \d+ 项已完成/.test(core), '超出上限的产出应折叠提示');
    assert.ok(!core.includes('批量完成项 6'), '折叠后的条目不应出现在稿内');
  } finally {
    env.cleanup();
  }
});

test('简报：空数据时应给出占位说明而非崩溃', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.tasks = [];
      s.incidents = [];
      s.timeLogs = [];
    }, 'clear');
    const md = env.Briefing.build();
    assert.ok(typeof md === 'string' && md.length > 0, '空数据时未生成内容');
    assert.ok(/无已完成任务|暂无/.test(md), '空数据时缺少占位说明');
  } finally {
    env.cleanup();
  }
});

test('简报：用户输入内容不应破坏 Markdown 结构（防注入）', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.tasks.push({
        id: 'inject',
        title: '<img src=x onerror=alert(1)>',
        project: s.projects[0].id,
        date: env.Utils.today(),
        startTime: '09:00',
        endTime: '10:00',
        status: 'done',
        priority: 'P0',
        note: '',
        flagship: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }, 'inject');

    const md = env.Briefing.build();
    // Markdown 源里是原文（供复制到群里），但渲染后的 HTML 必须转义
    const html = env.Utils.mdToHtml(md);
    assert.ok(!html.includes('<img src=x'), '渲染结果存在 XSS 风险');
    assert.ok(html.includes('&lt;img'), '未对用户内容做转义');
  } finally {
    env.cleanup();
  }
});

test('简报：渲染视图应包含预览与复制按钮', async () => {
  const env = await createSeededEnv();
  try {
    env.Briefing.build();
    env.Briefing.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    assert.ok(root.textContent.includes('晨会汇报生成器'), '缺少标题');
    const buttons = Array.from(root.querySelectorAll('button')).map((b) => b.textContent);
    assert.ok(buttons.some((b) => /生成站会稿/.test(b)), '缺少生成按钮');
    assert.ok(buttons.some((b) => /复制 Markdown/.test(b)), '缺少复制按钮');
    assert.ok(root.querySelector('.md-body'), '缺少 Markdown 预览区');
    // 预览区应展示口播时长
    assert.ok(root.textContent.includes('口播'), '缺少口播时长提示');
  } finally {
    env.cleanup();
  }
});

test('简报：重新生成应覆盖旧结果', async () => {
  const env = await createSeededEnv();
  try {
    env.Briefing.build();
    const first = env.Briefing.markdown;
    env.Store.mutate((s) => {
      s.tasks = s.tasks.filter((t) => t.status !== 'done');
    }, 'clear-done');
    env.Briefing.build();
    const second = env.Briefing.markdown;
    assert.notEqual(first, second, '重新生成后内容未变化');
  } finally {
    env.cleanup();
  }
});

/* ============================================================
   站会日期口径：默认当天（不是第二天），且可手动改口径
   ============================================================ */

test('简报：标题默认应是当天，不得默认生成第二天', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build();
    assert.equal(titleOf(md), expectTitle(env, env.Utils.today()), '标题应为今天的日期');
    assert.notEqual(titleOf(md), expectTitle(env, env.Utils.tomorrow()), '标题不应是明天的日期');
  } finally {
    env.cleanup();
  }
});

test('简报：默认口径下段落表述应围绕今天', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build();
    assert.ok(/## 📝 昨日产出/.test(md), '产出段落应为「昨日产出」');
    assert.ok(/## 📅 今日计划/.test(md), '计划段落应为「今日计划」');
    assert.ok(/昨天至今/.test(md), '副标题口径应为「昨天至今」');
  } finally {
    env.cleanup();
  }
});

test('简报：站会日期改为明天后，标题与段落表述应整体跟随', async () => {
  const env = await createSeededEnv();
  try {
    const tomorrow = env.Utils.tomorrow();
    const md = env.Briefing.build(tomorrow);
    assert.equal(titleOf(md), expectTitle(env, tomorrow), '标题应为明天的日期');
    // 产出窗口 = [今天, 明天]
    assert.ok(/## 📝 今日产出/.test(md), '产出段落应为「今日产出」');
    // 排期窗口 = [明天, 后天]
    assert.ok(/## 📅 明日计划/.test(md), '计划段落应为「明日计划」');
    assert.ok(/今天至今/.test(md), '副标题口径应为「今天至今」');
  } finally {
    env.cleanup();
  }
});

test('简报：站会日期改为昨天后，产出窗口应回看前一天', async () => {
  const env = await createSeededEnv();
  try {
    const yest = env.Utils.yesterday();
    const prev = shift(yest, -1);
    const md = env.Briefing.build(yest);
    assert.equal(titleOf(md), expectTitle(env, yest), '标题应为昨天的日期');
    assert.ok(/## 📅 昨日计划/.test(md), '计划段落应为「昨日计划」');
    assert.ok(md.includes(env.Utils.friendlyDate(prev) + '至今'), '副标题口径应为前一日至今');

    // 产出窗口 = [前天, 昨天]：窗口内的已完成应出现，窗口外的不应出现
    const core = section(md, '## 📝');
    const inWindow = env.Store.state.tasks.filter(
      (t) => t.status === 'done' && (t.date === prev || t.date === yest)
    );
    inWindow.forEach((t) => {
      assert.ok(core.includes(t.title), `窗口内已完成任务「${t.title}」缺失`);
    });
    const outWindow = env.Store.state.tasks.filter(
      (t) => t.status === 'done' && t.date !== prev && t.date !== yest
    );
    outWindow.forEach((t) => {
      assert.ok(!core.includes(t.title), `窗口外的已完成任务「${t.title}」不应出现`);
    });
  } finally {
    env.cleanup();
  }
});

test('简报：非站会当天的排期应带日名标签，避免与当天混排', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build();
    const planSection = section(md, '## 📅');
    const tomorrowTasks = env.Store.state.tasks.filter(
      (t) => t.status !== 'done' && t.date === env.Utils.tomorrow()
    );
    assert.ok(tomorrowTasks.length > 0, '演示数据缺少次日排期');
    assert.ok(/- 明日 /.test(planSection), '次日排期应带「明日」标签');
    // 当天的排期不加标签
    const todayTasks = env.Store.state.tasks.filter(
      (t) => t.status !== 'done' && t.date === env.Utils.today()
    );
    if (todayTasks.length > 0) {
      assert.ok(!/- 今日 /.test(planSection), '站会当天的排期不应带日期标签');
    }
  } finally {
    env.cleanup();
  }
});

test('简报：界面应提供站会日期选择器，默认值为今天', async () => {
  const env = await createSeededEnv();
  try {
    env.Briefing.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    const native = root.querySelector('input[type=date]');
    assert.ok(native, '缺少站会日期控件');
    assert.equal(native.value, env.Utils.today(), '站会日期默认应为今天');
    assert.ok(root.textContent.includes('站会日期'), '缺少站会日期标签');
  } finally {
    env.cleanup();
  }
});

test('简报：界面改站会日期后生成，标题应跟随所选日期', async () => {
  const env = await createSeededEnv();
  try {
    env.Briefing.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    const native = root.querySelector('input[type=date]');
    const target = env.Utils.tomorrow();
    native.value = target;
    native.dispatchEvent(new env.window.Event('change', { bubbles: true }));

    const btn = Array.from(root.querySelectorAll('button')).find((b) => /生成站会稿/.test(b.textContent));
    assert.ok(btn, '缺少生成按钮');
    btn.click();

    assert.equal(titleOf(env.Briefing.markdown), expectTitle(env, target), '标题应跟随所选站会日期');
    assert.equal(env.Briefing.meta.anchorDate, target, '元信息应记录站会日期');
  } finally {
    env.cleanup();
  }
});

test('简报：重新生成应沿用已选的站会日期', async () => {
  const env = await createSeededEnv();
  try {
    const target = env.Utils.tomorrow();
    env.Briefing.build(target);
    const md = env.Briefing.build();
    assert.equal(titleOf(md), expectTitle(env, target), '重新生成应沿用已选站会日期');
    assert.equal(env.Briefing.anchor, target, '应暴露当前站会日期');
  } finally {
    env.cleanup();
  }
});

test('简报：非法站会日期应回退到今天', async () => {
  const env = await createSeededEnv();
  try {
    const md = env.Briefing.build('不是日期');
    assert.equal(titleOf(md), expectTitle(env, env.Utils.today()), '非法日期应回退到今天');
  } finally {
    env.cleanup();
  }
});

test('简报：改站会日期后，右栏数据来源应按新口径刷新', async () => {
  const env = await createSeededEnv();
  try {
    env.Briefing.render(env.document.getElementById('view-root'));
    const root = env.document.getElementById('view-root');
    const native = root.querySelector('input[type=date]');
    const target = env.Utils.tomorrow();
    native.value = target;
    native.dispatchEvent(new env.window.Event('change', { bubbles: true }));

    const text = root.textContent;
    assert.ok(text.includes('今日至今'), '站会日为明天时，已完成口径应为「今日至今」');
    assert.ok(text.includes('明日待办'), '站会日为明天时，排期口径应为「明日待办」');
    assert.ok(!text.includes('昨日至今'), '旧口径「昨日至今」应随站会日期刷新');
  } finally {
    env.cleanup();
  }
});
