/* ============================================================
   briefing.js — 晨会站会稿生成器
   场景：晨会是站会形式，1-2 分钟讲完，因此只讲结论、不展开细节。
   汇总：昨日产出 + 生产问题跟进 + 重点/长线推进 + 今日计划
   输出：精简 Markdown（可直接粘贴进群）+ 一键复制
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Store = global.OpsDesk.Store;

  var lastMarkdown = '';
  var lastMeta = null;

  /* ---------------- 站会容量预算 ----------------
     站会 1-2 分钟 ≈ 口播 200-400 字。
     规则：每条一行、只讲结论；超出上限的条目折叠，明细回源到对应模块查看。
     跟进中的故障优先保留（风险项），已解决的一句话带过。            */

  var LIMITS = {
    completed: 3,  // 昨日产出最多几条
    tracking: 3,   // 跟进中故障最多几条
    resolved: 1,   // 已解决故障最多几条
    focus: 2,      // 重点项目最多几项
    plan: 5,       // 今日计划最多几条
    blocked: 2,    // 阻塞项最多几条
  };
  var NOTE_MAX = 22; // 单条附注最长字数
  var SPOKEN_LIMIT = 120; // 站会时长上限（秒）

  /** 按日期+发生时刻倒序 */
  function newestFirst(a, b) {
    var ka = (a.date || '') + (a.occurredAt || '');
    var kb = (b.date || '') + (b.occurredAt || '');
    return kb < ka ? -1 : kb > ka ? 1 : 0;
  }

  /* ---------------- 聚合 + 组装 ---------------- */

  /**
   * 生成晨会站会稿 Markdown
   * 读取范围：昨日/今日已完成任务 + 近 7 天生产问题 + 重点/长线项目 + 今日/明日排期
   */
  function buildMarkdown() {
    var s = Store.state;
    var today = U.today();
    var yesterday = U.yesterday();
    var tomorrow = U.tomorrow();

    /* ---- 1. 核心产出：昨日 + 今日已完成（最近完成的排前面） ---- */
    var completed = s.tasks.filter(function (t) {
      return t.status === 'done' && (t.date === yesterday || t.date === today);
    });
    completed.sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    /* ---- 2. 生产问题：近 7 天，跟进中优先 ---- */
    var weekAgo = U.ymd(U.addDays(new Date(), -7));
    var recent = s.incidents.filter(function (i) {
      return i.date >= weekAgo;
    });
    var tracking = recent.filter(function (i) { return i.status !== 'resolved'; });
    var resolved = recent.filter(function (i) { return i.status === 'resolved'; });
    tracking.sort(newestFirst);
    resolved.sort(newestFirst);

    /* ---- 3. 重点项目：旗舰项目 + 标记为长线的任务 ---- */
    var flagshipProjects = s.projects.filter(function (p) {
      return p.flagship;
    });
    var focusItems = [];
    flagshipProjects.forEach(function (p) {
      var pt = s.tasks.filter(function (t) {
        return t.project === p.id && (t.flagship || t.status === 'doing' || t.status === 'blocked');
      });
      // 长线任务优先，其次进行中
      pt.sort(function (a, b) {
        var av = (a.flagship ? 0 : 1) + (a.status === 'doing' ? 0 : 1);
        var bv = (b.flagship ? 0 : 1) + (b.status === 'doing' ? 0 : 1);
        return av - bv;
      });
      var main = pt[0];
      var detail = '';
      var note = '';
      if (main) {
        detail = main.title;
        note = main.note || '';
        // 同项目下其它长线任务也带一句，保证关键事项不被折叠掉
        var others = pt.slice(1).filter(function (t) { return t.flagship; });
        if (others.length) {
          detail += '、' + others.map(function (t) { return t.title; }).join('、');
        }
      }
      focusItems.push({ label: p.name, detail: detail, note: note });
    });
    // 非旗舰项目、但单独标记为长线推进中的任务
    s.tasks.forEach(function (t) {
      if (!t.flagship) return;
      if (flagshipProjects.some(function (p) { return p.id === t.project; })) return;
      focusItems.push({ label: t.title, detail: '', note: t.note || '' });
    });

    /* ---- 4. 今日/明日排期（未完成） ---- */
    var planTasks = s.tasks
      .filter(function (t) {
        return t.date === tomorrow || t.date === today;
      })
      .filter(function (t) {
        return t.status !== 'done';
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date === today ? -1 : 1;
        return U.toMin(a.startTime) - U.toMin(b.startTime);
      });

    /* ---- 5. 阻塞项：不限日期，站会最需要被听见的问题 ---- */
    var blocked = s.tasks.filter(function (t) {
      return t.status === 'blocked';
    });
    blocked.sort(function (a, b) {
      return (a.priority || '').localeCompare(b.priority || '');
    });

    /* ---- 组装 Markdown（每条一行，不展开明细） ---- */
    var md = [];
    md.push('# 晨会 · ' + U.shortDate(tomorrow) + ' ' + U.weekCn(U.parseYmd(tomorrow)));
    md.push('');
    md.push('> ' + U.friendlyDate(yesterday) + '至今 ｜ 汇报人：我');
    md.push('');

    /* 1. 核心产出 */
    md.push('## 📝 昨日产出');
    md.push('');
    if (completed.length) {
      completed.slice(0, LIMITS.completed).forEach(function (t) {
        md.push('- ✅ ' + t.title + ' · ' + Store.projectName(t.project));
      });
      if (completed.length > LIMITS.completed) {
        md.push('- …另有 ' + (completed.length - LIMITS.completed) + ' 项已完成');
      }
    } else {
      md.push('- 昨日无已完成任务');
    }
    md.push('');

    /* 2. 生产问题 */
    md.push('## 🚨 生产问题');
    md.push('');
    if (recent.length) {
      var shown = 0;
      tracking.slice(0, LIMITS.tracking).forEach(function (i) {
        var st = Store.dictItem('incidentStatus', i.status);
        var line = '- ⏳ ' + i.title + ' · ' + st.label;
        if (i.solution) line += '（' + U.trunc(i.solution, NOTE_MAX) + '）';
        md.push(line);
        shown++;
      });
      resolved.slice(0, LIMITS.resolved).forEach(function (i) {
        md.push('- ✅ ' + i.title + ' · 已解决');
        shown++;
      });
      var rest = recent.length - shown;
      if (rest > 0) md.push('- …另有 ' + rest + ' 起故障');
    } else {
      md.push('- 近 7 天无生产问题');
    }
    md.push('');

    /* 3. 重点项目 */
    md.push('## 🎯 重点项目');
    md.push('');
    if (focusItems.length) {
      focusItems.slice(0, LIMITS.focus).forEach(function (it) {
        var line = '- ' + it.label;
        if (it.detail) line += '（' + it.detail + '）';
        if (it.note) line += ' · ' + U.trunc(it.note, NOTE_MAX);
        md.push(line);
      });
      if (focusItems.length > LIMITS.focus) {
        md.push('- …另有 ' + (focusItems.length - LIMITS.focus) + ' 个重点项目');
      }
    } else {
      md.push('- 暂无重点/长线事项');
    }
    md.push('');

    /* 4. 今日计划（阻塞项优先报） */
    md.push('## 📅 今日计划');
    md.push('');
    if (blocked.length) {
      blocked.slice(0, LIMITS.blocked).forEach(function (t) {
        md.push('- ⚠️ 阻塞：' + t.title + (t.note ? ' — ' + U.trunc(t.note, NOTE_MAX) : ''));
      });
      md.push('');
    }
    if (planTasks.length) {
      planTasks.slice(0, LIMITS.plan).forEach(function (t) {
        var line = '- ' + t.startTime + '-' + t.endTime + ' ' + t.title + ' · ' + Store.projectName(t.project);
        if (t.priority === 'P0') line += ' P0';
        md.push(line);
      });
      if (planTasks.length > LIMITS.plan) {
        md.push('- …另有 ' + (planTasks.length - LIMITS.plan) + ' 项排期未展开');
      }
    } else if (!blocked.length) {
      md.push('- 今日暂无排期');
    }
    md.push('');

    /* 页脚：口播时长自检 */
    var text = md.join('\n');
    var visible = text
      .replace(/^[#>\-*\|\s]+/gm, '')
      .replace(/[`*]/g, '')
      .replace(/\s+/g, ' ');
    var seconds = U.speakSeconds(visible);
    var chars = visible.replace(/\s/g, '').length;
    var over = seconds > SPOKEN_LIMIT;

    md.push('---');
    md.push('');
    md.push(
      '> ' + (over ? '⚠️ ' : '') + '口播约 ' + U.fmtSeconds(seconds) +
      (over ? '，已超站会时长，建议精简' : '，适合 1-2 分钟站会') +
      ' ｜ 已完成 ' + completed.length + ' · 故障 ' + recent.length +
      ' · 重点 ' + focusItems.length + ' · 排期 ' + planTasks.length
    );

    var meta = {
      completedCount: completed.length,
      incidentCount: recent.length,
      flagshipCount: focusItems.length,
      planCount: planTasks.length,
      blockedCount: blocked.length,
      seconds: seconds,
      chars: chars,
      over: over,
      generatedAt: Date.now(),
    };

    text = md.join('\n');
    lastMeta = meta;
    // build() 是生成结果的唯一入口：结果在此落地，
    // 保证任何调用方（含右栏复制按钮）拿到的都是最新内容
    lastMarkdown = text;
    return text;
  }

  /* ---------------- 渲染 ---------------- */

  function render(root) {
    var s = Store.state;
    var st = Store.stats();

    var preview = U.el('div', {
      class: 'md-body max-h-[520px] overflow-y-auto px-5 py-4',
    });
    preview.innerHTML = lastMarkdown
      ? U.mdToHtml(lastMarkdown)
      : '<p class="text-mute">尚未生成站会稿。点击右上角「生成站会稿」按钮，系统会自动读取昨日产出、生产问题跟进与重点项目进展，生成 1-2 分钟可念完的精简稿。</p>';

    var metaRow = lastMeta
      ? U.el('div', { class: 'flex flex-wrap items-center gap-2 text-[11px] text-mute' }, [
          lastMeta.seconds
            ? U.el('span', {
                class: 'chip ' + (lastMeta.over ? 'chip-warn' : 'chip-active'),
                text: '口播 ' + U.fmtSeconds(lastMeta.seconds),
              })
            : null,
          U.el('span', { class: 'chip', text: '已完成 ' + lastMeta.completedCount + ' 项' }),
          U.el('span', { class: 'chip', text: '故障 ' + lastMeta.incidentCount + ' 起' }),
          U.el('span', { class: 'chip', text: '重点 ' + lastMeta.flagshipCount + ' 项' }),
          U.el('span', { class: 'chip', text: '排期 ' + lastMeta.planCount + ' 项' }),
          U.el('span', { class: 'num ml-auto', text: '生成于 ' + U.relTime(lastMeta.generatedAt) }),
        ])
      : null;

    /* 右侧：数据来源概览 */
    var sourcePanel = U.el('div', { class: 'panel' });
    sourcePanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '数据来源' }),
        U.el('span', { class: 'text-[10.5px] text-mute', text: '实时读取' }),
      ])
    );
    var srcBody = U.el('div', { class: 'space-y-2 px-4 py-3' });
    var sources = [
      { label: '已完成任务', value: st.todayTaskDone, hint: '今日已完成' },
      { label: '跟进中故障', value: st.openIncidents, hint: '需在晨会同步' },
      { label: '重点 / 长线任务', value: st.focusTasks, hint: '领导关注' },
      { label: '今日排期', value: st.todayTaskTotal, hint: '含时间段' },
    ];
    sources.forEach(function (src) {
      srcBody.appendChild(
        U.el('div', { class: 'flex items-center justify-between rounded-lg border border-line/50 bg-raised/40 px-3 py-2' }, [
          U.el('div', {}, [
            U.el('div', { class: 'text-[12px] text-dim', text: src.label }),
            U.el('div', { class: 'text-[10px] text-mute', text: src.hint }),
          ]),
          U.el('span', { class: 'num text-[16px] font-bold text-brand', text: String(src.value) }),
        ])
      );
    });
    sourcePanel.appendChild(srcBody);

    /* 快捷入口 */
    var quick = U.el('div', { class: 'panel' });
    quick.appendChild(
      U.el('div', { class: 'panel-head' }, [U.el('div', { class: 'panel-title', text: '快捷操作' })])
    );
    var qBody = U.el('div', { class: 'space-y-2 px-4 py-3' });
    [
      { label: '录入生产问题', fn: function () { global.OpsDesk.Incidents.openEditor(null); } },
      { label: '新建日程任务', fn: function () { global.OpsDesk.Tasks.openEditor(null); } },
      { label: '记录时间段', fn: function () { global.OpsDesk.TimeLog.openEditor(null); } },
      { label: '查看今日时间线', fn: function () { global.OpsDesk.App.go('tasks'); } },
    ].forEach(function (a) {
      qBody.appendChild(
        U.el('button', {
          class: 'btn w-full justify-start',
          onclick: a.fn,
        }, [a.label])
      );
    });
    quick.appendChild(qBody);

    /* 主操作区 */
    var genBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        buildMarkdown();
        global.OpsDesk.App.render();
        U.toast('站会稿已生成 · 口播约 ' + U.fmtSeconds(lastMeta.seconds), 'success');
      },
    }, ['⚡ 生成站会稿']);

    var copyBtn = U.el('button', {
      class: 'btn btn-lg',
      onclick: function () {
        if (!lastMarkdown) {
          U.toast('请先生成站会稿', 'warn');
          return;
        }
        U.copy(lastMarkdown).then(function (ok) {
          if (ok) U.toast('已复制到剪贴板', 'success');
          else U.toast('复制失败，请手动选择文本', 'error');
        });
      },
    }, ['📋 复制 Markdown']);

    var dlBtn = U.el('button', {
      class: 'btn btn-lg',
      onclick: function () {
        if (!lastMarkdown) {
          U.toast('请先生成站会稿', 'warn');
          return;
        }
        var blob = new Blob([lastMarkdown], { type: 'text/markdown;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = U.el('a', { href: url, download: '晨会站会稿-' + U.today() + '.md' });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        U.toast('已导出 Markdown 文件', 'success');
      },
    }, ['⬇ 导出']);

    root.innerHTML = '';
    root.appendChild(
      U.el('div', { class: 'space-y-4 animate-fade-up' }, [
        U.el('div', { class: 'flex flex-wrap items-start justify-between gap-3' }, [
          U.el('div', {}, [
            U.el('h2', { class: 'text-[15px] font-bold text-ink', text: '晨会汇报生成器' }),
            U.el('div', { class: 'mt-0.5 text-[11.5px] text-mute', text: '站会 1-2 分钟：只讲结论，明细回源到各模块查看' }),
          ]),
          U.el('div', { class: 'flex flex-wrap gap-2' }, [genBtn, copyBtn, dlBtn]),
        ]),
        U.el('div', { class: 'auto-cols auto-cols-narrow' }, [
          U.el('div', { class: 'panel overflow-hidden' }, [
            U.el('div', { class: 'panel-head' }, [
              U.el('div', { class: 'panel-title', text: '站会稿预览' }),
              metaRow,
            ]),
            preview,
            U.el('div', { class: 'border-t border-line/60 bg-raised/30 px-5 py-3' }, [
              U.el('div', { class: 'kicker mb-1.5', text: 'Markdown 源码' }),
              U.el('pre', {
                class: 'num scroll-y max-h-56 whitespace-pre-wrap break-words rounded-lg border border-line/50 bg-bg/60 p-3 text-[11px] leading-relaxed text-dim',
                text: lastMarkdown || '（尚未生成）',
              }),
            ]),
          ]),
          U.el('div', { class: 'space-y-4' }, [sourcePanel, quick]),
        ]),
      ])
    );
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Briefing = {
    render: render,
    build: buildMarkdown,
    get markdown() { return lastMarkdown; },
    get meta() { return lastMeta; },
    limits: LIMITS,
  };
})(window);
