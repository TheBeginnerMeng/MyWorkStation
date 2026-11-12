/* ============================================================
   取数登记台账测试：
   - 字典（状态 / 优先级 / 沟通类型）
   - 数据模型归一化（脏数据清洗）
   - 统计口径（总数 / 进行中 / 待核对 / 已超期 / 按状态 / 按优先级）
   - 取数编号生成（QS + YYYYMMDD + 当日序号）
   - 视图渲染与自动刷新
   - 取数单与四类子记录的必填校验、创建与编辑
   - 状态 / 优先级 / 关键词筛选
   - 删除与数据导出
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededEnv } = require('./harness');

/** 取最上层的弹窗（取数单弹窗上还会叠子记录弹窗） */
function topPanel(env) {
  const panels = env.document.querySelectorAll('#modal-host .panel');
  return panels[panels.length - 1] || null;
}

/** 在容器中按可见文本找到按钮并点击 */
function clickByText(root, matcher) {
  const btn = Array.from(root.querySelectorAll('button')).find((b) =>
    matcher.test(b.textContent.trim())
  );
  assert.ok(btn, `找不到按钮：${matcher}`);
  btn.click();
  return btn;
}

/** 取数单弹窗的文本输入框：[取数内容, 需求方, 产品, 数据侧, 执行人, 脚本路径, 涉及表, 结果路径]
 *  取数编号是日期控件承载的按钮，不在 text 输入框序列里 */
function queryInputs(modal) {
  return modal.querySelectorAll('input[type=text]');
}

/** 读编号按钮上显示的编号文本 */
function codeTextOf(modal) {
  const t = modal.querySelector('.picker-trigger.num .picker-text');
  return t ? t.textContent.trim() : '';
}

/** 编号按钮背后的日期载体（picker 的隐藏原生 input） */
function codeDateInput(modal) {
  const btn = modal.querySelector('.picker-trigger.num');
  if (!btn) return null;
  const wrap = btn.closest('.picker-field');
  return wrap ? wrap.querySelector('input[type=date]') : null;
}

/** 取数单弹窗的分区标签按钮 */
function tabButtons(modal) {
  return Array.from(modal.querySelectorAll('button.chip'));
}

/* ---------------- 字典与数据模型 ---------------- */

test('取数登记：字典应包含标准流程的各阶段状态', async () => {
  const env = await createSeededEnv();
  try {
    const labels = env.OpsDesk.DICT.queryStatus.map((s) => s.label);
    assert.ok(labels.includes('待评估'), '缺少「待评估」状态');
    assert.ok(labels.includes('口径已确认'), '缺少「口径已确认」状态');
    assert.ok(labels.includes('开发中'), '缺少「开发中」状态');
    assert.ok(labels.includes('已交付'), '缺少「已交付」状态');
    assert.ok(labels.includes('已核对归档'), '缺少「已核对归档」状态');
    assert.ok(labels.includes('已取消'), '缺少「已取消」状态');

    const pri = env.OpsDesk.DICT.queryPriority.map((p) => p.key);
    assert.deepEqual(pri, ['P0', 'P1', 'P2', 'P3'], '优先级字典不符');

    const ch = env.OpsDesk.DICT.channelType.map((c) => c.key);
    assert.ok(ch.includes('email'), '缺少邮件类型');
    assert.ok(ch.includes('meeting'), '缺少会议类型');
    assert.ok(ch.includes('im'), '缺少即时通讯类型');
  } finally {
    env.cleanup();
  }
});

