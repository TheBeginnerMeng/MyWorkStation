/* ============================================================
   seed.js — 数据模型 + 内置演示数据
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;

  /* ---------------- 常量字典 ---------------- */

  var DICT = {
    taskStatus: [
      { key: 'todo', label: '待办', badge: 'badge-todo', color: '#60a5fa', next: 'doing' },
      { key: 'doing', label: '进行中', badge: 'badge-doing', color: '#38bdf8', next: 'done' },
      { key: 'done', label: '已完成', badge: 'badge-done', color: '#34d399', next: 'todo' },
      { key: 'blocked', label: '阻塞', badge: 'badge-blocked', color: '#f87171', next: 'todo' },
    ],
    priority: [
      { key: 'P0', label: 'P0 最高', color: '#f87171' },
      { key: 'P1', label: 'P1 高', color: '#fb923c' },
      { key: 'P2', label: 'P2 中', color: '#38bdf8' },
      { key: 'P3', label: 'P3 低', color: '#94a3b8' },
    ],
    incidentStatus: [
      { key: 'resolved', label: '已解决', badge: 'badge-resolved', color: '#34d399' },
      { key: 'tracking', label: '跟进中', badge: 'badge-tracking', color: '#fbbf24' },
    ],
    severity: [
      { key: 'P0', label: 'P0 致命', color: '#f87171' },
      { key: 'P1', label: 'P1 严重', color: '#fb923c' },
      { key: 'P2', label: 'P2 一般', color: '#fbbf24' },
      { key: 'P3', label: 'P3 轻微', color: '#94a3b8' },
    ],
    timeCategory: [
      { key: 'dev', label: '开发', color: '#38bdf8' },
      { key: 'ops', label: '运维', color: '#a78bfa' },
      { key: 'meeting', label: '会议', color: '#fbbf24' },
      { key: 'debug', label: '排错', color: '#f87171' },
    ],
    /** 投产内容类型 */
    releaseType: [
      { key: 'feature', label: '业务需求', icon: '✨', color: '#38bdf8' },
      { key: 'optimize', label: '技术优化', icon: '⚙️', color: '#a78bfa' },
      { key: 'fix', label: '缺陷修复', icon: '🐛', color: '#fb7185' },
      { key: 'other', label: '其他变更', icon: '📦', color: '#94a3b8' },
    ],
    /** 版本上线状态 */
    releaseStatus: [
      { key: 'planned', label: '待上线', badge: 'badge-todo', color: '#60a5fa' },
      { key: 'released', label: '已上线', badge: 'badge-done', color: '#34d399' },
      { key: 'rolledback', label: '已回滚', badge: 'badge-blocked', color: '#f87171' },
    ],
    /** 取数单状态（对应取数标准化流程的阶段） */
    queryStatus: [
      { key: 'pending_eval', label: '待评估', badge: 'badge-todo', color: '#60a5fa' },
      { key: 'caliber_confirmed', label: '口径已确认', badge: 'badge-doing', color: '#38bdf8' },
      { key: 'developing', label: '开发中', badge: 'badge-doing', color: '#a78bfa' },
      { key: 'delivered', label: '已交付', badge: 'badge-done', color: '#34d399' },
      { key: 'checked', label: '已核对归档', badge: 'badge-done', color: '#34d399' },
      { key: 'cancelled', label: '已取消', badge: 'badge-blocked', color: '#f87171' },
    ],
    /** 取数优先级 */
    queryPriority: [
      { key: 'P0', label: 'P0 紧急', color: '#f87171' },
      { key: 'P1', label: 'P1 高', color: '#fb923c' },
      { key: 'P2', label: 'P2 中', color: '#38bdf8' },
      { key: 'P3', label: 'P3 低', color: '#94a3b8' },
    ],
    /** 沟通留痕类型 */
    channelType: [
      { key: 'email', label: '邮件', icon: '✉️', color: '#38bdf8' },
      { key: 'meeting', label: '会议', icon: '🗣️', color: '#a78bfa' },
      { key: 'im', label: '即时沟通', icon: '💬', color: '#34d399' },
      { key: 'other', label: '其他', icon: '📎', color: '#94a3b8' },
    ],
  };

  /* ---------------- 项目 ---------------- */

  var PROJECTS = [
    { id: 'prj_migration', name: '集群迁移', color: '#38bdf8', flagship: true, desc: '核心存储与计算集群整体上云迁移' },
    { id: 'prj_ops', name: '日常运维', color: '#a78bfa', flagship: false, desc: '值班巡检、告警处理、版本迭代' },
    { id: 'prj_data', name: '数据平台', color: '#34d399', flagship: false, desc: 'Spark / Hive 数仓任务治理' },
    { id: 'prj_cost', name: '成本优化', color: '#fbbf24', flagship: false, desc: '资源利用率与带宽成本专项' },
  ];

  /* ---------------- 演示数据 ---------------- */

  function buildSeed() {
    var today = U.today();
    var yest = U.yesterday();
    var tomorrow = U.tomorrow();
    var dayBefore = U.ymd(U.addDays(new Date(), -2));

    var tasks = [
      /* —— 两条带时间的待办（首屏即见） —— */
      {
        id: 'tsk_demo_1',
        title: 'HDFS NameNode 扩容方案评审',
        project: '集群迁移',
        date: today,
        startTime: '09:30',
        endTime: '11:00',
        status: 'todo',
        priority: 'P1',
        note: '确认新节点磁盘配额与副本策略，输出容量测算表。',
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now() - 3600000,
      },
      {
        id: 'tsk_demo_2',
        title: 'Spark 作业倾斜调优 + 重跑验证',
        project: '数据平台',
        date: today,
        startTime: '14:00',
        endTime: '16:00',
        status: 'todo',
        priority: 'P0',
        note: '核心宽表存在热点 Key，需开 AQE 后重跑对比产出。',
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now() - 3600000,
      },

      /* —— 其他今日日程 —— */
      {
        id: 'tsk_demo_3',
        title: '每日集群巡检与告警确认',
        project: '日常运维',
        date: today,
        startTime: '08:30',
        endTime: '09:00',
        status: 'done',
        priority: 'P2',
        note: '',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 7200000,
      },
      {
        id: 'tsk_demo_4',
        title: '迁移灰度批次验收',
        project: '集群迁移',
        date: today,
        startTime: '16:30',
        endTime: '18:00',
        status: 'doing',
        priority: 'P0',
        note: '第 3 批次 12 个节点已切流，观察业务抖动指标。',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 1800000,
      },
      {
        id: 'tsk_demo_5',
        title: '成本优化周会',
        project: '成本优化',
        date: today,
        startTime: '10:00',
        endTime: '10:45',
        status: 'todo',
        priority: 'P3',
        note: '',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 3600000,
      },

      /* —— 昨日已完成（供晨会汇总） —— */
      {
        id: 'tsk_demo_6',
        title: '完成第 2 批次 8 个节点流量切换',
        project: '集群迁移',
        date: yest,
        startTime: '10:00',
        endTime: '12:30',
        status: 'done',
        priority: 'P0',
        note: '切流无异常，核心业务 P99 下降 12%。',
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now() - 43200000,
      },
      {
        id: 'tsk_demo_7',
        title: 'HDFS OOM 告警应急处置',
        project: '日常运维',
        date: yest,
        startTime: '20:10',
        endTime: '21:40',
        status: 'done',
        priority: 'P0',
        note: '临时扩容内存后恢复，已提交根因分析单。',
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now() - 39600000,
      },
      {
        id: 'tsk_demo_8',
        title: '数据同步链路断点续传验证',
        project: '数据平台',
        date: dayBefore,
        startTime: '15:00',
        endTime: '17:00',
        status: 'done',
        priority: 'P1',
        note: '',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now() - 86400000,
      },

      /* —— 重点项目 / 长线推进中 —— */
      {
        id: 'tsk_demo_9',
        title: '【长线】核心存储集群整体迁移 — 里程碑 M4',
        project: '集群迁移',
        date: tomorrow,
        startTime: '09:00',
        endTime: '18:00',
        status: 'doing',
        priority: 'P0',
        flagship: true,
        note: '累计完成 47/60 节点，剩余批次依赖网络侧专线交付。',
        createdAt: Date.now() - 86400000 * 5,
        updatedAt: Date.now() - 5400000,
      },
      {
        id: 'tsk_demo_10',
        title: '【长线】数仓分层重构与成本压降',
        project: '数据平台',
        date: tomorrow,
        startTime: '13:30',
        endTime: '17:30',
        status: 'doing',
        priority: 'P1',
        flagship: true,
        note: '已完成 6 张宽表下沉，存储成本环比下降 11%。',
        createdAt: Date.now() - 86400000 * 4,
        updatedAt: Date.now() - 7200000,
      },
    ];

    var incidents = [
      {
        id: 'inc_demo_1',
        title: 'HDFS 节点 OOM 告警',
        project: '日常运维',
        severity: 'P0',
        status: 'resolved',
        date: yest,
        occurredAt: '20:12',
        symptom: 'DataNode 进程触发 Container OOM 被 YARN 杀掉，节点内存占用持续 98%。',
        impact: '集群存储层 3 个节点离线，影响下游离线任务调度约 40 分钟，无数据丢失。',
        diagnosis:
          '1. 查看 YARN 容器日志，确认单容器内存配置 8G，节点可用内存仅 6G。\n' +
          '2. 排查该节点上运行任务，发现新上线的报表任务未做资源隔离，占满物理内存。\n' +
          '3. 关联近期变更记录，确认为当日上线任务缺少 memory 参数限制。',
        solution:
          '临时扩容节点内存至 64G 并重启节点恢复服务；为该报表任务补充 memory 限制参数，' +
          '并在 YARN 队列层面加入资源配额。已提交根因分析单，需补充上线前资源评估流程。',
        owner: '我',
        createdAt: Date.now() - 43200000,
        updatedAt: Date.now() - 3600000,
      },
      {
        id: 'inc_demo_2',
        title: 'Spark 作业 Stage 长尾导致 SLA 超时',
        project: '数据平台',
        severity: 'P1',
        status: 'tracking',
        date: today,
        occurredAt: '02:30',
        symptom: '核心宽表任务运行超 3 小时仍未结束，下游报表产出延迟。',
        impact: '影响 2 个下游报表，未造成数据错误。',
        diagnosis: '定位到单个 Partition 处理数据量是其他分区的 60 倍，疑似业务 Key 倾斜。',
        solution: '已开启 AQE 动态分区合并并对热点 Key 加盐，等待重跑结果验证性能提升幅度。',
        owner: '我',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now() - 1800000,
      },
      {
        id: 'inc_demo_3',
        title: '迁移灰度期间 NameNode GC 抖动',
        project: '集群迁移',
        severity: 'P2',
        status: 'tracking',
        date: dayBefore,
        occurredAt: '16:40',
        symptom: '切流期间 NameNode Full GC 频率上升，RPC 平均响应时间 320ms。',
        impact: '元数据操作变慢，业务侧无感知异常。',
        diagnosis: '切流后小文件数量激增，NameNode 堆内存占用上升触发频繁 GC。',
        solution: '已开启小文件合并巡检任务；调整 NameNode 堆内存配置并观察 48 小时 GC 曲线。',
        owner: '我',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 86400000,
      },
    ];

    var timeLogs = [
      { id: 'tl_1', date: today, startTime: '08:30', endTime: '09:00', category: 'ops', desc: '集群巡检与告警确认', project: '日常运维' },
      { id: 'tl_2', date: today, startTime: '09:00', endTime: '10:00', category: 'debug', desc: '定位 Spark 作业数据倾斜根因', project: '数据平台' },
      { id: 'tl_3', date: today, startTime: '10:00', endTime: '11:00', category: 'meeting', desc: '迁移方案评审会', project: '集群迁移' },
      { id: 'tl_4', date: today, startTime: '11:00', endTime: '12:00', category: 'dev', desc: '编写 Spark 调优脚本与 AQE 参数配置', project: '数据平台' },
      { id: 'tl_5', date: today, startTime: '13:30', endTime: '15:00', category: 'dev', desc: '编写 HDFS 节点批量校验脚本', project: '集群迁移' },
      { id: 'tl_6', date: today, startTime: '15:00', endTime: '16:30', category: 'ops', desc: '灰度批次切流值守', project: '集群迁移' },
      { id: 'tl_7', date: yest, startTime: '20:10', endTime: '21:40', category: 'debug', desc: 'HDFS OOM 应急处置', project: '日常运维' },
      { id: 'tl_8', date: yest, startTime: '10:00', endTime: '12:30', category: 'ops', desc: '第 2 批次节点流量切换', project: '集群迁移' },
    ].map(function (t) {
      t.createdAt = Date.now() - Math.floor(Math.random() * 86400000);
      return t;
    });

    var releases = [
      {
        id: 'rel_demo_1',
        version: 'v1.4.0',
        title: '迁移灰度保障版',
        date: yest,
        status: 'released',
        owner: '我',
        note: '配合第 2 批节点切流上线，同步上线监控与回滚预案。',
        items: [
          {
            id: 'rit_demo_1',
            type: 'feature',
            title: '集群迁移批次管理台账，支持按批次灰度与一键切流',
            dev: '我',
            note: '已接入变更审批流，切流前强制校验容量水位。',
          },
          {
            id: 'rit_demo_2',
            type: 'optimize',
            title: 'NameNode RPC 响应优化，批量元数据请求合并下发',
            dev: '我',
            note: '核心链路 P99 由 320ms 降至 90ms。',
          },
          {
            id: 'rit_demo_3',
            type: 'fix',
            title: '修复迁移期间小文件合并任务重复消费导致磁盘写满',
            dev: '我',
            note: '增加幂等校验与失败重试退避。',
          },
        ],
      },
      {
        id: 'rel_demo_2',
        version: 'v1.4.1',
        title: '成本压降周版本',
        date: today,
        status: 'planned',
        owner: '我',
        note: '待评审通过后安排窗口上线。',
        items: [
          {
            id: 'rit_demo_4',
            type: 'optimize',
            title: '数仓宽表分层下沉，冷数据自动归档至对象存储',
            dev: '我',
            note: '预计存储成本下降 11%。',
          },
          {
            id: 'rit_demo_5',
            type: 'fix',
            title: '修复 AQE 开启后部分作业反而变慢的退化问题',
            dev: '我',
            note: '按分区大小自适应调整 coalesce 阈值。',
          },
        ],
      },
    ];

    var queries = [
      {
        id: 'qry_demo_1',
        code: 'QS2026010601',
        title: '职工安全培训学时与参训人次取数',
        requester: '人力资源部（业务方）',
        pm: '产品一组 · 乙同学',
        owner: '数据侧 · 甲同学',
        executor: '数据开发 · 我',
        requestDate: '2026-01-05',
        periodStart: '2025-01-01',
        periodEnd: '2025-12-31',
        dueDate: '2026-01-08',
        priority: 'P1',
        status: 'checked',
        metrics: [
          {
            id: 'qmt_demo_1',
            name: '年度信息安全培训次数',
            definition:
              '按「年度开展的信息安全培训次数」统计，区分「本年开展次数」与「全年覆盖范围的信息安全培训次数」两个口径分别取数。',
            dims: '按年份 × 参训范围（全体职工 / 本年新入职）',
            filters: '培训主题命中「安全」或「信息安全」两个关键词，分别取数',
            confirmedBy: '产品一组 · 乙同学',
            confirmedAt: '2026-01-06',
          },
        ],
        sqlText:
          'SELECT stat_year,\n       split(kw, \',\') AS keyword,\n       COUNT(DISTINCT employee_id) AS emp_cnt,\n       SUM(hours) AS total_hours\nFROM   dwd_employee_training_detail\nWHERE  dt BETWEEN \'2025-01-01\' AND \'2025-12-31\'\n  AND  (keyword LIKE \'%安全%\' OR keyword LIKE \'%信息安全%\')\nGROUP  BY stat_year, keyword;',
        sqlPath: '/data/query/用户域/QS2026010601',
        sqlTables: 'dwd_employee_training_detail',
        sqlEnv: '生产',
        executedAt: '2026-01-06',
        rowCount: 6,
        resultPath: '/home/demo/下载/01-工作目录/2026年度/00-取数/20260106-取数',
        resultSummary: '全年信息安全培训 7 次；参训人次中「安全」与「信息安全」分别为 11 人次 / 4 人次（抽样自查，年度口径以正式取数为准）。',
        channels: [
          {
            id: 'qch_demo_1',
            type: 'email',
            date: '2026-01-05',
            subject: '【取数需求】职工安全培训学时与参训人次统计',
            from: '人力资源部 · 丙同学',
            to: '产品一组 · 乙同学',
            cc: '数据侧 · 甲同学',
            content:
              '业务侧确认口径后发此邮件，产品抄送数据侧。邮件中明确：按 2025 自然年统计，本次要分别按「安全」与「信息安全」两个关键词分开取数。',
          },
          {
            id: 'qch_demo_2',
            type: 'meeting',
            date: '2026-01-05',
            subject: '口径对齐会',
            from: '产品一组 · 乙同学',
            to: '数据侧 · 甲同学',
            cc: '人力资源部 · 丙同学',
            content:
              '确认「活跃用户占比」等口径是否可取，并敲定培训次数的统计范围与时间区间（2025-01-01 ~ 2025-12-31）。',
          },
        ],
        checks: [
          {
            id: 'qck_demo_1',
            date: '2026-01-07',
            withWho: '产品一组 · 乙同学',
            result: '双方核对一致',
            diff: '',
            note: '逐行核对关键词分组与参训人次，无差异。',
          },
        ],
        caliberChanges: [
          {
            id: 'qcc_demo_1',
            date: '2026-01-06',
            from: '信息安全培训次数（合并统计）',
            to: '按「安全」/「信息安全」两个关键词分开统计',
            reason: '20251008 上一版取过汇总口径，本次业务要求拆开',
            by: '数据侧 · 甲同学',
          },
        ],
        note: '脚本已归档到代码仓对应编号目录，后续复用时注意口径已按关键词拆分。',
        createdAt: Date.now() - 86400000 * 8,
        updatedAt: Date.now() - 86400000 * 6,
      },
      {
        id: 'qry_demo_2',
        code: 'QS2026020501',
        title: '活跃用户占比口径复核',
        requester: '业务运营组',
        pm: '产品二组 · 丁同学',
        owner: '数据侧 · 甲同学',
        executor: '',
        requestDate: '2026-02-04',
        periodStart: '2025-11-01',
        periodEnd: '2026-01-31',
        dueDate: '2026-02-10',
        priority: 'P2',
        status: 'pending_eval',
        metrics: [],
        sqlText: '',
        sqlPath: '',
        sqlTables: '',
        sqlEnv: '生产',
        executedAt: '',
        rowCount: 0,
        resultPath: '',
        resultSummary: '',
        channels: [
          {
            id: 'qch_demo_3',
            type: 'im',
            date: '2026-02-05',
            subject: '口径疑问',
            from: '产品二组 · 丁同学',
            to: '数据侧 · 甲同学',
            cc: '',
            content:
              '待确认：20251104 口径已调整为「获得学时才纳入计算」，本次是沿用该口径，还是改回平均月活？',
          },
        ],
        checks: [],
        caliberChanges: [],
        note: '口径待评估，尚未进入开发。',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 3600000,
      },
    ];

    /* 演示数据统一打标记：便于「清除演示数据」精确识别，不与真实数据混淆 */
    var out = {
      schemaVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: {
        theme: 'dark',
        activeView: 'dashboard',
        focusProjectId: 'prj_migration',
      },
      projects: U.clone(PROJECTS),
      tasks: tasks,
      incidents: incidents,
      timeLogs: timeLogs,
      releases: releases,
      queries: queries,
    };
    ['projects', 'tasks', 'incidents', 'timeLogs', 'releases', 'queries'].forEach(function (k) {
      out[k].forEach(function (r) { r.demo = true; });
    });

    return out;
  }

  /* ---------------- 归一化 / 修复 ---------------- */

  /**
   * 补全缺失字段、剔除脏数据，保证任何来源的数据都能安全渲染
   */
  function normalize(state) {
    var s = state && typeof state === 'object' ? state : {};
    var out = {
      schemaVersion: 1,
      createdAt: s.createdAt || Date.now(),
      updatedAt: s.updatedAt || Date.now(),
      settings: Object.assign(
        { theme: 'dark', activeView: 'dashboard', focusProjectId: null },
        s.settings || {}
      ),
      projects: [],
      tasks: [],
      incidents: [],
      timeLogs: [],
      releases: [],
      queries: [],
    };

    var projIds = {};
    (Array.isArray(s.projects) ? s.projects : []).forEach(function (p, i) {
      if (!p || !p.name) return;
      var id = p.id || U.uid('prj');
      projIds[id] = true;
      out.projects.push({
        id: id,
        name: String(p.name),
        color: p.color || '#38bdf8',
        flagship: !!p.flagship,
        desc: p.desc || '',
        demo: !!p.demo,
      });
    });
    /* 注意：这里不再补演示项目。
       以前「没有项目就塞 4 个演示项目」的兜底，会让用户删空项目后每次启动又冒出测试数据。 */

    var statusKeys = {};
    DICT.taskStatus.forEach(function (d) {
      statusKeys[d.key] = true;
    });
    var incKeys = {};
    DICT.incidentStatus.forEach(function (d) {
      incKeys[d.key] = true;
    });

    /** 兼容「项目 ID」与「项目名称」两种写法，避免归属塌缩到首个项目 */
    function resolveProject(value) {
      if (!value) return out.projects.length ? out.projects[0].id : '';
      if (projIds[value]) return value;
      for (var i = 0; i < out.projects.length; i++) {
        if (out.projects[i].name === value) return out.projects[i].id;
      }
      return out.projects.length ? out.projects[0].id : '';
    }

    (Array.isArray(s.tasks) ? s.tasks : []).forEach(function (t) {
      if (!t || !t.title) return;
      out.tasks.push({
        id: t.id || U.uid('tsk'),
        title: String(t.title),
        project: resolveProject(t.project),
        date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : U.today(),
        startTime: /^\d{2}:\d{2}$/.test(t.startTime || '') ? t.startTime : '09:00',
        endTime: /^\d{2}:\d{2}$/.test(t.endTime || '') ? t.endTime : '10:00',
        status: statusKeys[t.status] ? t.status : 'todo',
        priority: t.priority || 'P2',
        note: t.note || '',
        flagship: !!t.flagship,
        demo: !!t.demo,
        createdAt: t.createdAt || Date.now(),
        updatedAt: t.updatedAt || Date.now(),
      });
    });

    (Array.isArray(s.incidents) ? s.incidents : []).forEach(function (i) {
      if (!i) return;
      out.incidents.push({
        id: i.id || U.uid('inc'),
        title: i.title || '未命名故障',
        project: resolveProject(i.project),
        severity: i.severity || 'P2',
        status: incKeys[i.status] ? i.status : 'tracking',
        date: /^\d{4}-\d{2}-\d{2}$/.test(i.date || '') ? i.date : U.today(),
        occurredAt: i.occurredAt || '00:00',
        symptom: i.symptom || '',
        impact: i.impact || '',
        diagnosis: i.diagnosis || '',
        solution: i.solution || '',
        owner: i.owner || '我',
        demo: !!i.demo,
        createdAt: i.createdAt || Date.now(),
        updatedAt: i.updatedAt || Date.now(),
      });
    });

    var catKeys = {};
    DICT.timeCategory.forEach(function (d) {
      catKeys[d.key] = true;
    });

    (Array.isArray(s.timeLogs) ? s.timeLogs : []).forEach(function (l) {
      if (!l) return;
      out.timeLogs.push({
        id: l.id || U.uid('tl'),
        date: /^\d{4}-\d{2}-\d{2}$/.test(l.date || '') ? l.date : U.today(),
        startTime: /^\d{2}:\d{2}$/.test(l.startTime || '') ? l.startTime : '09:00',
        endTime: /^\d{2}:\d{2}$/.test(l.endTime || '') ? l.endTime : '10:00',
        category: catKeys[l.category] ? l.category : 'dev',
        desc: l.desc || '',
        project: l.project ? resolveProject(l.project) : null,
        demo: !!l.demo,
        createdAt: l.createdAt || Date.now(),
      });
    });

    /* ---------------- 版本投产 ---------------- */

    var relStatusKeys = {};
    DICT.releaseStatus.forEach(function (d) {
      relStatusKeys[d.key] = true;
    });
    var relTypeKeys = {};
    DICT.releaseType.forEach(function (d) {
      relTypeKeys[d.key] = true;
    });

    (Array.isArray(s.releases) ? s.releases : []).forEach(function (r) {
      if (!r) return;
      var version = String(r.version == null ? '' : r.version).trim();
      if (!version) return; // 没有版本号的记录直接丢弃
      var items = [];
      (Array.isArray(r.items) ? r.items : []).forEach(function (it) {
        if (!it) return;
        var title = String(it.title == null ? '' : it.title).trim();
        if (!title) return; // 没有内容标题的条目直接丢弃
        items.push({
          id: it.id || U.uid('rit'),
          type: relTypeKeys[it.type] ? it.type : 'other',
          title: title,
          dev: String(it.dev == null ? '' : it.dev).trim(),
          note: it.note || '',
        });
      });
      out.releases.push({
        id: r.id || U.uid('rel'),
        version: version,
        title: r.title || '',
        date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : U.today(),
        status: relStatusKeys[r.status] ? r.status : 'planned',
        owner: r.owner || '',
        note: r.note || '',
        items: items,
        demo: !!r.demo,
        createdAt: r.createdAt || Date.now(),
        updatedAt: r.updatedAt || Date.now(),
      });
    });

    /* ---------------- 取数登记 ---------------- */

    var qStatusKeys = {};
    DICT.queryStatus.forEach(function (d) {
      qStatusKeys[d.key] = true;
    });
    var qPriorityKeys = {};
    DICT.queryPriority.forEach(function (d) {
      qPriorityKeys[d.key] = true;
    });
    var qChannelKeys = {};
    DICT.channelType.forEach(function (d) {
      qChannelKeys[d.key] = true;
    });

    /**
     * 日期归一化：既校验格式，也校验是否为真实存在的日期
     * （如 2026-13-45 虽然格式匹配，但会让「已超期」判断失真）
     */
    function qDate(v, fallback) {
      var s = String(v == null ? '' : v).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
      var p = s.split('-');
      var d = new Date(+p[0], +p[1] - 1, +p[2]);
      if (d.getFullYear() !== +p[0] || d.getMonth() !== +p[1] - 1 || d.getDate() !== +p[2]) {
        return fallback;
      }
      return s;
    }

    (Array.isArray(s.queries) ? s.queries : []).forEach(function (q) {
      if (!q) return;
      var title = String(q.title == null ? '' : q.title).trim();
      if (!title) return; // 没有标题的取数单直接丢弃

      var metrics = [];
      (Array.isArray(q.metrics) ? q.metrics : []).forEach(function (m) {
        if (!m) return;
        var name = String(m.name == null ? '' : m.name).trim();
        if (!name) return;
        metrics.push({
          id: m.id || U.uid('qmt'),
          name: name,
          definition: m.definition || '',
          dims: m.dims || '',
          filters: m.filters || '',
          confirmedBy: m.confirmedBy || '',
          confirmedAt: qDate(m.confirmedAt, ''),
        });
      });

      var channels = [];
      (Array.isArray(q.channels) ? q.channels : []).forEach(function (c) {
        if (!c) return;
        channels.push({
          id: c.id || U.uid('qch'),
          type: qChannelKeys[c.type] ? c.type : 'other',
          date: qDate(c.date, ''),
          subject: c.subject || '',
          from: c.from || '',
          to: c.to || '',
          cc: c.cc || '',
          content: c.content || '',
        });
      });

      var checks = [];
      (Array.isArray(q.checks) ? q.checks : []).forEach(function (k) {
        if (!k) return;
        checks.push({
          id: k.id || U.uid('qck'),
          date: qDate(k.date, ''),
          withWho: k.withWho || '',
          result: k.result || '',
          diff: k.diff || '',
          note: k.note || '',
        });
      });

      var caliberChanges = [];
      (Array.isArray(q.caliberChanges) ? q.caliberChanges : []).forEach(function (cc) {
        if (!cc) return;
        caliberChanges.push({
          id: cc.id || U.uid('qcc'),
          date: qDate(cc.date, ''),
          from: cc.from || '',
          to: cc.to || '',
          reason: cc.reason || '',
          by: cc.by || '',
        });
      });

      out.queries.push({
        id: q.id || U.uid('qry'),
        code: String(q.code == null ? '' : q.code).trim(),
        title: title,
        requester: q.requester || '',
        pm: q.pm || '',
        owner: q.owner || '',
        executor: q.executor || '',
        requestDate: qDate(q.requestDate, U.today()),
        periodStart: qDate(q.periodStart, ''),
        periodEnd: qDate(q.periodEnd, ''),
        dueDate: qDate(q.dueDate, ''),
        priority: qPriorityKeys[q.priority] ? q.priority : 'P2',
        status: qStatusKeys[q.status] ? q.status : 'pending_eval',
        metrics: metrics,
        sqlText: q.sqlText || '',
        sqlPath: q.sqlPath || '',
        sqlTables: q.sqlTables || '',
        sqlEnv: q.sqlEnv || '生产',
        executedAt: qDate(q.executedAt, ''),
        rowCount: Number(q.rowCount) || 0,
        resultPath: q.resultPath || '',
        resultSummary: q.resultSummary || '',
        channels: channels,
        checks: checks,
        caliberChanges: caliberChanges,
        note: q.note || '',
        demo: !!q.demo,
        createdAt: q.createdAt || Date.now(),
        updatedAt: q.updatedAt || Date.now(),
      });
    });

    return out;
  }

  /* ---------------- 演示数据识别 / 清除 ----------------
     演示数据必须可被精确定位，否则就会和用户的真实数据混在一起。
     规则：
       1) 新版种子数据统一带 demo:true 标记；
       2) 兼容旧版本已落库的演示记录（按 id 特征 + 项目固定名称判断）。 */

  var DEMO_ID_RE = {
    tasks: /^tsk_demo_/,
    incidents: /^inc_demo_/,
    timeLogs: /^tl_\d+$/,
    releases: /^rel_demo_/,
    queries: /^qry_demo_/,
  };

  /* 演示项目的「原始名称」：改过名的视为用户自己的项目，保留不动 */
  var DEMO_PROJECT_NAMES = {
    prj_migration: '集群迁移',
    prj_ops: '日常运维',
    prj_data: '数据平台',
    prj_cost: '成本优化',
  };

  /** 是否为演示记录 */
  function isDemoRecord(kind, rec) {
    if (!rec) return false;
    if (rec.demo === true) return true;
    var re = DEMO_ID_RE[kind];
    return !!(re && re.test(String(rec.id || '')));
  }

  /** 是否为演示项目（改过名字的一律保留） */
  function isDemoProject(p) {
    if (!p || !p.id) return false;
    var demoName = DEMO_PROJECT_NAMES[p.id];
    if (demoName) return p.name === demoName;
    return p.demo === true;
  }

  /**
   * 从既有数据中剔除全部演示记录，保留真实数据
   * @returns {{state: Object, removed: Object}} 新状态 + 各类型删除条数
   */
  function stripDemo(state) {
    var s = state && typeof state === 'object' ? state : {};
    var removed = { projects: 0, tasks: 0, incidents: 0, timeLogs: 0, releases: 0, queries: 0 };
    var out = {
      schemaVersion: s.schemaVersion || 1,
      createdAt: s.createdAt || Date.now(),
      updatedAt: s.updatedAt || Date.now(),
      settings: Object.assign(
        { theme: 'dark', activeView: 'dashboard', focusProjectId: null },
        s.settings || {}
      ),
      projects: [],
      tasks: [],
      incidents: [],
      timeLogs: [],
      releases: [],
      queries: [],
    };

    (Array.isArray(s.projects) ? s.projects : []).forEach(function (p) {
      if (isDemoProject(p)) removed.projects++;
      else out.projects.push(p);
    });
    ['tasks', 'incidents', 'timeLogs', 'releases', 'queries'].forEach(function (k) {
      (Array.isArray(s[k]) ? s[k] : []).forEach(function (r) {
        if (isDemoRecord(k, r)) removed[k]++;
        else out[k].push(r);
      });
    });

    /* focusProjectId 可能指向已删除的演示项目 */
    var focus = out.settings.focusProjectId;
    var focusAlive = out.projects.some(function (p) { return p.id === focus; });
    if (!focusAlive) out.settings.focusProjectId = out.projects.length ? out.projects[0].id : null;

    return { state: out, removed: removed };
  }

  /** 统计当前数据里还有多少演示记录 */
  function demoCounts(state) {
    var s = state && typeof state === 'object' ? state : {};
    var counts = { projects: 0, tasks: 0, incidents: 0, timeLogs: 0, releases: 0, queries: 0 };
    (Array.isArray(s.projects) ? s.projects : []).forEach(function (p) {
      if (isDemoProject(p)) counts.projects++;
    });
    ['tasks', 'incidents', 'timeLogs', 'releases', 'queries'].forEach(function (k) {
      (Array.isArray(s[k]) ? s[k] : []).forEach(function (r) {
        if (isDemoRecord(k, r)) counts[k]++;
      });
    });
    counts.total =
      counts.projects + counts.tasks + counts.incidents + counts.timeLogs + counts.releases + counts.queries;
    return counts;
  }

  /**
   * 空白工作台：不含任何演示数据，只留一个可用的默认项目
   * 首次启动（或当前存储空间没有数据）时使用，绝不自动灌入演示记录
   */
  function blank() {
    return {
      schemaVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: { theme: 'dark', activeView: 'dashboard', focusProjectId: 'prj_default' },
      projects: [
        { id: 'prj_default', name: '我的项目', color: '#38bdf8', flagship: false, desc: '' },
      ],
      tasks: [],
      incidents: [],
      timeLogs: [],
      releases: [],
      queries: [],
    };
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.DICT = DICT;
  global.OpsDesk.Seed = {
    build: buildSeed,
    normalize: normalize,
    blank: blank,
    stripDemo: stripDemo,
    demoCounts: demoCounts,
    isDemoRecord: isDemoRecord,
    isDemoProject: isDemoProject,
    PROJECTS: PROJECTS,
  };
})(window);
