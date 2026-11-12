/* ============================================================
   tasks.js — 日程与任务管理模组
   强制规则：新建/编辑任务时【工作时间】为必填项
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Store = global.OpsDesk.Store;
  var UI = global.OpsDesk.UI;

  var filter = {
    date: null, // 当前视图日期
    project: 'all',
    status: 'all',
    keyword: '',
  };

  function ensureDate() {
    if (!filter.date) filter.date = U.today();
  }

  /* ---------------- 任务表单 ---------------- */

  function field(label, control, hint, errorId) {
    var wrap = U.el('div', {});
    wrap.appendChild(U.el('label', { class: 'label', text: label }));
    wrap.appendChild(control);
    if (hint) wrap.appendChild(U.el('div', { class: 'hint', id: errorId || '', text: hint }));
    return wrap;
  }

  /**
   * 打开任务编辑弹窗
   * @param {Object|null} task 传入为编辑，null 为新建
   */
  function openEditor(task) {
    var isEdit = !!task;
    var t = task
      ? U.clone(task)
      : {
          title: '',
          project: Store.state.projects[0] ? Store.state.projects[0].id : '',
          date: filter.date || U.today(),
          startTime: '09:00',
          endTime: '10:30',
          status: 'todo',
          priority: 'P2',
          note: '',
        };

    var fTitle = U.el('input', { class: 'input', type: 'text', value: t.title, placeholder: '例如：HDFS NameNode 扩容方案评审' });
    var fDate = global.OpsDesk.Picker.dateField({ value: t.date });
    var fStart = global.OpsDesk.Picker.timeField({ value: t.startTime });
    var fEnd = global.OpsDesk.Picker.timeField({
      value: t.endTime,
      // 结束时间可基于开始时间一键推导
      relatedStart: function () {
        return fStart.value;
      },
    });
    var fStatus = U.el('select', { class: 'input' });
    var fPriority = U.el('select', { class: 'input' });
    var fProject = global.OpsDesk.Projects.picker({ value: t.project });
    var fNote = U.el('textarea', { class: 'input', placeholder: '补充说明、依赖、风险点…' });
    fNote.value = t.note || '';
    var fFlagship = U.el('input', { class: 'h-4 w-4 accent-brand', type: 'checkbox' });
    fFlagship.checked = !!t.flagship;

    Store.dict('taskStatus').forEach(function (d) {
      fStatus.appendChild(U.el('option', { value: d.key, text: d.label, selected: d.key === t.status }));
    });
    Store.dict('priority').forEach(function (d) {
      fPriority.appendChild(U.el('option', { value: d.key, text: d.label, selected: d.key === t.priority }));
    });

    var timeHint = U.el('div', {
      class: 'hint',
      text: '起止时间为必填项，未填写无法保存。',
    });

    var body = U.el('div', { class: 'space-y-4' }, [
      field('任务名称 *', fTitle, null, 'err-title'),
      field('所属项目', fProject.el),
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-3' }, [
        field('所属日期 *', fDate.el),
        field('开始时间 *', fStart.el, null, 'err-time'),
        field('结束时间 *', fEnd.el),
      ]),
      timeHint,
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' }, [
        field('状态', fStatus),
        field('优先级', fPriority),
      ]),
      U.el('label', {
        class: 'flex cursor-pointer items-center gap-2.5 rounded-lg border border-line/60 bg-raised/40 px-3 py-2.5',
      }, [
        fFlagship,
        U.el('div', {}, [
          U.el('div', { class: 'text-[13px] font-medium text-ink', text: '标记为长线推进' }),
          U.el('div', { class: 'mt-0.5 text-[11px] text-mute', text: '长线事项会进入晨会站会稿的「重点项目」段落，取消勾选即可移除' }),
        ]),
      ]),
      field('备注', fNote),
    ]);

    function markInvalid(input, on) {
      input.classList.toggle('input-invalid', on);
    }

    function validate(silent) {
      var ok = true;
      var title = fTitle.value.trim();
      var s = fStart.value;
      var e = fEnd.value;

      markInvalid(fTitle, !title);
      markInvalid(fStart, !s);
      markInvalid(fEnd, !e);

      if (!title) {
        timeHint.className = 'hint hint-error';
        timeHint.textContent = '请填写任务名称';
        timeHint.id = 'err-title';
        if (!silent) {
          U.toast('任务名称不能为空', 'error');
          fTitle.focus();
        }
        ok = false;
      } else if (!s || !e) {
        timeHint.className = 'hint hint-error';
        timeHint.textContent = '⚠ 工作时间为必填项，请填写开始与结束时间后再保存。';
        if (!silent) {
          U.toast('工作时间不能为空，无法保存', 'error');
          (s ? fEnd : fStart).focus();
        }
        ok = false;
      } else if (U.toMin(e) <= U.toMin(s)) {
        timeHint.className = 'hint hint-error';
        timeHint.textContent = '结束时间必须晚于开始时间';
        if (!silent) {
          U.toast('结束时间必须晚于开始时间', 'error');
          fEnd.focus();
        }
        ok = false;
      } else {
        timeHint.className = 'hint';
        timeHint.textContent = '时间区间：' + s + ' - ' + e + '（时长 ' + U.fmtDur(U.toMin(e) - U.toMin(s)) + '）';
      }
      return ok;
    }

    [fStart, fEnd].forEach(function (inp) {
      inp.addEventListener('input', function () {
        validate(true);
      });
    });
    fTitle.addEventListener('input', function () {
      validate(true);
    });

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        if (!validate(false)) return;
        var payload = {
          title: fTitle.value.trim(),
          project: fProject.getValue(),
          date: fDate.value || U.today(),
          startTime: fStart.value,
          endTime: fEnd.value,
          status: fStatus.value,
          priority: fPriority.value,
          note: fNote.value.trim(),
          flagship: fFlagship.checked,
        };

        if (isEdit) {
          Store.mutate(function (s) {
            var target = s.tasks.filter(function (x) {
              return x.id === t.id;
            })[0];
            if (target) {
              Object.assign(target, payload, { updatedAt: Date.now() });
            }
          }, 'task:update');
          U.toast('任务已更新', 'success');
        } else {
          Store.mutate(function (s) {
            s.tasks.push(
              Object.assign(
                {
                  id: U.uid('tsk'),
                  flagship: false,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
                payload
              )
            );
          }, 'task:create');
          U.toast('任务已创建：' + payload.startTime + '-' + payload.endTime, 'success');
        }
        m.close();
      },
    }, [isEdit ? '保存修改' : '创建任务']);

    var m = UI.modal({
      title: isEdit ? '编辑任务' : '新建任务',
      subtitle: '工作时间为必填项 · Cmd/⌘ + Enter 快速保存',
      width: 'max-w-2xl',
      body: body,
      footer: [
        U.el('button', {
          class: 'btn btn-lg',
          onclick: function () {
            m.close();
          },
        }, ['取消']),
        saveBtn,
      ],
    });

    // 快捷提交
    m.overlay.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    setTimeout(function () {
      validate(true);
    }, 30);
    return m;
  }

  /* ---------------- 状态一键切换 ---------------- */

  function cycleStatus(task) {
    var cur = Store.dictItem('taskStatus', task.status);
    var next = cur.next;
    Store.mutate(function (s) {
      var target = s.tasks.filter(function (x) {
        return x.id === task.id;
      })[0];
      if (target) {
        target.status = next;
        target.updatedAt = Date.now();
      }
    }, 'task:status');
    U.toast('「' + task.title + '」→ ' + Store.dictItem('taskStatus', next).label, 'success', 1500);
  }

  /* ---------------- 任务卡片 ---------------- */

  function taskCard(task, opts) {
    opts = opts || {};
    var st = Store.dictItem('taskStatus', task.status);
    var pr = Store.dictItem('priority', task.priority);
    var pcolor = Store.projectColor(task.project);

    var card = U.el('div', {
      class: 'group relative cursor-pointer rounded-lg border border-line/60 bg-raised/50 p-2.5 transition-all hover:border-brand/40 hover:bg-raised/80 hover:shadow-lift',
      draggable: opts.draggable ? 'true' : null,
      dataset: { taskId: task.id, status: task.status },
    });

    card.appendChild(
      U.el('div', { class: 'flex items-start gap-2' }, [
        U.el('span', {
          class: 'mt-1 h-2 w-2 shrink-0 rounded-full',
          style: { background: pcolor, boxShadow: '0 0 8px ' + U.alpha(pcolor, 0.6) },
        }),
        U.el('div', { class: 'min-w-0 flex-1' }, [
          U.el('div', {
            class: 'truncate text-[12.5px] font-medium leading-snug text-ink',
            text: task.title,
          }),
          U.el('div', { class: 'mt-1 flex flex-wrap items-center gap-1.5' }, [
            U.el('span', { class: 'num text-[10px] text-mute', text: task.startTime + '–' + task.endTime }),
            U.el('span', { class: 'badge badge-' + st.key, text: st.label }),
            U.el('span', {
              class: 'badge',
              style: { background: U.alpha(pr.color, 0.14), color: pr.color },
              text: pr.key,
            }),
            task.flagship
              ? U.el('span', { class: 'badge', style: { background: U.alpha('#a78bfa', 0.16), color: '#a78bfa' }, text: '长线' })
              : null,
          ]),
        ]),
        U.el('div', { class: 'absolute right-2 top-2 flex flex-col items-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100' }, [
          U.el('button', {
            class: 'btn btn-ghost btn-icon h-6 w-6 text-[10px]',
            title: '编辑',
            onclick: function (e) {
              e.stopPropagation();
              openEditor(task);
            },
          }, ['✎']),
          U.el('button', {
            class: 'btn btn-ghost btn-icon h-6 w-6 text-[10px]',
            title: '删除',
            onclick: function (e) {
              e.stopPropagation();
              UI.confirm('删除任务', '确认删除「' + task.title + '」？此操作不可撤销。', function () {
                Store.mutate(function (s) {
                  s.tasks = s.tasks.filter(function (x) {
                    return x.id !== task.id;
                  });
                }, 'task:delete');
                U.toast('任务已删除', 'success');
              }, true);
            },
          }, ['🗑']),
        ]),
      ])
    );

    // 状态一键切换条 —— 常驻可见，四段分别对应四种状态
    var switcher = U.el('div', { class: 'mt-2 flex items-center gap-1' });
    Store.dict('taskStatus').forEach(function (d) {
      var active = d.key === task.status;
      switcher.appendChild(
        U.el('button', {
          class: 'h-2 flex-1 rounded-full transition-all hover:h-3.5',
          style: { background: d.color, opacity: active ? 1 : 0.34 },
          title: '标记为' + d.label + (active ? '（当前）' : ''),
          onclick: function (e) {
            e.stopPropagation();
            Store.mutate(function (s) {
              var target = s.tasks.filter(function (x) {
                return x.id === task.id;
              })[0];
              if (target) {
                target.status = d.key;
                target.updatedAt = Date.now();
              }
            }, 'task:status');
            U.toast('已标记为「' + d.label + '」', 'success', 1400);
          },
        })
      );
    });
    card.appendChild(switcher);

    card.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      openEditor(task);
    });
    card.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      cycleStatus(task);
    });

    return card;
  }

  /* ---------------- 看板拖拽 ---------------- */

  function setupDragAndDrop(root) {
    var dragged = null;

    U.$$('[data-task-id]', root).forEach(function (card) {
      card.addEventListener('dragstart', function (e) {
        dragged = card;
        card.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', card.dataset.taskId);
        } catch (err) {}
      });
      card.addEventListener('dragend', function () {
        card.style.opacity = '';
        dragged = null;
        U.$$('.kb-col', root).forEach(function (c) {
          c.classList.remove('ring-2', 'ring-brand/50');
        });
      });
    });

    U.$$('.kb-col', root).forEach(function (col) {
      col.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('ring-2', 'ring-brand/50');
      });
      col.addEventListener('dragleave', function () {
        col.classList.remove('ring-2', 'ring-brand/50');
      });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('ring-2', 'ring-brand/50');
        var id = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || (dragged && dragged.dataset.taskId);
        if (!id) return;
        var status = col.dataset.status;
        var task = Store.taskById(id);
        if (!task || task.status === status) return;
        Store.mutate(function (s) {
          var target = s.tasks.filter(function (x) {
            return x.id === id;
          })[0];
          if (target) {
            target.status = status;
            target.updatedAt = Date.now();
          }
        }, 'task:status');
        U.toast('「' + task.title + '」已移动到 ' + Store.dictItem('taskStatus', status).label, 'success');
      });
    });
  }

  /* ---------------- 主渲染 ---------------- */

  function render(root) {
    ensureDate();
    var s = Store.state;
    // 防御：若当前筛选的项目已被删除，回退到「全部项目」，
    // 否则筛选结果会永远为空且下拉框里残留已不存在的选项
    if (filter.project !== 'all') {
      var projAlive = s.projects.some(function (p) { return p.id === filter.project; });
      if (!projAlive) filter.project = 'all';
    }
    // 当日全部任务（不受筛选影响，用于日期切换的上下文）
    var dayAll = s.tasks.filter(function (t) {
      return t.date === filter.date;
    });

    // 应用全部筛选条件后的可见任务 —— 时间轴、看板、统计条共用同一集合，
    // 保证筛选在所有区域一致生效
    var dayTasks = dayAll.slice();

    if (filter.project !== 'all') {
      dayTasks = dayTasks.filter(function (t) {
        return t.project === filter.project;
      });
    }
    if (filter.status !== 'all') {
      dayTasks = dayTasks.filter(function (t) {
        return t.status === filter.status;
      });
    }
    if (filter.keyword) {
      var kw = filter.keyword.toLowerCase();
      dayTasks = dayTasks.filter(function (t) {
        return (
          t.title.toLowerCase().indexOf(kw) >= 0 ||
          (t.note || '').toLowerCase().indexOf(kw) >= 0
        );
      });
    }

    dayTasks.sort(function (a, b) {
      return U.toMin(a.startTime) - U.toMin(b.startTime);
    });

    /* ---- 顶部工具条 ---- */
    var toolbar = U.el('div', { class: 'flex flex-wrap items-center gap-2' });

    // 日期切换
    var datePicker = global.OpsDesk.Picker.dateField({
      value: filter.date,
      className: 'w-[150px]',
    });
    datePicker.addEventListener('change', function () {
      filter.date = datePicker.value;
      global.OpsDesk.App.render();
    });
    toolbar.appendChild(
      U.el('button', {
        class: 'btn btn-icon',
        title: '前一天',
        onclick: function () {
          filter.date = U.ymd(U.addDays(U.parseYmd(filter.date), -1));
          global.OpsDesk.App.render();
        },
      }, ['‹'])
    );
    toolbar.appendChild(datePicker.el);
    toolbar.appendChild(
      U.el('button', {
        class: 'btn btn-icon',
        title: '后一天',
        onclick: function () {
          filter.date = U.ymd(U.addDays(U.parseYmd(filter.date), 1));
          global.OpsDesk.App.render();
        },
      }, ['›'])
    );
    toolbar.appendChild(
      U.el('button', {
        class: 'chip ' + (filter.date === U.today() ? 'chip-active' : ''),
        onclick: function () {
          filter.date = U.today();
          global.OpsDesk.App.render();
        },
      }, ['今天'])
    );

    toolbar.appendChild(U.el('div', { class: 'mx-1 h-5 w-px bg-line/70' }));

    // 项目筛选
    var projSel = U.el('select', {
      class: 'input h-[30px] w-auto py-0 text-[12px]',
      onchange: function (e) {
        filter.project = e.target.value;
        global.OpsDesk.App.render();
      },
    });
    projSel.appendChild(U.el('option', { value: 'all', text: '全部项目', selected: filter.project === 'all' }));
    s.projects.forEach(function (p) {
      projSel.appendChild(U.el('option', { value: p.id, text: p.name, selected: filter.project === p.id }));
    });
    toolbar.appendChild(projSel);

    // 状态筛选
    var stSel = U.el('select', {
      class: 'input h-[30px] w-auto py-0 text-[12px]',
      onchange: function (e) {
        filter.status = e.target.value;
        global.OpsDesk.App.render();
      },
    });
    stSel.appendChild(U.el('option', { value: 'all', text: '全部状态', selected: filter.status === 'all' }));
    Store.dict('taskStatus').forEach(function (d) {
      stSel.appendChild(U.el('option', { value: d.key, text: d.label, selected: filter.status === d.key }));
    });
    toolbar.appendChild(stSel);

    // 搜索
    var search = U.el('input', {
      class: 'input h-[30px] w-[170px] py-0 text-[12px]',
      type: 'search',
      placeholder: '搜索任务…',
      value: filter.keyword,
      oninput: U.debounce(function (e) {
        filter.keyword = e.target.value.trim();
        global.OpsDesk.App.render();
      }, 220),
    });
    toolbar.appendChild(search);

    toolbar.appendChild(U.el('div', { class: 'flex-1' }));
    toolbar.appendChild(
      U.el('button', {
        class: 'btn btn-primary',
        onclick: function () {
          openEditor(null);
        },
      }, ['＋ 新建任务'])
    );

    /* ---- 统计条 ---- */
    var all = dayTasks;
    var doneCount = all.filter(function (t) {
      return t.status === 'done';
    }).length;
    var rate = all.length ? Math.round((doneCount / all.length) * 100) : 0;

    var statStrip = U.el('div', { class: 'grid grid-cols-2 gap-3 sm:grid-cols-4' }, [
      miniStat('当日任务', all.length, '项', 'var(--c-brand)'),
      miniStat('已完成', doneCount, '项', 'var(--c-ok)'),
      miniStat('完成率', rate, '%', 'var(--c-violet)'),
      miniStat(
        '计划工时',
        U.fmtDur(
          U.sum(all, function (t) {
            return U.duration(t.startTime, t.endTime);
          })
        ),
        '',
        'var(--c-warn)'
      ),
    ]);

    /* ---- 主区：时间轴 + 侧栏列表 ---- */
    var hasFilter =
      filter.project !== 'all' || filter.status !== 'all' || !!filter.keyword;

    var tlWrap = U.el('div', { class: 'panel' });
    tlWrap.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '当日时间线' }),
        U.el('div', { class: 'flex items-center gap-2 text-[11px] text-mute' }, [
          U.el('span', { text: U.friendlyFull(filter.date) }),
          U.el('span', { class: 'h-3 w-px bg-line' }),
          U.el('span', { text: all.length + ' 项安排' }),
          hasFilter && dayAll.length
            ? U.el('span', { class: 'chip chip-active', text: '已筛选 / 共 ' + dayAll.length + ' 项' })
            : null,
        ]),
      ])
    );

    var tlBody = U.el('div', { class: 'scroll-y max-h-[520px] px-4 py-4' });
    if (!all.length) {
      tlBody.appendChild(
        U.el('div', { class: 'flex h-40 flex-col items-center justify-center gap-2 text-center' }, [
          U.el('div', { class: 'text-2xl opacity-40', text: hasFilter && dayAll.length ? '🔍' : '🗓' }),
          U.el('div', {
            class: 'text-[13px] text-mute',
            text: hasFilter && dayAll.length ? '当前筛选条件下没有匹配的任务' : '这一天还没有安排',
          }),
          hasFilter && dayAll.length
            ? U.el('button', {
                class: 'btn mt-1',
                onclick: function () {
                  filter.project = 'all';
                  filter.status = 'all';
                  filter.keyword = '';
                  global.OpsDesk.App.render();
                },
              }, ['清除筛选条件'])
            : U.el('button', {
                class: 'btn btn-primary mt-1',
                onclick: function () {
                  openEditor(null);
                },
              }, ['＋ 添加日程']),
        ])
      );
    } else {
      tlBody.appendChild(
        UI.timeline(all, {
          hourHeight: 60,
          startHour: 7,
          endHour: 22,
          onClick: function (t) {
            openEditor(t);
          },
        })
      );
    }
    tlWrap.appendChild(tlBody);

    /* ---- 看板 ---- */
    var board = U.el('div', { class: 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4' });
    Store.dict('taskStatus').forEach(function (st) {
      var col = U.el('div', {
        class: 'kb-col flex min-h-[120px] flex-col rounded-lg border border-line/60 bg-raised/30 p-2 transition-all',
        dataset: { status: st.key },
      });
      var items = all.filter(function (t) {
        return t.status === st.key;
      });
      col.appendChild(
        U.el('div', { class: 'mb-2 flex items-center justify-between px-1' }, [
          U.el('div', { class: 'flex items-center gap-1.5' }, [
            U.el('span', { class: 'h-2 w-2 rounded-full', style: { background: st.color } }),
            U.el('span', { class: 'text-[12px] font-semibold text-dim', text: st.label }),
          ]),
          U.el('span', { class: 'num rounded-md bg-line/30 px-1.5 text-[10px] text-mute', text: String(items.length) }),
        ])
      );
      items.forEach(function (t) {
        col.appendChild(taskCard(t, { draggable: true }));
      });
      if (!items.length) {
        col.appendChild(
          U.el('div', { class: 'flex h-16 items-center justify-center rounded-md border border-dashed border-line/50 text-[11px] text-mute', text: '拖拽任务到此' })
        );
      }
      board.appendChild(col);
    });

    var boardPanel = U.el('div', { class: 'panel' });
    boardPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '任务看板' }),
        U.el('div', { class: 'text-[11px] text-mute', text: '拖拽卡片切换状态 · 单击卡片循环状态' }),
      ])
    );
    var boardBody = U.el('div', { class: 'px-3 py-3' });
    boardBody.appendChild(board);
    boardPanel.appendChild(boardBody);

    root.innerHTML = '';
    root.appendChild(
      U.el('div', { class: 'space-y-4 animate-fade-up' }, [
        U.el('div', { class: 'flex flex-wrap items-center gap-2' }, [
          U.el('div', {}, [
            U.el('h2', { class: 'text-[15px] font-bold text-ink', text: '日程与任务管理' }),
            U.el('div', { class: 'mt-0.5 text-[11.5px] text-mute', text: '工作时间必填 · 拖拽看板切换状态 · 单击卡片快速流转' }),
          ]),
        ]),
        statStrip,
        toolbar,
        U.el('div', { class: 'auto-cols auto-cols-wide' }, [tlWrap, boardPanel]),
      ])
    );

    setupDragAndDrop(root);
  }

  function miniStat(label, value, unit, color) {
    return U.el('div', { class: 'panel px-3.5 py-3' }, [
      U.el('div', { class: 'kicker', text: label }),
      U.el('div', { class: 'mt-1 flex items-baseline gap-1' }, [
        U.el('span', { class: 'num text-[22px] font-bold leading-none text-ink', text: String(value) }),
        unit ? U.el('span', { class: 'text-[11px] text-mute', text: unit }) : null,
      ]),
      U.el('div', { class: 'mt-2 h-0.5 w-full overflow-hidden rounded-full bg-line/40' }, [
        U.el('div', { class: 'h-full rounded-full', style: { width: '100%', background: color, opacity: 0.55 } }),
      ]),
    ]);
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Tasks = {
    render: render,
    openEditor: openEditor,
    filter: filter,
  };
})(window);
