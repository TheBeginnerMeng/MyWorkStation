/* ============================================================
   projects.js — 项目管理
   维护项目清单：新增 / 重命名 / 切换「重点」标记 / 删除
   删除项目时，其下的任务、故障、流水可迁移到其它项目，避免数据丢失
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var UI = global.OpsDesk.UI;
  var Store = global.OpsDesk.Store;

  var PALETTE = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#f472b6', '#22d3ee', '#f87171'];

  /* ---------------- 数据操作 ---------------- */

  /** 统计某项目被引用的记录数 */
  function usageOf(projectId) {
    var s = Store.state;
    return {
      tasks: s.tasks.filter(function (t) { return t.project === projectId; }).length,
      incidents: s.incidents.filter(function (i) { return i.project === projectId; }).length,
      logs: s.timeLogs.filter(function (l) { return l.project === projectId; }).length,
    };
  }

  function usageTotal(u) {
    return u.tasks + u.incidents + u.logs;
  }

  /**
   * 删除项目
   * @param {string} projectId 待删除项目
   * @param {string|null} targetId 关联记录迁移到该项目；传 null 则连同记录一并删除
   */
  function removeProject(projectId, targetId) {
    Store.mutate(function (s) {
      s.projects = s.projects.filter(function (p) {
        return p.id !== projectId;
      });
      if (targetId) {
        s.tasks.forEach(function (t) {
          if (t.project === projectId) t.project = targetId;
        });
        s.incidents.forEach(function (i) {
          if (i.project === projectId) i.project = targetId;
        });
        s.timeLogs.forEach(function (l) {
          if (l.project === projectId) l.project = targetId;
        });
      } else {
        s.tasks = s.tasks.filter(function (t) { return t.project !== projectId; });
        s.incidents = s.incidents.filter(function (i) { return i.project !== projectId; });
        s.timeLogs = s.timeLogs.filter(function (l) { return l.project !== projectId; });
      }
    }, 'project:delete');
  }

  /** 切换项目的「重点」标记 */
  function toggleFlagship(projectId) {
    Store.mutate(function (s) {
      var p = s.projects.filter(function (x) { return x.id === projectId; })[0];
      if (p) p.flagship = !p.flagship;
    }, 'project:flagship');
  }

  /* ---------------- 新增 / 编辑表单 ---------------- */

  function openProjectForm(project, onDone) {
    var isEdit = !!project;
    var p = project || { name: '', desc: '', color: PALETTE[0], flagship: false };
    var saved = null;

    var fName = U.el('input', { class: 'input', type: 'text', value: p.name, placeholder: '例如：核心存储集群迁移' });
    var fDesc = U.el('input', { class: 'input', type: 'text', value: p.desc || '', placeholder: '一句话说明这个项目在做什么' });
    var fFlagship = U.el('input', { class: 'h-4 w-4 accent-brand', type: 'checkbox' });
    fFlagship.checked = !!p.flagship;

    var picked = p.color || PALETTE[0];
    var swatches = U.el('div', { class: 'flex flex-wrap gap-2' });
    var swatchBtns = [];
    PALETTE.forEach(function (c) {
      var b = U.el('button', {
        type: 'button',
        class: 'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
        style: { background: c, borderColor: c === picked ? 'rgb(var(--c-ink))' : 'transparent' },
        title: c,
        onclick: function () {
          picked = c;
          swatchBtns.forEach(function (x) {
            x.style.borderColor = x.dataset.color === picked ? 'rgb(var(--c-ink))' : 'transparent';
          });
        },
      });
      b.dataset.color = c;
      swatchBtns.push(b);
      swatches.appendChild(b);
    });

    var err = U.el('div', { class: 'hint hint-error hidden' });

    var body = U.el('div', { class: 'space-y-4' }, [
      U.el('div', {}, [
        U.el('label', { class: 'label', text: '项目名称 *' }),
        fName,
      ]),
      U.el('div', {}, [
        U.el('label', { class: 'label', text: '项目说明' }),
        fDesc,
      ]),
      U.el('div', {}, [
        U.el('label', { class: 'label', text: '标识颜色' }),
        swatches,
      ]),
      U.el('label', {
        class: 'flex cursor-pointer items-center gap-2.5 rounded-lg border border-line/60 bg-raised/40 px-3 py-2.5',
      }, [
        fFlagship,
        U.el('div', {}, [
          U.el('div', { class: 'text-[13px] font-medium text-ink', text: '标记为重点项目' }),
          U.el('div', { class: 'mt-0.5 text-[11px] text-mute', text: '重点项目会进入晨会站会稿的「重点项目」段落' }),
        ]),
      ]),
      err,
    ]);

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        var name = fName.value.trim();
        if (!name) {
          err.textContent = '请填写项目名称';
          err.classList.remove('hidden');
          fName.focus();
          return;
        }
        // 重名检查（编辑时排除自身）
        var dup = Store.state.projects.some(function (x) {
          return x.name === name && (!isEdit || x.id !== project.id);
        });
        if (dup) {
          err.textContent = '已存在同名项目，请换一个名称';
          err.classList.remove('hidden');
          fName.focus();
          return;
        }

        Store.mutate(function (s) {
          if (isEdit) {
            var t = s.projects.filter(function (x) { return x.id === project.id; })[0];
            if (t) {
              t.name = name;
              t.desc = fDesc.value.trim();
              t.color = picked;
              t.flagship = fFlagship.checked;
              saved = t;
            }
          } else {
            var np = {
              id: U.uid('prj'),
              name: name,
              desc: fDesc.value.trim(),
              color: picked,
              flagship: fFlagship.checked,
            };
            s.projects.push(np);
            saved = np;
          }
        }, isEdit ? 'project:update' : 'project:create');

        U.toast(isEdit ? '项目已更新' : '项目已创建：' + name, 'success');
        m.close();
        // 视图刷新由 App 的 store 订阅统一处理，这里只需回传保存结果，
        // 便于选择器立即选中 / 刷新选项
        if (onDone) onDone(saved);
      },
    }, [isEdit ? '保存修改' : '创建项目']);

    var m = UI.modal({
      title: isEdit ? '编辑项目' : '新建项目',
      subtitle: isEdit ? '修改名称、说明、颜色或重点标记' : '项目用于任务的归属分类',
      width: 'max-w-lg',
      body: body,
      footer: [
        U.el('button', {
          class: 'btn btn-lg',
          onclick: function () { m.close(); },
        }, ['取消']),
        saveBtn,
      ],
    });
    return m;
  }

  /* ---------------- 删除确认（含迁移） ---------------- */

  function requestDelete(project, onDone) {
    var projects = Store.state.projects;
    if (projects.length <= 1) {
      U.toast('至少需要保留一个项目', 'error');
      return;
    }

    var u = usageOf(project.id);
    var total = usageTotal(u);
    var detail = [];
    if (u.tasks) detail.push(u.tasks + ' 个任务');
    if (u.incidents) detail.push(u.incidents + ' 条故障');
    if (u.logs) detail.push(u.logs + ' 条流水');

    // 无关联记录：直接确认删除
    if (!total) {
      UI.confirm(
        '删除项目',
        '确认删除项目「' + project.name + '」？该项目下没有任务、故障与流水记录。',
        function () {
          removeProject(project.id, null);
          U.toast('项目已删除', 'success');
          if (onDone) onDone();
        },
        true
      );
      return;
    }

    // 有关联记录：让用户选择迁移目标，避免静默丢失数据
    var others = projects.filter(function (p) { return p.id !== project.id; });
    var selected = others[0].id;
    var rows = [];
    var rowEls = [];

    var mkRow = function (p, type) {
      var row = U.el('button', {
        type: 'button',
        class: 'flex w-full items-center gap-2.5 rounded-lg border border-line/60 bg-raised/40 px-3 py-2 text-left transition hover:border-brand/40',
        onclick: function () {
          selected = p.id;
          rowEls.forEach(function (x) {
            x.el.classList.toggle('border-brand/70', x.id === selected);
            x.el.classList.toggle('bg-brand/10', x.id === selected);
          });
        },
      }, [
        U.el('span', { class: 'h-2.5 w-2.5 shrink-0 rounded-full', style: { background: p.color } }),
        U.el('span', { class: 'text-[13px] font-medium text-ink', text: p.name }),
        U.el('span', { class: 'ml-auto text-[11px] text-mute', text: type }),
      ]);
      rowEls.push({ id: p.id, el: row });
      return row;
    };

    others.forEach(function (p) {
      rows.push(mkRow(p, '迁移到此项目'));
    });
    // 兜底：删除项目本身在 Store.mutate 时会过滤掉，不能作为迁移目标
    rows.push(
      U.el('div', { class: 'mt-1 text-[11px] text-mute', text: '或' }),
      (function () {
        var killId = '__delete_records__';
        var row = U.el('button', {
          type: 'button',
          class: 'flex w-full items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-left transition hover:border-danger/60',
          onclick: function () {
            selected = killId;
            rowEls.forEach(function (x) {
              x.el.classList.toggle('border-brand/70', x.id === selected);
              x.el.classList.toggle('bg-brand/10', x.id === selected);
            });
          },
        }, [
          U.el('span', { class: 'text-[13px] font-medium text-danger', text: '一并删除这些记录' }),
          U.el('span', { class: 'ml-auto text-[11px] text-mute', text: '不可撤销' }),
        ]);
        rowEls.push({ id: killId, el: row });
        return row;
      })()
    );

    var body = U.el('div', { class: 'space-y-3' }, [
      U.el('p', { class: 'text-[13px] leading-relaxed text-dim' , text:
        '项目「' + project.name + '」下还有 ' + detail.join('、') + '。请选择这些记录的去向：' }),
      U.el('div', { class: 'space-y-2' }, rows),
    ]);

    var m = UI.modal({
      title: '删除项目',
      subtitle: '关联记录不会静默丢失，请选择迁移目标',
      width: 'max-w-lg',
      body: body,
      footer: [
        U.el('button', {
          class: 'btn btn-lg',
          onclick: function () { m.close(); },
        }, ['取消']),
        U.el('button', {
          class: 'btn btn-danger btn-lg',
          onclick: function () {
            m.close();
            var target = selected === '__delete_records__' ? null : selected;
            removeProject(project.id, target);
            U.toast(
              target
                ? '项目已删除，关联记录已迁移'
                : '项目及关联记录已删除',
              'success'
            );
            if (onDone) onDone();
          },
        }, ['确认删除']),
      ],
    });
    // 默认预选第一个迁移目标
    if (rowEls.length) {
      rowEls[0].el.classList.add('border-brand/70');
      rowEls[0].el.classList.add('bg-brand/10');
    }
    return m;
  }

  /* ---------------- 管理面板 ---------------- */

  function openManager() {
    var body = U.el('div', { class: 'space-y-2.5' });

    function renderList() {
      body.innerHTML = '';
      var s = Store.state;

      if (!s.projects.length) {
        body.appendChild(
          U.el('div', { class: 'py-6 text-center text-[13px] text-mute', text: '还没有项目，先新建一个。' })
        );
        return;
      }

      s.projects.forEach(function (p) {
        var u = usageOf(p.id);
        var total = usageTotal(u);
        var bits = [];
        if (u.tasks) bits.push(u.tasks + ' 任务');
        if (u.incidents) bits.push(u.incidents + ' 故障');
        if (u.logs) bits.push(u.logs + ' 流水');

        body.appendChild(
          U.el('div', { class: 'flex items-center gap-3 rounded-lg border border-line/60 bg-raised/40 px-3 py-2.5' }, [
            U.el('span', { class: 'h-3 w-3 shrink-0 rounded-full', style: { background: p.color } }),
            U.el('div', { class: 'min-w-0 flex-1' }, [
              U.el('div', { class: 'flex items-center gap-1.5' }, [
                U.el('span', { class: 'truncate text-[13px] font-medium text-ink', text: p.name }),
                p.flagship
                  ? U.el('span', { class: 'badge', style: { background: U.alpha('#a78bfa', 0.16), color: '#a78bfa' }, text: '重点' })
                  : null,
              ]),
              U.el('div', {
                class: 'mt-0.5 truncate text-[11px] text-mute',
                text: (p.desc ? p.desc + ' · ' : '') + (bits.length ? bits.join(' / ') : '暂无关联记录'),
              }),
            ]),
            U.el('button', {
              class: 'chip ' + (p.flagship ? 'chip-active' : ''),
              title: p.flagship ? '点击取消「重点」标记' : '点击设为重点项目',
              onclick: function () {
                toggleFlagship(p.id);
                U.toast(p.flagship ? '已取消重点项目标记' : '已设为重点项目', 'success');
                renderList();
              },
            }, [p.flagship ? '★ 重点' : '☆ 重点']),
            U.el('button', {
              class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px]',
              title: '编辑项目',
              onclick: function () { openProjectForm(p, renderList); },
            }, ['✎']),
            U.el('button', {
              class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px] text-danger',
              title: s.projects.length <= 1 ? '至少需要保留一个项目' : '删除项目',
              disabled: s.projects.length <= 1,
              onclick: function () { requestDelete(p, renderList); },
            }, ['🗑']),
          ])
        );
      });
    }

    renderList();

    var m = UI.modal({
      title: '项目管理',
      subtitle: '重点标记决定是否进入晨会站会稿 · 删除项目时关联记录可迁移，不会丢失',
      width: 'max-w-2xl',
      body: body,
      footer: [
        U.el('button', {
          class: 'btn btn-lg',
          onclick: function () { openProjectForm(null, renderList); },
        }, ['＋ 新建项目']),
        U.el('button', {
          class: 'btn btn-primary btn-lg',
          onclick: function () { m.close(); },
        }, ['完成']),
      ],
    });
    return m;
  }

  /* ---------------- 项目选择器（内联可维护） ---------------- */

  /**
   * 生成「所属项目」选择控件：下拉 + 内联新建 / 重命名 / 删除
   * 表单里不必跳转到项目管理面板就能维护项目清单。
   *
   * @param {Object} opts
   *   value      {string} 初始选中的项目 id
   *   allowEmpty {boolean} 是否允许「不关联项目」
   *   emptyLabel {string}  空选项文案
   *   onChange   {Function} 选中值变化时回调（参数为 project id）
   * @returns {Object} { el, select, getValue, refresh }
   */
  function picker(opts) {
    opts = opts || {};
    var allowEmpty = !!opts.allowEmpty;
    var emptyLabel = opts.emptyLabel || '不关联项目';

    var sel = U.el('select', { class: 'input' });
    var hint = U.el('span', { class: 'text-[10.5px] text-mute' });

    function selectedProject() {
      var id = sel.value;
      return Store.state.projects.filter(function (p) { return p.id === id; })[0] || null;
    }

    /** 重建下拉选项；keepValue 为 undefined 时沿用当前选中值 */
    function refresh(keepValue) {
      var val = keepValue !== undefined ? keepValue : sel.value;
      sel.innerHTML = '';
      if (allowEmpty) {
        sel.appendChild(U.el('option', { value: '', text: emptyLabel }));
      }
      Store.state.projects.forEach(function (p) {
        sel.appendChild(U.el('option', { value: p.id, text: p.name }));
      });
      var exists = Store.state.projects.some(function (p) { return p.id === val; });
      if (exists) {
        sel.value = val;
      } else if (allowEmpty) {
        sel.value = '';
      } else {
        sel.value = Store.state.projects.length ? Store.state.projects[0].id : '';
      }
      syncHint();
    }

    function syncHint() {
      var p = selectedProject();
      var cnt = p ? usageTotal(usageOf(p.id)) : 0;
      hint.textContent = p
        ? (p.desc ? p.desc + ' · ' : '') + cnt + ' 条关联记录'
        : allowEmpty ? '未关联任何项目' : '暂无项目';
      btnEdit.disabled = !p;
      btnDel.disabled = !p || Store.state.projects.length <= 1;
    }

    var btnNew = U.el('button', {
      type: 'button',
      class: 'btn btn-ghost h-7 px-2 text-[11px]',
      title: '新建项目',
      onclick: function () {
        openProjectForm(null, function (saved) {
          refresh(saved ? saved.id : undefined);
          if (opts.onChange) opts.onChange(sel.value);
        });
      },
    }, ['＋ 新建']);

    var btnEdit = U.el('button', {
      type: 'button',
      class: 'btn btn-ghost h-7 px-2 text-[11px]',
      title: '重命名 / 编辑当前项目',
      onclick: function () {
        var p = selectedProject();
        if (!p) return;
        openProjectForm(p, function () {
          refresh(p.id);
          if (opts.onChange) opts.onChange(sel.value);
        });
      },
    }, ['✎ 重命名']);

    var btnDel = U.el('button', {
      type: 'button',
      class: 'btn btn-ghost h-7 px-2 text-[11px] text-danger',
      title: '删除当前项目（关联记录可迁移）',
      onclick: function () {
        var p = selectedProject();
        if (!p) return;
        requestDelete(p, function () {
          refresh();
          if (opts.onChange) opts.onChange(sel.value);
        });
      },
    }, ['🗑 删除']);

    sel.addEventListener('change', function () {
      syncHint();
      if (opts.onChange) opts.onChange(sel.value);
    });

    var bar = U.el('div', { class: 'flex flex-wrap items-center gap-1.5' }, [btnNew, btnEdit, btnDel, hint]);
    var wrap = U.el('div', { class: 'space-y-1.5' }, [sel, bar]);

    refresh(opts.value || '');

    return {
      el: wrap,
      select: sel,
      getValue: function () { return sel.value; },
      setValue: function (v) { refresh(v); },
      refresh: refresh,
    };
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Projects = {
    openManager: openManager,
    openForm: openProjectForm,
    requestDelete: requestDelete,
    picker: picker,
    usageOf: usageOf,
    removeProject: removeProject,
    toggleFlagship: toggleFlagship,
    palette: PALETTE,
  };
})(window);
