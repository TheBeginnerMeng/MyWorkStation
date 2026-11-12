/* ============================================================
   dashboard.js — 总览仪表盘
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Store = global.OpsDesk.Store;
  var UI = global.OpsDesk.UI;

  function render(root) {
    var s = Store.state;
    var st = Store.stats();
    var today = U.today();
    var cat = Store.categoryStats(today);

    var todayTasks = s.tasks
      .filter(function (t) { return t.date === today; })
      .sort(function (a, b) { return U.toMin(a.startTime) - U.toMin(b.startTime); });

    /* ---- KPI ---- */
    var kpis = U.el('div', { class: 'grid grid-cols-2 gap-3 lg:grid-cols-4' }, [
      kpi('今日任务', st.todayTaskDone + '/' + st.todayTaskTotal, '完成进度', st.todayTaskRate + '%', 'var(--c-brand)'),
      kpi('跟进中故障', String(st.openIncidents), '待闭环问题', st.openIncidents ? '需关注' : '全部闭环', 'var(--c-warn)'),
      kpi('今日工时', U.fmtDur(st.todayMinutes), '时间流水统计', cat.logs.length + ' 条记录', 'var(--c-violet)'),
      kpi('重点事项', String(st.focusTasks), '长线 + P0 进行中', st.focusTasks ? '领导关注' : '暂无', 'var(--c-ok)'),
    ]);

    /* ---- 今日时间轴 ---- */
    var tlPanel = U.el('div', { class: 'panel' });
    tlPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '今日时间线' }),
        U.el('button', {
          class: 'btn h-7 px-2.5 text-[11px]',
          onclick: function () { global.OpsDesk.App.go('tasks'); },
        }, ['查看全部 →']),
      ])
    );
    var tlBody = U.el('div', { class: 'scroll-y max-h-[420px] px-4 py-4' });
    if (todayTasks.length) {
      tlBody.appendChild(
        UI.timeline(todayTasks, {
          hourHeight: 54,
          startHour: 7,
          endHour: 21,
          onClick: function (t) { global.OpsDesk.Tasks.openEditor(t); },
        })
      );
    } else {
      tlBody.appendChild(
        U.el('div', { class: 'flex h-32 flex-col items-center justify-center gap-2' }, [
          U.el('div', { class: 'text-2xl opacity-40', text: '🌤️' }),
          U.el('div', { class: 'text-[13px] text-mute', text: '今天还没有安排' }),
        ])
      );
    }
    tlPanel.appendChild(tlBody);

    /* ---- 故障概览 ---- */
    var incPanel = U.el('div', { class: 'panel' });
    incPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '生产问题动态' }),
        U.el('button', {
          class: 'btn h-7 px-2.5 text-[11px]',
          onclick: function () { global.OpsDesk.App.go('incidents'); },
        }, ['查看全部 →']),
      ])
    );
    var incBody = U.el('div', { class: 'divide-y divide-line/40' });
    var recentInc = s.incidents.slice().sort(function (a, b) {
      return (b.date + b.occurredAt) < (a.date + a.occurredAt) ? -1 : 1;
    }).slice(0, 5);
    if (!recentInc.length) {
      incBody.appendChild(U.el('div', { class: 'px-4 py-6 text-center text-[13px] text-mute', text: '暂无故障记录' }));
    }
    recentInc.forEach(function (i) {
      var stt = Store.dictItem('incidentStatus', i.status);
      var sev = Store.dictItem('severity', i.severity);
      incBody.appendChild(
        U.el('div', { class: 'flex items-start gap-3 px-4 py-2.5 row-hover cursor-pointer', onclick: function () { global.OpsDesk.Incidents.openEditor(i); } }, [
          U.el('span', { class: 'mt-1.5 h-2 w-2 shrink-0 rounded-full', style: { background: sev.color } }),
          U.el('div', { class: 'min-w-0 flex-1' }, [
            U.el('div', { class: 'truncate text-[12.5px] text-ink', text: i.title }),
            U.el('div', { class: 'mt-0.5 flex items-center gap-1.5 text-[10.5px] text-mute' }, [
              U.el('span', { text: i.date + ' ' + i.occurredAt }),
              U.el('span', { text: '·' }),
              U.el('span', { text: Store.projectName(i.project) }),
            ]),
          ]),
          U.el('span', { class: 'badge badge-' + i.status, text: stt.label }),
        ])
      );
    });
    incPanel.appendChild(incBody);

    /* ---- 重点项目 ---- */
    var focusPanel = U.el('div', { class: 'panel' });
    focusPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '重点项目与长线推进' }),
        U.el('div', { class: 'flex items-center gap-2' }, [
          U.el('span', { class: 'text-[10.5px] text-mute', text: '领导关注' }),
          U.el('button', {
            class: 'btn h-7 px-2.5 text-[11px]',
            title: '管理重点项目与长线标记',
            onclick: function () { global.OpsDesk.Projects.openManager(); },
          }, ['管理']),
        ]),
      ])
    );
    var focusBody = U.el('div', { class: 'space-y-3 px-4 py-3' });

    // 三类「重点」各自独立统计并分组展示：
    //   重点项目   —— 项目级「重点」标记
    //   长线推进   —— 任务级「长线」标记
    //   P0 进行中  —— 优先级 P0 且状态为进行中（与长线标记无关）
    // 分组 + 标注入选原因，避免「取消了长线标记却仍出现在这里」的误解。
    var flagshipProjects = s.projects.filter(function (p) { return p.flagship; });
    var longlineTasks = s.tasks.filter(function (t) { return t.flagship; });
    var p0DoingTasks = s.tasks.filter(function (t) {
      return !t.flagship && t.status === 'doing' && t.priority === 'P0';
    });

    /** 分组小标题 */
    function groupTitle(text, count) {
      return U.el('div', { class: 'flex items-center gap-1.5 px-0.5' }, [
        U.el('span', { class: 'kicker', text: text }),
        U.el('span', { class: 'num text-[10px] text-mute', text: String(count) }),
      ]);
    }

    /** 重点项目（项目级）条目 */
    function projectRow(p) {
      var related = s.tasks.filter(function (t) {
        return t.project === p.id && (t.flagship || t.status === 'doing' || t.status === 'blocked');
      });
      return U.el('div', {
        class: 'group flex cursor-pointer items-start gap-2.5 rounded-lg border border-line/50 bg-raised/35 px-3 py-2 transition hover:border-brand/40 hover:bg-raised/60',
        onclick: function () { global.OpsDesk.Projects.openManager(); },
      }, [
        U.el('span', { class: 'mt-1.5 h-2 w-2 shrink-0 rounded-full', style: { background: p.color } }),
        U.el('div', { class: 'min-w-0 flex-1' }, [
          U.el('div', { class: 'truncate text-[12.5px] font-medium text-ink', text: p.name }),
          U.el('div', {
            class: 'mt-0.5 truncate text-[10.5px] text-mute',
            text: (p.desc ? p.desc + ' · ' : '') + related.length + ' 项在推进',
          }),
        ]),
        U.el('span', {
          class: 'badge shrink-0',
          style: { background: U.alpha('#a78bfa', 0.16), color: '#a78bfa' },
          text: '重点',
        }),
      ]);
    }

    /** 任务条目，tag 标明它为什么被列进来 */
    function taskRow(t, tag, tagColor) {
      var pcolor = Store.projectColor(t.project);
      return U.el('div', {
        class: 'group flex cursor-pointer items-start gap-2.5 rounded-lg border border-line/50 bg-raised/35 px-3 py-2 transition hover:border-brand/40 hover:bg-raised/60',
        onclick: function () { global.OpsDesk.Tasks.openEditor(t); },
      }, [
        U.el('span', { class: 'mt-1.5 h-2 w-2 shrink-0 rounded-full', style: { background: pcolor } }),
        U.el('div', { class: 'min-w-0 flex-1' }, [
          U.el('div', { class: 'truncate text-[12.5px] font-medium text-ink', text: t.title }),
          U.el('div', { class: 'mt-0.5 truncate text-[10.5px] text-mute', text: (t.note || Store.projectName(t.project)) }),
        ]),
        U.el('span', {
          class: 'badge shrink-0',
          style: { background: U.alpha(tagColor, 0.16), color: tagColor },
          text: tag,
        }),
      ]);
    }

    if (!flagshipProjects.length && !longlineTasks.length && !p0DoingTasks.length) {
      focusBody.appendChild(
        U.el('div', { class: 'py-5 text-center text-[13px] text-mute', text: '暂无重点项目与长线事项' })
      );
    }

    if (flagshipProjects.length) {
      focusBody.appendChild(groupTitle('重点项目', flagshipProjects.length));
      flagshipProjects.forEach(function (p) {
        focusBody.appendChild(projectRow(p));
      });
    }

    if (longlineTasks.length) {
      focusBody.appendChild(groupTitle('长线推进', longlineTasks.length));
      longlineTasks.forEach(function (t) {
        focusBody.appendChild(taskRow(t, '长线', '#a78bfa'));
      });
    }

    if (p0DoingTasks.length) {
      focusBody.appendChild(groupTitle('P0 进行中', p0DoingTasks.length));
      p0DoingTasks.forEach(function (t) {
        focusBody.appendChild(taskRow(t, 'P0', '#fbbf24'));
      });
    }
    focusPanel.appendChild(focusBody);

    /* ---- 今日流水摘要 ---- */
    var logPanel = U.el('div', { class: 'panel' });
    logPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '今日时间分配' }),
        U.el('button', {
          class: 'btn h-7 px-2.5 text-[11px]',
          onclick: function () { global.OpsDesk.App.go('timelog'); },
        }, ['流水账 →']),
      ])
    );
    var logBody = U.el('div', { class: 'px-5 py-4' });
    var chartWrap = U.el('div', { class: 'mx-auto w-[180px]' });
    chartWrap.appendChild(
      UI.donut(
        cat.buckets.map(function (b) { return { label: b.label, value: b.minutes, color: b.color }; }),
        { size: 180, stroke: 20, centerLabel: '今日总时长' }
      )
    );
    logBody.appendChild(chartWrap);
    logBody.appendChild(U.el('div', { class: 'mt-3' }, [
      UI.bars(cat.buckets.map(function (b) { return { label: b.label, value: b.minutes, color: b.color }; })),
    ]));
    logPanel.appendChild(logBody);

    /* ---- 项目分布 ---- */
    var projPanel = U.el('div', { class: 'panel' });
    projPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '项目负载' }),
        U.el('button', {
          class: 'btn h-7 px-2.5 text-[11px]',
          title: '管理项目',
          onclick: function () { global.OpsDesk.Projects.openManager(); },
        }, ['管理项目']),
      ])
    );
    var projBody = U.el('div', { class: 'space-y-3 px-4 py-3' });
    s.projects.forEach(function (p) {
      var ts = s.tasks.filter(function (t) { return t.project === p.id && t.date >= U.ymd(U.addDays(new Date(), -6)); });
      var open = ts.filter(function (t) { return t.status !== 'done'; }).length;
      var minutes = U.sum(
        s.timeLogs.filter(function (l) { return l.project === p.id && l.date >= U.ymd(U.addDays(new Date(), -6)); }),
        function (l) { return global.OpsDesk.TimeLog.durationOf(l.startTime, l.endTime); }
      );
      projBody.appendChild(
        U.el('div', {}, [
          U.el('div', { class: 'mb-1 flex items-center justify-between gap-2 text-[11.5px]' }, [
            U.el('span', { class: 'flex items-center gap-1.5 text-dim' }, [
              U.el('span', { class: 'h-2 w-2 rounded-sm', style: { background: p.color } }),
              U.el('span', { text: p.name }),
              p.flagship ? U.el('span', { class: 'badge', style: { background: U.alpha('#a78bfa', .16), color: '#a78bfa' }, text: '重点' }) : null,
            ]),
            U.el('span', { class: 'num text-mute', text: open + ' 待办 · ' + U.fmtDur(minutes) }),
          ]),
          U.el('div', { class: 'h-1.5 w-full overflow-hidden rounded-full bg-line/35' }, [
            U.el('div', {
              class: 'h-full rounded-full transition-all duration-500',
              style: { width: U.clamp(Math.round((open / Math.max(1, ts.length)) * 100), 4, 100) + '%', background: p.color },
            }),
          ]),
        ])
      );
    });
    projPanel.appendChild(projBody);

    /* ---- 近期投产 ---- */
    var relStats = Store.releaseStats();
    var relPanel = U.el('div', { class: 'panel' });
    relPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '近期版本投产' }),
        U.el('button', {
          class: 'btn h-7 px-2.5 text-[11px]',
          onclick: function () { global.OpsDesk.App.go('releases'); },
        }, ['查看全部 →']),
      ])
    );
    var relBody = U.el('div', { class: 'divide-y divide-line/40' });
    var recentRel = (s.releases || [])
      .slice()
      .sort(function (a, b) {
        return (b.date || '') < (a.date || '') ? -1 : 1;
      })
      .slice(0, 4);
    if (!recentRel.length) {
      relBody.appendChild(
        U.el('div', { class: 'px-4 py-5 text-center text-[13px] text-mute', text: '还没有版本投产记录' })
      );
    }
    recentRel.forEach(function (r) {
      var stt = Store.dictItem('releaseStatus', r.status);
      var types = {};
      (r.items || []).forEach(function (it) {
        types[it.type] = (types[it.type] || 0) + 1;
      });
      var typeChips = Store.dict('releaseType')
        .filter(function (t) {
          return types[t.key];
        })
        .map(function (t) {
          return U.el('span', {
            class: 'badge',
            style: { background: U.alpha(t.color, 0.16), color: t.color },
            text: t.label + ' ' + types[t.key],
          });
        });

      relBody.appendChild(
        U.el('div', {
          class: 'flex cursor-pointer items-start gap-3 px-4 py-2.5 row-hover',
          onclick: function () { global.OpsDesk.App.go('releases'); },
        }, [
          U.el('div', { class: 'min-w-0 flex-1' }, [
            U.el('div', { class: 'flex items-center gap-2' }, [
              U.el('span', { class: 'num text-[12.5px] font-semibold text-ink', text: r.version }),
              r.title
                ? U.el('span', { class: 'truncate text-[11.5px] text-dim', text: r.title })
                : null,
            ]),
            U.el('div', { class: 'mt-1 flex flex-wrap items-center gap-1.5' }, typeChips),
            U.el('div', { class: 'mt-0.5 text-[10.5px] text-mute', text: r.date + ' 上线' }),
          ]),
          U.el('span', {
            class: 'badge shrink-0',
            style: { background: U.alpha(stt.color, 0.16), color: stt.color },
            text: stt.label,
          }),
        ])
      );
    });
    relPanel.appendChild(relBody);

    root.innerHTML = '';
    root.appendChild(
      U.el('div', { class: 'space-y-4 animate-fade-up' }, [
        U.el('div', { class: 'flex flex-wrap items-center justify-between gap-3' }, [
          U.el('div', {}, [
            U.el('h2', { class: 'text-[15px] font-bold text-ink', text: '工作台总览' }),
            U.el('div', { class: 'mt-0.5 text-[11.5px] text-mute', text: U.friendlyFull(U.today()) + ' · 数据实时同步至本地存储' }),
          ]),
          U.el('div', { class: 'flex flex-wrap gap-2' }, [
            U.el('button', {
              class: 'btn',
              onclick: function () { global.OpsDesk.TimeLog.openEditor(null); },
            }, ['⏱ 记录时间']),
            U.el('button', {
              class: 'btn',
              onclick: function () { global.OpsDesk.Releases.openEditor(null); },
            }, ['⧉ 记录投产']),
            U.el('button', {
              class: 'btn btn-primary',
              onclick: function () {
                var md = global.OpsDesk.Briefing.build();
                global.OpsDesk.App.go('briefing');
                setTimeout(function () { U.copy(md); U.toast('站会稿已生成并复制', 'success'); }, 220);
              },
            }, ['⚡ 生成站会稿']),
          ]),
        ]),
        kpis,
        U.el('div', { class: 'auto-cols auto-cols-wide' }, [
          U.el('div', { class: 'space-y-4' }, [tlPanel, incPanel, relPanel]),
          U.el('div', { class: 'space-y-4' }, [focusPanel, logPanel, projPanel]),
        ]),
      ])
    );
  }

  function kpi(label, value, hint, tag, color) {
    return U.el('div', { class: 'panel relative overflow-hidden px-4 py-3.5' }, [
      U.el('div', { class: 'absolute inset-x-0 top-0 h-[2px]', style: { background: 'linear-gradient(90deg,' + color + ',transparent)' } }),
      U.el('div', { class: 'flex items-start justify-between gap-2' }, [
        U.el('div', { class: 'kicker', text: label }),
        U.el('span', { class: 'rounded-md px-1.5 py-0.5 text-[10px] font-semibold', style: { background: U.alpha(String(color).replace('var(--c-', '').replace(')', ''), 0.12) || 'transparent', color: color }, text: tag }),
      ]),
      U.el('div', { class: 'mt-1.5 num text-[26px] font-bold leading-none text-ink', text: value }),
      U.el('div', { class: 'mt-1.5 text-[11px] text-mute', text: hint }),
    ]);
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Dashboard = { render: render };
})(window);
