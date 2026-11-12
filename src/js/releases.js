/* ============================================================
   releases.js — 版本投产台账
   按「版本」归档上线内容，每条投产内容记录：
     内容类型（业务需求 / 技术优化 / 缺陷修复 / 其他变更）
     内容标题
     开发人（必填，便于追溯「谁产出了什么」）
     说明
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Store = global.OpsDesk.Store;
  var UI = global.OpsDesk.UI;

  var filter = {
    status: 'all',
    type: 'all',
    keyword: '',
  };

  /* ---------------- 基础工具 ---------------- */

  function typeOf(key) {
    return Store.dictItem('releaseType', key);
  }

  function statusOf(key) {
    return Store.dictItem('releaseStatus', key);
  }

  function field(label, control, hint) {
    var wrap = U.el('div', {});
    wrap.appendChild(U.el('label', { class: 'label', text: label }));
    wrap.appendChild(control);
    if (hint) wrap.appendChild(U.el('div', { class: 'hint', text: hint }));
    return wrap;
  }

  function allReleases() {
    return Store.state.releases || [];
  }

  /** 版本号里的数字段：v1.10.0 -> [1,10,0] */
  function versionWeight(v) {
    var nums = String(v == null ? '' : v).match(/\d+/g);
    if (!nums) return [0];
    return nums.map(Number);
  }

  /** 版本号倒序比较（新版本在前），无数字段时回退到上线日期 */
  function cmpVersionDesc(a, b) {
    var x = versionWeight(a.version);
    var y = versionWeight(b.version);
    var n = Math.max(x.length, y.length);
    for (var i = 0; i < n; i++) {
      var d = (y[i] || 0) - (x[i] || 0);
      if (d) return d;
    }
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  }

  /** 关键词是否命中版本本身（版本号 / 版本名称 / 负责人） */
  function versionHit(release) {
    if (!filter.keyword) return false;
    var kw = filter.keyword.toLowerCase();
    return (
      String(release.version).toLowerCase().indexOf(kw) >= 0 ||
      String(release.title || '').toLowerCase().indexOf(kw) >= 0 ||
      String(release.owner || '').toLowerCase().indexOf(kw) >= 0
    );
  }

  /** 当前筛选条件下，某个版本下应展示的条目 */
  function visibleItems(release) {
    var items = (release.items || []).slice();
    if (filter.type !== 'all') {
      items = items.filter(function (it) {
        return it.type === filter.type;
      });
    }
    if (filter.keyword && !versionHit(release)) {
      var kw = filter.keyword.toLowerCase();
      items = items.filter(function (it) {
        return (
          String(it.title).toLowerCase().indexOf(kw) >= 0 ||
          String(it.dev || '').toLowerCase().indexOf(kw) >= 0 ||
          String(it.note || '').toLowerCase().indexOf(kw) >= 0
        );
      });
    }
    return items;
  }

  function matchRelease(release) {
    if (filter.status !== 'all' && release.status !== filter.status) return false;
    if (filter.type !== 'all' || filter.keyword) {
      return versionHit(release) || visibleItems(release).length > 0;
    }
    return true;
  }

  /* ---------------- 投产内容条目编辑 ---------------- */

  /**
   * 打开「投产内容」条目编辑弹窗
   * @param {Object} opts {item, onSave(payload), onDelete(item)}
   */
  function openItemEditor(opts) {
    opts = opts || {};
    var isEdit = !!opts.item;
    var it = opts.item || { type: 'feature', title: '', dev: '', note: '' };

    var fType = U.el('select', { class: 'input' });
    Store.dict('releaseType').forEach(function (d) {
      fType.appendChild(
        U.el('option', { value: d.key, text: d.icon + ' ' + d.label, selected: d.key === it.type })
      );
    });

    var fTitle = U.el('input', {
      class: 'input',
      type: 'text',
      value: it.title || '',
      placeholder: '例如：集群迁移批次管理台账，支持按批次灰度',
    });
    var fDev = U.el('input', {
      class: 'input',
      type: 'text',
      value: it.dev || '',
      placeholder: '例如：张三',
    });
    var fNote = U.el('textarea', { class: 'input', placeholder: '影响范围、验证方式、回归结论…' });
    fNote.value = it.note || '';

    var err = U.el('div', { class: 'hint hint-error hidden' });

    function setErr(msg) {
      if (msg) {
        err.textContent = msg;
        err.classList.remove('hidden');
      } else {
        err.textContent = '';
        err.classList.add('hidden');
      }
    }

    function validate(silent) {
      var title = fTitle.value.trim();
      var dev = fDev.value.trim();
      fTitle.classList.toggle('input-invalid', !title);
      fDev.classList.toggle('input-invalid', !dev);
      if (!title) {
        setErr('请填写投产内容标题');
        if (!silent) fTitle.focus();
        return false;
      }
      if (!dev) {
        setErr('请填写开发人，便于追溯责任归属');
        if (!silent) fDev.focus();
        return false;
      }
      setErr(null);
      return true;
    }

    // 输入时同步刷新校验提示
    fTitle.addEventListener('input', function () {
      validate(true);
    });
    fDev.addEventListener('input', function () {
      validate(true);
    });

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        if (!validate()) return;
        var payload = {
          id: isEdit ? it.id : U.uid('rit'),
          type: fType.value,
          title: fTitle.value.trim(),
          dev: fDev.value.trim(),
          note: fNote.value.trim(),
        };
        if (opts.onSave) opts.onSave(payload);
        m.close();
      },
    }, [isEdit ? '保存条目' : '添加条目']);

    var footer = [
      U.el('button', {
        class: 'btn btn-lg',
        onclick: function () {
          m.close();
        },
      }, ['取消']),
    ];
    if (isEdit && opts.onDelete) {
      footer.unshift(
        U.el('button', {
          class: 'btn btn-danger btn-lg',
          onclick: function () {
            m.close();
            opts.onDelete(it);
          },
        }, ['删除条目'])
      );
    }
    footer.push(saveBtn);

    var m = UI.modal({
      title: isEdit ? '编辑投产内容' : '添加投产内容',
      subtitle: '内容标题与开发人为必填项',
      width: 'max-w-lg',
      body: U.el('div', { class: 'space-y-4' }, [
        field('内容类型 *', fType),
        field('内容标题 *', fTitle),
        field('开发人 *', fDev, '每条投产内容都需记录对应的开发人'),
        field('说明', fNote),
        err,
      ]),
      footer: footer,
    });

    m.overlay.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    return m;
  }

  /* ---------------- 已保存版本上的条目增删改 ---------------- */

  function addItemTo(release) {
    openItemEditor({
      item: null,
      onSave: function (payload) {
        Store.mutate(function (s) {
          var r = (s.releases || []).filter(function (x) {
            return x.id === release.id;
          })[0];
          if (!r) return;
          if (!Array.isArray(r.items)) r.items = [];
          r.items.push(payload);
          r.updatedAt = Date.now();
        }, 'release:item:create');
        U.toast('投产内容已添加', 'success');
      },
    });
  }

  function editItemOf(release, item) {
    openItemEditor({
      item: item,
      onSave: function (payload) {
        Store.mutate(function (s) {
          var r = (s.releases || []).filter(function (x) {
            return x.id === release.id;
          })[0];
          if (!r) return;
          var it = (r.items || []).filter(function (x) {
            return x.id === item.id;
          })[0];
          if (it) Object.assign(it, payload);
          r.updatedAt = Date.now();
        }, 'release:item:update');
        U.toast('投产内容已更新', 'success');
      },
      onDelete: function (target) {
        Store.mutate(function (s) {
          var r = (s.releases || []).filter(function (x) {
            return x.id === release.id;
          })[0];
          if (!r) return;
          r.items = (r.items || []).filter(function (x) {
            return x.id !== target.id;
          });
          r.updatedAt = Date.now();
        }, 'release:item:delete');
        U.toast('投产内容已删除', 'success');
      },
    });
  }

  /* ---------------- 版本编辑弹窗 ---------------- */

  /**
   * 打开版本编辑弹窗
   * @param {Object|null} release 传入为编辑，null 为新建
   * @param {Object} opts {asNew:true} 即使传了对象也按新建处理（复制版本用）
   */
  function openEditor(release, opts) {
    opts = opts || {};
    var isEdit = !!release && !opts.asNew;
    var r = release
      ? U.clone(release)
      : {
          version: '',
          title: '',
          date: U.today(),
          status: 'planned',
          owner: '',
          note: '',
          items: [],
        };
    // 草稿条目：弹窗打开期间的增删改先落在内存里，点「保存版本」才落库
    var draftItems = (r.items || []).slice();

    var fVersion = U.el('input', {
      class: 'input',
      type: 'text',
      value: r.version || '',
      placeholder: '例如：v1.4.0',
    });
    var fTitle = U.el('input', {
      class: 'input',
      type: 'text',
      value: r.title || '',
      placeholder: '例如：迁移灰度保障版（可选）',
    });
    var fDate = global.OpsDesk.Picker.dateField({ value: r.date || U.today() });
    var fStatus = U.el('select', { class: 'input' });
    var fOwner = U.el('input', {
      class: 'input',
      type: 'text',
      value: r.owner || '',
      placeholder: '例如：我 / 张三',
    });
    var fNote = U.el('textarea', { class: 'input', placeholder: '上线窗口、回滚预案、影响范围…' });
    fNote.value = r.note || '';

    Store.dict('releaseStatus').forEach(function (d) {
      fStatus.appendChild(
        U.el('option', { value: d.key, text: d.label, selected: d.key === r.status })
      );
    });

    /* ---- 投产内容条目草稿列表 ---- */
    var itemsHost = U.el('div', { class: 'space-y-2' });

    function renderItems() {
      itemsHost.innerHTML = '';
      if (!draftItems.length) {
        itemsHost.appendChild(
          U.el('div', {
            class: 'rounded-lg border border-dashed border-line/60 px-3 py-5 text-center text-[12px] text-mute',
            text: '还没有投产内容，点击下方「＋ 添加投产内容」开始录入',
          })
        );
        return;
      }
      draftItems.forEach(function (it) {
        var t = typeOf(it.type);
        itemsHost.appendChild(
          U.el('div', {
            class: 'flex items-start gap-2.5 rounded-lg border border-line/60 bg-raised/40 px-3 py-2',
          }, [
            U.el('span', { class: 'mt-0.5 text-[12px]', text: t.icon }),
            U.el('div', { class: 'min-w-0 flex-1' }, [
              U.el('div', { class: 'truncate text-[12.5px] text-ink', text: it.title }),
              U.el('div', { class: 'mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-mute' }, [
                U.el('span', {
                  class: 'badge',
                  style: { background: U.alpha(t.color, 0.16), color: t.color },
                  text: t.label,
                }),
                U.el('span', { text: '开发人 ' + (it.dev || '未填写') }),
              ]),
            ]),
            U.el('button', {
              class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px]',
              title: '编辑条目',
              onclick: function () {
                openItemEditor({
                  item: it,
                  onSave: function (payload) {
                    var target = draftItems.filter(function (x) {
                      return x.id === it.id;
                    })[0];
                    if (target) Object.assign(target, payload);
                    renderItems();
                  },
                  onDelete: function (target) {
                    draftItems = draftItems.filter(function (x) {
                      return x.id !== target.id;
                    });
                    renderItems();
                  },
                });
              },
            }, ['✎']),
            U.el('button', {
              class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px] text-danger',
              title: '删除条目',
              onclick: function () {
                draftItems = draftItems.filter(function (x) {
                  return x.id !== it.id;
                });
                renderItems();
              },
            }, ['🗑']),
          ])
        );
      });
    }
    renderItems();

    var err = U.el('div', { class: 'hint hint-error hidden' });

    function setErr(msg) {
      if (msg) {
        err.textContent = msg;
        err.classList.remove('hidden');
      } else {
        err.textContent = '';
        err.classList.add('hidden');
      }
    }

    function validate(silent) {
      var version = fVersion.value.trim();
      fVersion.classList.toggle('input-invalid', !version);
      if (!version) {
        setErr('请填写版本号');
        if (!silent) fVersion.focus();
        return false;
      }
      var dup = allReleases().some(function (x) {
        return x.version === version && (!isEdit || x.id !== release.id);
      });
      if (dup) {
        setErr('已存在版本号「' + version + '」，请换一个');
        if (!silent) fVersion.focus();
        return false;
      }
      setErr(null);
      return true;
    }

    // 输入时同步刷新校验提示，避免上一次的红字一直挂着
    fVersion.addEventListener('input', function () {
      validate(true);
    });

    var saveBtn = U.el('button', {
      class: 'btn btn-primary btn-lg',
      onclick: function () {
        if (!validate()) return;
        var payload = {
          version: fVersion.value.trim(),
          title: fTitle.value.trim(),
          date: fDate.value || U.today(),
          status: fStatus.value,
          owner: fOwner.value.trim(),
          note: fNote.value.trim(),
          items: draftItems.map(function (it) {
            return {
              id: it.id,
              type: it.type,
              title: it.title,
              dev: it.dev,
              note: it.note,
            };
          }),
        };

        if (isEdit) {
          Store.mutate(function (s) {
            var target = (s.releases || []).filter(function (x) {
              return x.id === release.id;
            })[0];
            if (target) Object.assign(target, payload, { updatedAt: Date.now() });
          }, 'release:update');
          U.toast('版本「' + payload.version + '」已更新', 'success');
        } else {
          Store.mutate(function (s) {
            if (!Array.isArray(s.releases)) s.releases = [];
            s.releases.push(
              Object.assign(
                {
                  id: U.uid('rel'),
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
                payload
              )
            );
          }, 'release:create');
          U.toast('版本「' + payload.version + '」已创建', 'success');
        }
        m.close();
      },
    }, [isEdit ? '保存版本' : '创建版本']);

    var body = U.el('div', { class: 'space-y-4' }, [
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' }, [
        field('版本号 *', fVersion),
        field('版本名称', fTitle),
      ]),
      U.el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-3' }, [
        field('上线日期 *', fDate.el),
        field('上线状态', fStatus),
        field('发布负责人', fOwner),
      ]),
      field('备注', fNote),
      U.el('div', {}, [
        U.el('label', { class: 'label', text: '投产内容' }),
        itemsHost,
        U.el('button', {
          type: 'button',
          class: 'btn mt-2 w-full',
          onclick: function () {
            openItemEditor({
              item: null,
              onSave: function (payload) {
                draftItems.push(payload);
                renderItems();
              },
            });
          },
        }, ['＋ 添加投产内容']),
      ]),
      err,
    ]);

    var m = UI.modal({
      title: isEdit ? '编辑版本' : '新建版本',
      subtitle: '版本号唯一 · 投产内容需记录开发人',
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

    m.overlay.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
    return m;
  }

  /* ---------------- 版本级操作 ---------------- */

  function copyRelease(release) {
    var draft = U.clone(release);
    draft.id = U.uid('rel');
    draft.version = ''; // 版本号必须重新填，避免与原版本重复
    draft.title = (draft.title || '') + '（副本）';
    draft.date = U.today();
    draft.status = 'planned';
    draft.items = (draft.items || []).map(function (it) {
      return Object.assign({}, it, { id: U.uid('rit') });
    });
    openEditor(draft, { asNew: true });
  }

  function removeRelease(release) {
    var n = (release.items || []).length;
    UI.confirm(
      '删除版本',
      '确认删除版本「' + release.version + '」？其下 ' + n + ' 条投产内容会一并删除，此操作不可撤销。',
      function () {
        Store.mutate(function (s) {
          s.releases = (s.releases || []).filter(function (x) {
            return x.id !== release.id;
          });
        }, 'release:delete');
        U.toast('版本已删除', 'success');
      },
      true
    );
  }

  /* ---------------- 视图渲染 ---------------- */

  function itemRow(release, it) {
    var t = typeOf(it.type);
    return U.el('div', {
      class: 'group flex cursor-pointer items-start gap-2.5 rounded-lg border border-line/50 bg-raised/30 px-3 py-2 transition hover:border-brand/40 hover:bg-raised/60',
      title: '点击编辑这条投产内容',
      onclick: function () {
        editItemOf(release, it);
      },
    }, [
      U.el('span', {
        class: 'mt-1.5 h-2 w-2 shrink-0 rounded-full',
        style: { background: t.color, boxShadow: '0 0 8px ' + U.alpha(t.color, 0.55) },
      }),
      U.el('div', { class: 'min-w-0 flex-1' }, [
        U.el('div', { class: 'truncate text-[12.5px] text-ink', text: it.title }),
        it.note
          ? U.el('div', { class: 'mt-0.5 truncate text-[10.5px] text-mute', text: it.note })
          : null,
      ]),
      U.el('span', {
        class: 'badge shrink-0',
        style: { background: U.alpha(t.color, 0.16), color: t.color },
        text: t.label,
      }),
      U.el('span', {
        class: 'badge shrink-0 bg-raised/60 text-mute',
        text: '👤 ' + (it.dev || '未填写'),
      }),
    ]);
  }

  function versionCard(release) {
    var stt = statusOf(release.status);
    var items = visibleItems(release);
    var card = U.el('div', { class: 'panel overflow-hidden' });

    card.appendChild(
      U.el('div', {
        class: 'flex flex-wrap items-center gap-2.5 border-b border-line/60 bg-raised/30 px-4 py-3',
      }, [
        U.el('span', { class: 'num text-[15px] font-bold text-ink', text: release.version }),
        release.title
          ? U.el('span', { class: 'text-[12px] text-dim', text: release.title })
          : null,
        U.el('span', {
          class: 'badge',
          style: { background: U.alpha(stt.color, 0.16), color: stt.color },
          text: stt.label,
        }),
        U.el('span', { class: 'num text-[11px] text-mute', text: U.friendlyFull(release.date) }),
        release.owner
          ? U.el('span', { class: 'text-[11px] text-mute', text: '负责人 ' + release.owner })
          : null,
        U.el('span', {
          class: 'num rounded-md bg-line/30 px-1.5 text-[10.5px] text-mute',
          text: items.length + ' 条内容',
        }),
        U.el('div', { class: 'flex-1' }),
        U.el('button', {
          class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px]',
          title: '复制为新版本',
          onclick: function () {
            copyRelease(release);
          },
        }, ['⧉']),
        U.el('button', {
          class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px]',
          title: '编辑版本',
          onclick: function () {
            openEditor(release);
          },
        }, ['✎']),
        U.el('button', {
          class: 'btn btn-ghost btn-icon h-7 w-7 text-[11px] text-danger',
          title: '删除版本',
          onclick: function () {
            removeRelease(release);
          },
        }, ['🗑']),
      ])
    );

    var body = U.el('div', { class: 'space-y-3 px-4 py-3' });

    if (release.note) {
      body.appendChild(
        U.el('div', {
          class: 'rounded-lg border border-line/50 bg-raised/25 px-3 py-2 text-[11.5px] leading-relaxed text-dim',
          text: release.note,
        })
      );
    }

    if (!items.length) {
      body.appendChild(
        U.el('div', {
          class: 'py-4 text-center text-[12px] text-mute',
          text: '没有符合当前筛选条件的投产内容',
        })
      );
    } else {
      Store.dict('releaseType').forEach(function (t) {
        var group = items.filter(function (it) {
          return it.type === t.key;
        });
        if (!group.length) return;
        body.appendChild(
          U.el('div', { class: 'flex items-center gap-1.5' }, [
            U.el('span', { class: 'text-[12px]', text: t.icon }),
            U.el('span', { class: 'kicker', text: t.label }),
            U.el('span', {
              class: 'num rounded-md bg-line/30 px-1.5 text-[10px] text-mute',
              text: String(group.length),
            }),
          ])
        );
        group.forEach(function (it) {
          body.appendChild(itemRow(release, it));
        });
      });
    }

    body.appendChild(
      U.el('button', {
        class: 'btn w-full border-dashed text-[11.5px]',
        onclick: function () {
          addItemTo(release);
        },
      }, ['＋ 添加投产内容'])
    );

    card.appendChild(body);
    return card;
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

  function render(root) {
    var st = Store.releaseStats();
    var list = allReleases().slice().sort(cmpVersionDesc);
    var shown = list.filter(matchRelease);

    /* ---- 工具条 ---- */
    var toolbar = U.el('div', { class: 'flex flex-wrap items-center gap-2' });

    var stSel = U.el('select', {
      class: 'input h-[30px] w-auto py-0 text-[12px]',
      onchange: function (e) {
        filter.status = e.target.value;
        global.OpsDesk.App.render();
      },
    });
    stSel.appendChild(U.el('option', { value: 'all', text: '全部状态', selected: filter.status === 'all' }));
    Store.dict('releaseStatus').forEach(function (d) {
      stSel.appendChild(U.el('option', { value: d.key, text: d.label, selected: filter.status === d.key }));
    });
    toolbar.appendChild(stSel);

    var typeSel = U.el('select', {
      class: 'input h-[30px] w-auto py-0 text-[12px]',
      onchange: function (e) {
        filter.type = e.target.value;
        global.OpsDesk.App.render();
      },
    });
    typeSel.appendChild(U.el('option', { value: 'all', text: '全部类型', selected: filter.type === 'all' }));
    Store.dict('releaseType').forEach(function (d) {
      typeSel.appendChild(
        U.el('option', { value: d.key, text: d.icon + ' ' + d.label, selected: filter.type === d.key })
      );
    });
    toolbar.appendChild(typeSel);

    toolbar.appendChild(
      U.el('input', {
        class: 'input h-[30px] w-[190px] py-0 text-[12px]',
        type: 'search',
        placeholder: '搜索版本号 / 内容 / 开发人…',
        value: filter.keyword,
        oninput: U.debounce(function (e) {
          filter.keyword = e.target.value.trim();
          global.OpsDesk.App.render();
        }, 220),
      })
    );

    toolbar.appendChild(U.el('div', { class: 'flex-1' }));
    toolbar.appendChild(
      U.el('button', {
        class: 'btn btn-primary',
        onclick: function () {
          openEditor(null);
        },
      }, ['＋ 新建版本'])
    );

    /* ---- 统计条 ---- */
    var statStrip = U.el('div', { class: 'grid grid-cols-2 gap-3 sm:grid-cols-4' }, [
      miniStat('版本总数', st.total, '个', 'var(--c-brand)'),
      miniStat('已上线', st.released, '个', 'var(--c-ok)'),
      miniStat('待上线', st.planned, '个', 'var(--c-warn)'),
      miniStat('投产条目', st.items, '条', 'var(--c-violet)'),
    ]);

    /* ---- 分布面板 ---- */
    var distPanel = U.el('div', { class: 'panel' });
    distPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '投产内容分布' }),
        U.el('div', { class: 'text-[11px] text-mute', text: '按内容类型与开发人统计' }),
      ])
    );
    var distBody = U.el('div', { class: 'space-y-4 px-4 py-3' });
    distBody.appendChild(
      U.el('div', {}, [
        U.el('div', { class: 'kicker mb-2', text: '按内容类型' }),
        UI.bars(
          st.byType.map(function (b) {
            return { label: b.icon + ' ' + b.label, value: b.count, color: b.color };
          })
        ),
      ])
    );
    if (st.byDev.length) {
      distBody.appendChild(
        U.el('div', {}, [
          U.el('div', { class: 'kicker mb-2', text: '按开发人' }),
          U.el('div', { class: 'space-y-1.5' }, st.byDev.slice(0, 8).map(function (d) {
            return U.el('div', {
              class: 'flex items-center justify-between gap-2 rounded-lg border border-line/50 bg-raised/30 px-2.5 py-1.5 text-[11.5px]',
            }, [
              U.el('span', { class: 'truncate text-dim', text: d.name }),
              U.el('span', { class: 'num text-mute', text: d.count + ' 条' }),
            ]);
          })),
        ])
      );
    }
    distPanel.appendChild(distBody);

    /* ---- 版本列表 ---- */
    var listPanel = U.el('div', { class: 'panel' });
    listPanel.appendChild(
      U.el('div', { class: 'panel-head' }, [
        U.el('div', { class: 'panel-title', text: '版本台账' }),
        U.el('div', { class: 'flex items-center gap-2 text-[11px] text-mute' }, [
          U.el('span', { text: shown.length + ' / ' + list.length + ' 个版本' }),
          filter.status !== 'all' || filter.type !== 'all' || filter.keyword
            ? U.el('button', {
                class: 'chip chip-active',
                onclick: function () {
                  filter.status = 'all';
                  filter.type = 'all';
                  filter.keyword = '';
                  global.OpsDesk.App.render();
                },
              }, ['清除筛选'])
            : null,
        ]),
      ])
    );

    var listBody = U.el('div', { class: 'space-y-3 px-4 py-3' });
    if (!shown.length) {
      listBody.appendChild(
        U.el('div', { class: 'flex flex-col items-center justify-center gap-2 py-10 text-center' }, [
          U.el('div', { class: 'text-2xl opacity-40', text: list.length ? '🔍' : '📦' }),
          U.el('div', {
            class: 'text-[13px] text-mute',
            text: list.length ? '当前筛选条件下没有匹配的版本' : '还没有版本记录',
          }),
          list.length
            ? U.el('button', {
                class: 'btn mt-1',
                onclick: function () {
                  filter.status = 'all';
                  filter.type = 'all';
                  filter.keyword = '';
                  global.OpsDesk.App.render();
                },
              }, ['清除筛选条件'])
            : U.el('button', {
                class: 'btn btn-primary mt-1',
                onclick: function () {
                  openEditor(null);
                },
              }, ['＋ 新建版本']),
        ])
      );
    } else {
      shown.forEach(function (r) {
        listBody.appendChild(versionCard(r));
      });
    }
    listPanel.appendChild(listBody);

    root.innerHTML = '';
    root.appendChild(
      U.el('div', { class: 'space-y-4 animate-fade-up' }, [
        U.el('div', { class: 'flex flex-wrap items-center gap-2' }, [
          U.el('div', {}, [
            U.el('h2', { class: 'text-[15px] font-bold text-ink', text: '版本投产' }),
            U.el('div', {
              class: 'mt-0.5 text-[11.5px] text-mute',
              text: '按版本归档上线内容 · 业务需求 / 技术优化 / 缺陷修复分类 · 记录对应开发人',
            }),
          ]),
        ]),
        statStrip,
        toolbar,
        U.el('div', { class: 'auto-cols auto-cols-wide' }, [
          U.el('div', { class: 'space-y-4' }, [listPanel]),
          U.el('div', { class: 'space-y-4' }, [distPanel]),
        ]),
      ])
    );
  }

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Releases = {
    render: render,
    openEditor: openEditor,
    openItemEditor: openItemEditor,
    addItemTo: addItemTo,
    editItemOf: editItemOf,
    copyRelease: copyRelease,
    removeRelease: removeRelease,
    filter: filter,
  };
})(window);