test('取数登记：演示数据应包含口径 / SQL / 沟通 / 核对 / 变更全链路', async () => {
  const env = await createSeededEnv();
  try {
    const seed = env.Seed.build();
    assert.ok(Array.isArray(seed.queries), '演示数据缺少 queries');
    assert.ok(seed.queries.length > 0, '演示数据缺少取数单');
    seed.queries.forEach((q) => {
      assert.ok(q.title, '取数单缺少内容');
      assert.ok(q.code, '取数单缺少编号');
      assert.match(q.code, /^QS\d{8}\d{2}$/, '取数编号格式不符');
    });
    const full = seed.queries.find((q) => q.metrics.length && q.channels.length);
    assert.ok(full, '演示数据缺少带口径与沟通记录的取数单');
    assert.ok(full.sqlText, '演示数据缺少取数 SQL');
    assert.ok(full.sqlPath, '演示数据缺少脚本存放路径');
    assert.ok(full.resultPath, '演示数据缺少结果文件路径');
    assert.ok(full.checks.length, '演示数据缺少核对记录');
    assert.ok(full.caliberChanges.length, '演示数据缺少口径变更历史');
  } finally {
    env.cleanup();
  }
});

test('取数登记：normalize 应清洗脏数据', async () => {
  const env = await createSeededEnv();
  try {
    const out = env.Seed.normalize({
      projects: [],
      tasks: [],
      incidents: [],
      timeLogs: [],
      releases: [],
      queries: [
        {
          code: ' QS2026010601 ',
          title: '  职工培训取数  ',
          status: 'weird-status',
          priority: 'P9',
          requestDate: 'not-a-date',
          dueDate: '2026-13-45',
          metrics: [
            { name: '年度培训次数', definition: '按年统计', confirmedAt: 'bad-date' },
            { name: '', definition: '没有名称，应被丢弃' },
          ],
          channels: [{ type: 'weird-type', subject: '一封邮件', date: 'bad-date' }],
          checks: [{ date: 'bad-date', result: '一致' }],
          caliberChanges: [{ date: 'bad-date', from: 'A', to: 'B' }],
        },
        { code: 'QS2026010602', title: '   ' },
      ],
    });

    assert.equal(out.queries.length, 1, '无标题的取数单应被丢弃');
    const q = out.queries[0];
    assert.equal(q.code, 'QS2026010601', '编号应去除首尾空格');
    assert.equal(q.title, '职工培训取数', '标题应去除首尾空格');
    assert.equal(q.status, 'pending_eval', '非法状态应回落为「待评估」');
    assert.equal(q.priority, 'P2', '非法优先级应回落为 P2');
    assert.match(q.requestDate, /^\d{4}-\d{2}-\d{2}$/, '非法日期应回落为今天');
    assert.equal(q.dueDate, '', '非法日期应归一为空串');
    assert.equal(q.metrics.length, 1, '无名称的口径应被丢弃');
    assert.equal(q.metrics[0].confirmedAt, '', '非法确认日期应归一为空串');
    assert.equal(q.channels[0].type, 'other', '非法沟通类型应回落为「其他」');
    assert.equal(q.channels[0].date, '', '非法沟通日期应归一为空串');
    assert.equal(q.checks[0].date, '', '非法核对日期应归一为空串');
    assert.equal(q.caliberChanges[0].date, '', '非法变更日期应归一为空串');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 统计口径 ---------------- */

test('取数登记：统计口径应正确', async () => {
  const env = await createSeededEnv();
  try {
    const today = env.Utils.today();
    env.Store.mutate((s) => {
      s.queries = [
        {
          id: 'q1', code: 'QS2026010101', title: 'A', status: 'pending_eval', priority: 'P0',
          requestDate: today, dueDate: '2099-01-01', metrics: [], channels: [], checks: [], caliberChanges: [],
        },
        {
          id: 'q2', code: 'QS2026010102', title: 'B', status: 'developing', priority: 'P1',
          requestDate: today, dueDate: '2099-01-01', metrics: [], channels: [], checks: [], caliberChanges: [],
        },
        {
          id: 'q3', code: 'QS2026010103', title: 'C', status: 'delivered', priority: 'P2',
          requestDate: today, dueDate: '2099-01-01', metrics: [], channels: [], checks: [], caliberChanges: [],
        },
        {
          id: 'q4', code: 'QS2026010104', title: 'D', status: 'checked', priority: 'P2',
          requestDate: today, dueDate: '2099-01-01', metrics: [], channels: [], checks: [], caliberChanges: [],
        },
        {
          id: 'q5', code: 'QS2026010105', title: 'E', status: 'pending_eval', priority: 'P3',
          requestDate: '2020-01-01', dueDate: '2020-01-02', metrics: [], channels: [], checks: [], caliberChanges: [],
        },
      ];
    });

    const st = env.Store.queryStats();
    assert.equal(st.total, 5, '取数单总数不符');
    assert.equal(st.inProgress, 3, '进行中数量不符（待评估 + 开发中 + 口径已确认）');
    assert.equal(st.delivered, 2, '已交付数量不符（已交付 + 已核对归档）');
    assert.equal(st.toCheck, 1, '待核对数量不符');
    assert.equal(st.checked, 1, '已核对归档数量不符');
    assert.equal(st.overdue, 1, '已超期数量不符（应排除已归档）');

    const p0 = st.byPriority.find((b) => b.key === 'P0');
    assert.equal(p0.count, 1, 'P0 计数不符');
    const pending = st.byStatus.find((b) => b.key === 'pending_eval');
    assert.equal(pending.count, 2, '待评估计数不符');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 编号生成 ---------------- */

test('取数登记：编号应按 QS + 日期 + 当日序号生成', async () => {
  const env = await createSeededEnv();
  try {
    assert.equal(env.Queries.nextCode('2026-03-05'), 'QS2026030501', '首个编号应为 01');
    assert.equal(env.Queries.nextCode('2026-03-05'), 'QS2026030501', '同日同前缀不应自增');
    assert.equal(env.Queries.nextCode('2026-03-06'), 'QS2026030601', '不同日期应重新从 01 开始');

    env.Store.mutate((s) => {
      s.queries = [
        { id: 'q1', code: 'QS2026030501', title: 'A', status: 'pending_eval', priority: 'P2', requestDate: '2026-03-05' },
        { id: 'q2', code: 'QS2026030502', title: 'B', status: 'pending_eval', priority: 'P2', requestDate: '2026-03-05' },
      ];
    });
    assert.equal(env.Queries.nextCode('2026-03-05'), 'QS2026030503', '同日应递增到下一个序号');

    // 非法日期应回落到今天
    const today = env.Utils.today().replace(/-/g, '');
    assert.ok(
      env.Queries.nextCode('not-a-date').startsWith('QS' + today),
      '非法日期应回落到今天'
    );
  } finally {
    env.cleanup();
  }
});

/* ---------------- 编号可编辑 ---------------- */

test('取数登记：编号应可点击选日期并自动重新生成', async () => {
  const env = await createSeededEnv();
  try {
    env.Queries.openEditor(null);
    const modal = topPanel(env);

    // 编号默认按需求日期生成
    const initial = codeTextOf(modal);
    assert.match(initial, /^QS\d{8}\d{2}$/, '编号未自动生成');

    // 点击编号应弹出日期选择面板
    const trigger = modal.querySelector('.picker-trigger.num');
    assert.ok(trigger, '编号不是可点击控件');
    trigger.click();
    const panel = env.document.querySelector('body .picker-panel');
    assert.ok(panel, '点击编号未弹出日期控件');
    env.OpsDesk.Picker.closeAll();

    // 选一个日期 -> 编号自动重算
    const dateInput = codeDateInput(modal);
    assert.ok(dateInput, '编号缺少日期载体');
    dateInput.value = '2026-03-05';
    dateInput.dispatchEvent(new env.window.Event('change', { bubbles: true }));

    assert.equal(codeTextOf(modal), 'QS2026030501', '选日期后编号未重新生成');

    // 保存后落库为新编号
    queryInputs(modal)[0].value = '编号可编辑验证取数单';
    clickByText(topPanel(env), /创建取数单/);

    const created = env.Store.state.queries[env.Store.state.queries.length - 1];
    assert.equal(created.code, 'QS2026030501', '新编号未落库');
  } finally {
    env.cleanup();
  }
});

test('取数登记：编号日期应随需求日期联动（未手动指定过时）', async () => {
  const env = await createSeededEnv();
  try {
    env.Queries.openEditor(null);
    const modal = topPanel(env);

    // 改需求日期 -> 编号跟着重算
    const dateInputs = modal.querySelectorAll('input[type=date]');
    // 顺序：编号 / 需求日期 / 交付期限 / 数据周期起 / 数据周期止
    dateInputs[1].value = '2026-04-08';
    dateInputs[1].dispatchEvent(new env.window.Event('change', { bubbles: true }));

    assert.equal(codeTextOf(modal), 'QS2026040801', '编号未跟随需求日期变化');
  } finally {
    env.cleanup();
  }
});

test('取数登记：手动指定编号日期后不再跟随需求日期变化', async () => {
  const env = await createSeededEnv();
  try {
    env.Queries.openEditor(null);
    const modal = topPanel(env);

    const codeInput = codeDateInput(modal);
    codeInput.value = '2026-05-06';
    codeInput.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    assert.equal(codeTextOf(modal), 'QS2026050601', '手动选日期后编号未更新');

    // 再改需求日期，编号不应被带走
    const dateInputs = modal.querySelectorAll('input[type=date]');
    dateInputs[1].value = '2026-06-07';
    dateInputs[1].dispatchEvent(new env.window.Event('change', { bubbles: true }));

    assert.equal(codeTextOf(modal), 'QS2026050601', '手动指定编号日期后被需求日期带走了');
  } finally {
    env.cleanup();
  }
});

test('取数登记：编辑时未动编号应保留原编号', async () => {
  const env = await createSeededEnv();
  try {
    const q = env.Store.state.queries[0];
    env.Queries.openEditor(q);
    const modal = topPanel(env);

    // 演示数据的编号是 QS2026010601，若把自身算进去会变成 ...02
    assert.equal(codeTextOf(modal), q.code, '编辑时编号被自动改动了');

    queryInputs(modal)[0].value = '只改内容的取数单';
    clickByText(topPanel(env), /保存取数单/);

    const after = env.Store.state.queries.find((x) => x.id === q.id);
    assert.equal(after.code, q.code, '保存后编号被改动');
  } finally {
    env.cleanup();
  }
});

test('取数登记：编辑时改编号日期应重新生成编号', async () => {
  const env = await createSeededEnv();
  try {
    const q = env.Store.state.queries[0];
    env.Queries.openEditor(q);
    const modal = topPanel(env);

    const codeInput = codeDateInput(modal);
    codeInput.value = '2026-07-08';
    codeInput.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    assert.equal(codeTextOf(modal), 'QS2026070801', '编辑时改编号日期未重新生成');

    clickByText(topPanel(env), /保存取数单/);

    const after = env.Store.state.queries.find((x) => x.id === q.id);
    assert.equal(after.code, 'QS2026070801', '新编号未落库');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 视图渲染 ---------------- */

test('取数登记：视图应渲染取数单的全链路内容', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.App.go('queries');
    const text = env.document.getElementById('view-root').textContent;

    assert.ok(text.includes('取数登记'), '视图标题不符');
    const q = env.Store.state.queries[0];
    assert.ok(text.includes(q.code), '未渲染取数编号');
    assert.ok(text.includes(q.title), '未渲染取数内容');
    assert.ok(text.includes('指标口径'), '未渲染口径分区');
    assert.ok(text.includes('取数 SQL'), '未渲染 SQL 分区');
    assert.ok(text.includes('取数结果'), '未渲染结果分区');
    assert.ok(text.includes('沟通留痕'), '未渲染沟通分区');
    assert.ok(text.includes('核对记录'), '未渲染核对分区');
    assert.ok(text.includes('口径变更历史'), '未渲染口径变更分区');
    assert.ok(text.includes(q.sqlPath), '未渲染脚本存放路径');
    assert.ok(text.includes(q.metrics[0].name), '未渲染指标名称');
  } finally {
    env.cleanup();
  }
});

test('取数登记：数据变更后视图应自动刷新', async () => {
  const env = await createSeededEnv();
  try {
    env.OpsDesk.App.go('queries');
    env.Store.mutate((s) => {
      s.queries.push({
        id: 'qry_auto', code: 'QS2026123199', title: '自动刷新验证取数单',
        requester: '', pm: '', owner: '', executor: '',
        requestDate: '2026-12-31', periodStart: '', periodEnd: '', dueDate: '',
        priority: 'P2', status: 'pending_eval',
        metrics: [], sqlText: '', sqlPath: '', sqlTables: '', sqlEnv: '生产',
        executedAt: '', rowCount: 0, resultPath: '', resultSummary: '',
        channels: [], checks: [], caliberChanges: [], note: '',
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    const text = env.document.getElementById('view-root').textContent;
    assert.ok(text.includes('QS2026123199'), '数据变更后取数视图未自动刷新');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 取数单录入校验 ---------------- */

test('取数登记：取数内容为空应被拦截', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.queries.length;
    env.Queries.openEditor(null);
    const modal = topPanel(env);
    assert.ok(modal, '未打开取数单弹窗');

    clickByText(modal, /创建取数单/);

    assert.equal(env.Store.state.queries.length, before, '内容为空时不应创建取数单');
    assert.ok(topPanel(env), '校验失败时弹窗不应关闭');
    assert.ok(modal.textContent.includes('请填写取数内容'), '缺少取数内容必填提示');
  } finally {
    env.cleanup();
  }
});

test('取数登记：填写取数内容后错误提示应自动消除', async () => {
  const env = await createSeededEnv();
  try {
    env.Queries.openEditor(null);
    const modal = topPanel(env);
    clickByText(modal, /创建取数单/);
    assert.ok(modal.textContent.includes('请填写取数内容'), '应先出现必填提示');

    const input = queryInputs(modal)[0];
    input.value = '职工培训学时取数';
    input.dispatchEvent(new env.window.Event('input', { bubbles: true }));

    assert.ok(!modal.textContent.includes('请填写取数内容'), '填写后错误提示未消除');
  } finally {
    env.cleanup();
  }
});

test('取数登记：数据周期结束早于开始应被拦截', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.queries.length;
    env.Queries.openEditor(null);
    const modal = topPanel(env);

    queryInputs(modal)[0].value = '周期校验取数单';
    // 通过 picker 的隐藏原生 input 写入日期
    const dateInputs = modal.querySelectorAll('input[type=date]');
    // 顺序：编号日期 / 需求日期 / 交付期限 / 数据周期起 / 数据周期止
    dateInputs[3].value = '2026-05-01';
    dateInputs[4].value = '2026-04-01';

    clickByText(modal, /创建取数单/);

    assert.equal(env.Store.state.queries.length, before, '周期倒置时不应创建取数单');
    assert.ok(modal.textContent.includes('不能早于开始日期'), '缺少周期校验提示');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 子记录校验 ---------------- */

test('取数登记：指标口径缺少名称或定义应被拦截', async () => {
  const env = await createSeededEnv();
  try {
    env.Queries.openEditor(null);
    const modal = topPanel(env);
    tabButtons(modal)[1].click(); // 切到「指标口径」
    clickByText(modal, /添加指标口径/);

    const metricModal = topPanel(env);
    assert.ok(metricModal, '未打开指标口径弹窗');
    const inputs = metricModal.querySelectorAll('input[type=text]');
    const areas = metricModal.querySelectorAll('textarea');

    inputs[0].value = '年度培训次数';
    clickByText(metricModal, /添加口径/);
    assert.ok(metricModal.textContent.includes('请填写口径定义'), '缺少口径定义必填提示');

    areas[0].value = '按自然年统计培训开展次数';
    clickByText(metricModal, /添加口径/);
    assert.ok(topPanel(env), '口径填写完整后弹窗不应仍停留在校验态');
  } finally {
    env.cleanup();
  }
});

test('取数登记：核对记录缺少结论应被拦截', async () => {
  const env = await createSeededEnv();
  try {
    env.Queries.openEditor(null);
    const modal = topPanel(env);
    tabButtons(modal)[4].click(); // 切到「核对与变更」
    clickByText(modal, /添加核对记录/);

    const checkModal = topPanel(env);
    assert.ok(checkModal, '未打开核对记录弹窗');
    clickByText(checkModal, /添加核对记录/);

    assert.ok(checkModal.textContent.includes('请填写核对结论'), '缺少核对结论必填提示');
    assert.ok(topPanel(env), '校验失败时弹窗不应关闭');
  } finally {
    env.cleanup();
  }
});

test('取数登记：口径变更缺少新旧口径应被拦截', async () => {
  const env = await createSeededEnv();
  try {
    env.Queries.openEditor(null);
    const modal = topPanel(env);
    tabButtons(modal)[4].click();
    clickByText(modal, /添加变更记录/);

    const calModal = topPanel(env);
    const areas = calModal.querySelectorAll('textarea');
    areas[0].value = '合并统计';
    clickByText(calModal, /添加变更记录/);
    assert.ok(calModal.textContent.includes('请填写变更后的口径'), '缺少新口径必填提示');

    areas[1].value = '按关键词拆开统计';
    clickByText(calModal, /添加变更记录/);
    assert.ok(!calModal.textContent.includes('请填写变更后的口径'), '填写后错误提示未消除');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 创建与编辑 ---------------- */

test('取数登记：应能创建带口径与沟通记录的取数单', async () => {
  const env = await createSeededEnv();
  try {
    const before = env.Store.state.queries.length;

    env.Queries.openEditor(null);
    let modal = topPanel(env);
    const inputs = queryInputs(modal);
    inputs[0].value = '职工安全培训学时取数';
    inputs[1].value = '人力资源部（业务方）';
    inputs[2].value = '产品一组 · 乙同学';
    inputs[3].value = '数据侧 · 甲同学';

    // 编号应自动生成且符合 QS + 日期 + 序号
    assert.match(codeTextOf(modal), /^QS\d{8}\d{2}$/, '取数编号未自动生成');

    // 加一条指标口径
    tabButtons(modal)[1].click();
    clickByText(modal, /添加指标口径/);
    let sub = topPanel(env);
    sub.querySelectorAll('input[type=text]')[0].value = '年度信息安全培训次数';
    sub.querySelectorAll('textarea')[0].value = '按「年度开展的信息安全培训次数」统计';
    clickByText(sub, /添加口径/);

    // 加一条邮件沟通记录
    modal = topPanel(env);
    tabButtons(modal)[3].click();
    clickByText(modal, /添加沟通记录/);
    sub = topPanel(env);
    sub.querySelectorAll('input[type=text]')[0].value = '【取数需求】职工安全培训学时与参训人次统计';
    clickByText(sub, /添加记录/);

    modal = topPanel(env);
    clickByText(modal, /创建取数单/);

    const after = env.Store.state.queries;
    assert.equal(after.length, before + 1, '取数单未创建');
    const created = after[after.length - 1];
    assert.equal(created.title, '职工安全培训学时取数', '取数内容未写入');
    assert.equal(created.requester, '人力资源部（业务方）', '需求方未写入');
    assert.equal(created.pm, '产品一组 · 乙同学', '产品经理未写入');
    assert.equal(created.owner, '数据侧 · 甲同学', '数据侧对接人未写入');
    assert.equal(created.metrics.length, 1, '指标口径未写入');
    assert.equal(created.metrics[0].name, '年度信息安全培训次数', '指标名称未写入');
    assert.equal(created.channels.length, 1, '沟通留痕未写入');
    assert.equal(created.channels[0].type, 'email', '沟通类型未写入');
    assert.ok(created.code, '取数编号未写入');
  } finally {
    env.cleanup();
  }
});

test('取数登记：已保存取数单上新增口径应落库', async () => {
  const env = await createSeededEnv();
  try {
    const q = env.Store.state.queries[0];
    const before = q.metrics.length;

    env.Queries.addMetricTo(q);
    const metricModal = topPanel(env);
    metricModal.querySelectorAll('input[type=text]')[0].value = '新增指标口径';
    metricModal.querySelectorAll('textarea')[0].value = '这是新增的口径定义';
    clickByText(metricModal, /添加口径/);

    const after = env.Store.state.queries.find((x) => x.id === q.id);
    assert.equal(after.metrics.length, before + 1, '口径未写入');
    assert.equal(after.metrics[after.metrics.length - 1].name, '新增指标口径', '口径名称未写入');
  } finally {
    env.cleanup();
  }
});

test('取数登记：编辑已保存口径应落库', async () => {
  const env = await createSeededEnv();
  try {
    const q = env.Store.state.queries[0];
    const metricId = q.metrics[0].id;

    env.Queries.editMetricOf(q, q.metrics[0]);
    const metricModal = topPanel(env);
    metricModal.querySelectorAll('input[type=text]')[0].value = '改过的口径名称';
    clickByText(metricModal, /保存口径/);

    const after = env.Store.state.queries.find((x) => x.id === q.id);
    const m = after.metrics.find((x) => x.id === metricId);
    assert.ok(m, '口径丢失');
    assert.equal(m.name, '改过的口径名称', '口径名称未更新');
  } finally {
    env.cleanup();
  }
});

test('取数登记：删除口径应同步移除', async () => {
  const env = await createSeededEnv();
  try {
    const q = env.Store.state.queries[0];
    const metricId = q.metrics[0].id;
    const before = q.metrics.length;

    env.Queries.editMetricOf(q, q.metrics[0]);
    const metricModal = topPanel(env);
    clickByText(metricModal, /删除口径/);

    const after = env.Store.state.queries.find((x) => x.id === q.id);
    assert.equal(after.metrics.length, before - 1, '口径未被删除');
    assert.ok(!after.metrics.find((x) => x.id === metricId), '被删除的口径仍在');
  } finally {
    env.cleanup();
  }
});

test('取数登记：编辑取数单应更新原有记录而非新增', async () => {
  const env = await createSeededEnv();
  try {
    const q = env.Store.state.queries[0];
    const before = env.Store.state.queries.length;

    env.Queries.openEditor(q);
    const modal = topPanel(env);
    queryInputs(modal)[0].value = '改过的取数内容';
    clickByText(modal, /保存取数单/);

    const after = env.Store.state.queries;
    assert.equal(after.length, before, '编辑不应新增取数单');
    const target = after.find((x) => x.id === q.id);
    assert.equal(target.title, '改过的取数内容', '取数内容未更新');
    assert.equal(target.code, q.code, '编辑不应改变取数编号');
  } finally {
    env.cleanup();
  }
});

/* ---------------- 筛选 ---------------- */

test('取数登记：按状态筛选应只显示对应取数单', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.queries = [
        { id: 'q1', code: 'QS2026010101', title: '待评估单', status: 'pending_eval', priority: 'P2', requestDate: '2026-01-01', metrics: [], channels: [], checks: [], caliberChanges: [] },
        { id: 'q2', code: 'QS2026010102', title: '已交付单', status: 'delivered', priority: 'P2', requestDate: '2026-01-02', metrics: [], channels: [], checks: [], caliberChanges: [] },
      ];
    });

    env.Queries.filter.status = 'delivered';
    env.OpsDesk.App.go('queries');
    let text = env.document.getElementById('view-root').textContent;
    assert.ok(text.includes('已交付单'), '状态筛选后未显示对应取数单');
    assert.ok(!text.includes('待评估单'), '状态筛选后仍显示了其它状态的取数单');

    env.Queries.filter.status = 'all';
  } finally {
    env.cleanup();
  }
});

test('取数登记：按优先级筛选应只显示对应取数单', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.queries = [
        { id: 'q1', code: 'QS2026010101', title: '紧急取数单', status: 'pending_eval', priority: 'P0', requestDate: '2026-01-01', metrics: [], channels: [], checks: [], caliberChanges: [] },
        { id: 'q2', code: 'QS2026010102', title: '低优取数单', status: 'pending_eval', priority: 'P3', requestDate: '2026-01-02', metrics: [], channels: [], checks: [], caliberChanges: [] },
      ];
    });

    env.Queries.filter.priority = 'P0';
    env.OpsDesk.App.go('queries');
    let text = env.document.getElementById('view-root').textContent;
    assert.ok(text.includes('紧急取数单'), '优先级筛选后未显示对应取数单');
    assert.ok(!text.includes('低优取数单'), '优先级筛选后仍显示了其它优先级的取数单');

    env.Queries.filter.priority = 'all';
  } finally {
    env.cleanup();
  }
});

test('取数登记：关键词搜索应命中编号与需求方', async () => {
  const env = await createSeededEnv();
  try {
    env.Store.mutate((s) => {
      s.queries = [
        { id: 'q1', code: 'QS2026010101', title: '甲取数单', requester: '人力资源部', status: 'pending_eval', priority: 'P2', requestDate: '2026-01-01', metrics: [], channels: [], checks: [], caliberChanges: [] },
        { id: 'q2', code: 'QS2026010102', title: '乙取数单', requester: '业务运营组', status: 'pending_eval', priority: 'P2', requestDate: '2026-01-02', metrics: [], channels: [], checks: [], caliberChanges: [] },
      ];
    });

    env.Queries.filter.keyword = '人力资源部';
    env.OpsDesk.App.go('queries');
    let text = env.document.getElementById('view-root').textContent;
    assert.ok(text.includes('甲取数单'), '按需求方搜索未命中');
    assert.ok(!text.includes('乙取数单'), '按需求方搜索仍显示了无关内容');

    env.Queries.filter.keyword = 'QS2026010102';
    env.OpsDesk.App.go('queries');
    text = env.document.getElementById('view-root').textContent;
    assert.ok(text.includes('乙取数单'), '按编号搜索未命中');
    assert.ok(!text.includes('甲取数单'), '按编号搜索仍显示了无关内容');

    env.Queries.filter.keyword = '';
  } finally {
    env.cleanup();
  }
});

/* ---------------- 删除与导出 ---------------- */

test('取数登记：删除取数单应移除记录', async () => {
  const env = await createSeededEnv();
  try {
    const q = env.Store.state.queries[0];
    const before = env.Store.state.queries.length;

    env.Queries.removeQuery(q);
    const confirm = topPanel(env);
    assert.ok(confirm, '未弹出删除确认');
    clickByText(confirm, /确认删除/);

    const after = env.Store.state.queries;
    assert.equal(after.length, before - 1, '取数单未被删除');
    assert.ok(!after.find((x) => x.id === q.id), '被删除的取数单仍在');
  } finally {
    env.cleanup();
  }
});

test('取数登记：导出备份应包含取数单数据', async () => {
  const env = await createSeededEnv();
  try {
    const json = env.Storage.exportJSON(env.Store.state);
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed.state.queries), '备份中缺少 queries');
    assert.equal(
      parsed.state.queries.length,
      env.Store.state.queries.length,
      '备份取数单数不符'
    );
  } finally {
    env.cleanup();
  }
});
