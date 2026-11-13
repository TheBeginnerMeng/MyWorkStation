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
  /* 站会日期锚点：默认今天；用户手动选过其它日期后保持不变 */
  var anchorDate = '';

  /* ---------------- 站会日期口径 ----------------
     站会稿是「站会当天」的东西：当天点生成，就出当天的稿，不默认出第二天。
     口径锚点 D（站会日期）默认今天，也允许手动改成别的日期（如提前准备次日站会）。
     全部相对表述按 D 推导：
       产出窗口 = [D-1, D]   前一自然日 + 站会当天已完成
       排期窗口 = [D, D+1]   站会当天 + 次日排期
                                                        */

  /** 日期前后平移 n 天 */
  function shiftDate(ymdStr, n) {
    return U.ymd(U.addDays(U.parseYmd(ymdStr), n));
  }

  /** 相对「今天」的中文日名（段落标题用：昨日 / 今日 / 明日） */
  function relDay(ymdStr) {
    var t = U.today();
    if (ymdStr === t) return '今日';
    if (ymdStr === U.yesterday()) return '昨日';
    if (ymdStr === U.tomorrow()) return '明日';
    return U.shortDate(ymdStr);
  }

  /** 当前站会日期：用户选过就沿用，否则今天 */
  function currentAnchor() {
    return anchorDate || U.today();
  }

  /** 规范化站会日期，非法值回退到今天 */
  function normalizeAnchor(v) {
    var s = String(v == null ? '' : v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : U.today();
  }

  /* ---------------- 口径取数（正文与右栏概览共用，避免两处口径漂移） ---------------- */

  /** 产出窗口：[D-1, D] 内已完成的任务 */
  function pickCompleted(D) {
    var prev = shiftDate(D, -1);
    return Store.state.tasks.filter(function (t) {
      return t.status === 'done' && (t.date === prev || t.date === D);
    });
  }

  /** 排期窗口：[D, D+1] 内未完成的任务（站会当天在前） */
  function pickPlan(D) {
    var next = shiftDate(D, 1);
    return Store.state.tasks
      .filter(function (t) {
        return t.date === D || t.date === next;
      })
      .filter(function (t) {
        return t.status !== 'done';
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date === D ? -1 : 1;
        return U.toMin(a.startTime) - U.toMin(b.startTime);
      });
  }

  /** 生产问题：近 7 天，跟进中优先 */
  function pickIncidents() {
    var weekAgo = U.ymd(U.addDays(new Date(), -7));
    var all = Store.state.incidents.filter(function (i) {
      return i.date >= weekAgo;
    });
    var tracking = all.filter(function (i) { return i.status !== 'resolved'; });
    var resolved = all.filter(function (i) { return i.status === 'resolved'; });
    tracking.sort(newestFirst);
    resolved.sort(newestFirst);
    return { all: all, tracking: tracking, resolved: resolved };
  }

  /** 重点项目：旗舰项目 + 标记为长线的任务 */
  function pickFocus() {
    var s = Store.state;
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
    return focusItems;
  }

  /** 某站会日期口径下的数据来源统计（右栏概览用，与正文口径一致） */
  function sourceStats(D) {
    var planOnDay = Store.state.tasks.filter(function (t) {
      return t.date === D && t.status !== 'done';
    });
    return {
      done: pickCompleted(D).length,
      open: pickIncidents().tracking.length,
      focus: pickFocus().length,
      plan: planOnDay.length,
    };
  }

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
   * @param {string} [anchor] 站会日期（YYYY-MM-DD），默认今天
   * 读取范围：前一自然日/当天已完成任务 + 近 7 天生产问题 + 重点/长线项目 + 当天/次日排期
   */
  function buildMarkdown(anchor) {
    var s = Store.state;
    /* 站会日期锚点：默认今天（当天点生成就出当天的稿），不默认明天 */
    var D = normalizeAnchor(anchor || currentAnchor());
    anchorDate = D;
    var prev = shiftDate(D, -1);
    var next = shiftDate(D, 1);

    /* ---- 1. 核心产出：前一自然日 + 站会当天已完成（最近完成的排前面） ---- */
    var completed = pickCompleted(D);
    completed.sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    /* ---- 2. 生产问题：近 7 天，跟进中优先 ---- */
    var inc = pickIncidents();
    var recent = inc.all;
    var tracking = inc.tracking;
    var resolved = inc.resolved;

    /* ---- 3. 重点项目：旗舰项目 + 标记为长线的任务 ---- */
    var focusItems = pickFocus();

    /* ---- 4. 站会当天/次日排期（未完成） ---- */
    var planTasks = pickPlan(D);

    /* ---- 5. 阻塞项：不限日期，站会最需要被听见的问题 ---- */
    var blocked = s.tasks.filter(function (t) {
      return t.status === 'blocked';
    });
    blocked.sort(function (a, b) {
      return (a.priority || '').localeCompare(b.priority || '');
    });

    /* ---- 组装 Markdown（每条一行，不展开明细） ---- */
    var md = [];
    md.push('# 晨会 · ' + U.shortDate(D) + ' ' + U.weekCn(U.parseYmd(D)));
    md.push('');
    md.push('> ' + U.friendlyDate(prev) + '至今 ｜ 汇报人：我');
    md.push('');

    /* 1. 核心产出 */
    md.push('## 📝 ' + relDay(prev) + '产出');
    md.push('');
    if (completed.length) {
      completed.slice(0, LIMITS.completed).forEach(function (t) {
        md.push('- ✅ ' + t.title + ' · ' + Store.projectName(t.project));
      });
      if (completed.length > LIMITS.completed) {
        md.push('- …另有 ' + (completed.length - LIMITS.completed) + ' 项已完成');
      }
    } else {
      md.push('- ' + relDay(prev) + '无已完成任务');
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

    /* 4. 站会当天计划（阻塞项优先报） */
    md.push('## 📅 ' + relDay(D) + '计划');
    md.push('');
    if (blocked.length) {
      blocked.slice(0, LIMITS.blocked).forEach(function (t) {
        md.push('- ⚠️ 阻塞：' + t.title + (t.note ? ' — ' + U.trunc(t.note, NOTE_MAX) : ''));
      });
      md.push('');
    }
    if (planTasks.length) {
      planTasks.slice(0, LIMITS.plan).forEach(function (t) {
        // 非站会当天的排期加日名标签，避免「今日/次日」混在一段里看不出归属
        var line = '- ' + (t.date === D ? '' : relDay(t.date) + ' ') +
          t.startTime + '-' + t.endTime + ' ' + t.title + ' · ' + Store.projectName(t.project);
        if (t.priority === 'P0') line += ' P0';
        md.push(line);
      });
      if (planTasks.length > LIMITS.plan) {
        md.push('- …另有 ' + (planTasks.length - LIMITS.plan) + ' 项排期未展开');
      }
    } else if (!blocked.length) {
      md.push('- ' + relDay(D) + '暂无排期');
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
      anchorDate: D,
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
    var anchor = currentAnchor();

    var preview = U.el('div', {
      class: 'md-body max-h-[520px] overflow-y-auto px-5 py-4',
    });
    preview.innerHTML = lastMarkdown
      ? U.mdToHtml(lastMarkdown)
      : '<p class="text-mute">尚未生成站会稿。点击右上角「生成站会稿」按钮，系统会自动读取昨日产出、生产问题跟进与重点项目进展，生成 1-2 分钟可念完的精简稿（默认按今天的站会口径出稿）。</p>';

    var metaRow = lastMeta
      ? U.el('div', { class: 'flex flex-wrap items-center gap-2 text-[11px] text-mute' }, [
          lastMeta.seconds
            ? U.el('span', {
                class: 'chip ' + (lastMeta.over ? 'chip-warn' : 'chip-active'),
                text: '口播 ' + U.fmtSeconds(lastMeta.seconds),
              })
            : null,
          U.el('span', { class: 'chip', text: '站会日 ' + U.shortDate(lastMeta.anchorDate || anchor) }),
          U.el('span', { class: 'chip', text: '已完成 ' + lastMeta.completedCount + ' 项' }),
          U.el('span', { class: 'chip', text: '故障 ' + lastMeta.incidentCount + ' 起' }),
          U.el('span', { class: 'chip', text: '重点 ' + lastMeta.flagshipCount + ' 项' }),
          U.el('span', { class: 'chip', text: '排期 ' + lastMeta.planCount + ' 项' }),
          U.el('span', { class: 'num ml-auto', text: '生成于 ' + U.relTime(lastMeta.generatedAt) }),
        ])
      : null;

    /* 右侧：数据来源概览（口径与正文一致，跟随站会日期） */
    var sourcePanel = U.el('div', { class: 'panel' });
    sourcePanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '数据来源' }),
        U.el('span', { class: 'text-[10.5px] text-mute', text: '实时读取' }),
      ])
    );
    var srcBody = U.el('div', { class: 'space-y-2 px-4 py-3' });

    /** 按站会日期重画数据来源（改日期后原地刷新，不整页重绘） */
    function renderSources(D) {
      srcBody.innerHTML = '';
      var st = sourceStats(D);
      var sources = [
        { label: '已完成任务', value: st.done, hint: relDay(shiftDate(D, -1)) + '至今' },
        { label: '跟进中故障', value: st.open, hint: '近 7 天未解决' },
        { label: '重点 / 长线任务', value: st.focus, hint: '领导关注' },
        { label: '站会日排期', value: st.plan, hint: relDay(D) + '待办' },
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
    }
    renderSources(anchor);
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
    /* 站会日期：默认今天（当天点生成就出当天的稿）；可手动改成别的日期 */
    var fDate = global.OpsDesk.Picker.dateField({ value: currentAnchor() });
    fDate.trigger.classList.add('num');
    fDate.trigger.setAttribute('aria-label', '选择站会日期');
    fDate.trigger.title = '站会日期（默认今天）';
    var dateHint = U.el('span', { class: 'text-[10.5px] text-mute' });

    function syncDateHint() {
      var d = normalizeAnchor(fDate.value || U.today());
      dateHint.textContent = '站会日 ' + U.shortDate(d) +
        (d === U.today() ? '（今天）' : '（' + U.friendlyDate(d) + '）') +
        ' · 口径 ' + U.friendlyDate(shiftDate(d, -1)) + '至今';
    }
    fDate.addEventListener('change', function () {
      anchorDate = normalizeAnchor(fDate.value);
      syncDateHint();
      renderSources(anchorDate);
    });
    syncDateHint();

    var genBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        var d = normalizeAnchor(fDate.value || U.today());
        buildMarkdown(d);
        global.OpsDesk.App.render();
        U.toast('站会稿已生成 · ' + U.shortDate(d) + ' · 口播约 ' + U.fmtSeconds(lastMeta.seconds), 'success');
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
        var a = U.el('a', { href: url, download: '晨会站会稿-' + currentAnchor() + '.md' });
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
          U.el('div', { class: 'flex flex-wrap items-center gap-2' }, [
            U.el('label', { class: 'flex items-center gap-2' }, [
              U.el('span', { class: 'text-[11.5px] text-mute', text: '站会日期' }),
              fDate.el,
            ]),
            dateHint,
            genBtn,
            copyBtn,
            dlBtn,
          ]),
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
    get anchor() { return currentAnchor(); },
    limits: LIMITS,
  };
})(window);
