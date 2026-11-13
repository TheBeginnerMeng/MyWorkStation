/* ============================================================
   store.js — 全局状态中心
   所有视图通过 store.state 读数据，通过 store.mutate 写入
   写入后自动持久化（localStorage + IndexedDB 双写）
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.OpsDesk.Utils;
  var Storage = global.OpsDesk.Storage;
  var Seed = global.OpsDesk.Seed;
  var DICT = global.OpsDesk.DICT;

  var listeners = [];
  var state = null;
  var saveTimer = null;
  var saveStatus = { pending: false, lastSavedAt: 0, error: null };

  /* ---------------- 订阅 ---------------- */

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function emit(reason) {
    listeners.forEach(function (fn) {
      try {
        fn(state, reason);
      } catch (e) {
        console.error('[store] listener error', e);
      }
    });
  }

  /* ---------------- 持久化 ---------------- */

  function persist() {
    saveStatus.pending = true;
    emit('persist:start');
    Storage.save(state).then(function (res) {
      saveStatus.pending = false;
      saveStatus.lastSavedAt = Date.now();
      saveStatus.error = res.error || null;
      emit(res.ok ? 'persist:done' : 'persist:error');
    });
  }

  /** 合并短时间内的多次写入，减少 IO */
  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 120);
  }

  /* ---------------- 初始化 ---------------- */

  /**
   * 启动初始化
   * 重要：**不再自动灌入演示数据**。
   * 以前首次启动（以及每次「读不到本地数据」时）都会灌一套演示记录，
   * 结果和用户自己的真实数据混在一起，还反复出现。
   * 现在没有数据就空白启动，演示数据只能由用户显式点「载入演示数据」。
   */
  function init() {
    return Storage.load().then(function (res) {
      var raw = res.state;
      if (!raw) {
        // 当前存储空间没有数据 → 空白工作台（只留一个默认项目）
        state = Seed.normalize(Seed.blank());
        persist();
        return { state: state, source: res.source, blank: true };
      }
      state = Seed.normalize(raw);
      state.updatedAt = Date.now();
      if (res.source === 'indexedDB') persist();
      return { state: state, source: res.source, blank: false };
    });
  }

  /* ---------------- 演示数据管理 ---------------- */

  /** 当前数据里还有多少演示记录 */
  function demoStats() {
    return Seed.demoCounts(state);
  }

  /**
   * 追加演示数据（体验用）：只新增，不动已有真实数据。
   * 演示项目与用户自己的项目重名时自动加「（示例）」后缀，避免混在一起。
   */
  function appendDemo() {
    var demo = Seed.normalize(Seed.build());
    var added = { projects: 0, tasks: 0, incidents: 0, timeLogs: 0, releases: 0, queries: 0 };
    mutate(function (s) {
      var idTaken = {};
      var nameTaken = {};
      s.projects.forEach(function (p) { idTaken[p.id] = true; nameTaken[p.name] = true; });

      /* 演示项目：冲突就改名，避免和用户自己的同名项目混在一起 */
      var nameMap = {};
      demo.projects.forEach(function (p) {
        var np = {
          id: p.id,
          name: p.name,
          color: p.color,
          flagship: p.flagship,
          desc: p.desc,
          demo: true,
        };
        if (idTaken[np.id] || nameTaken[np.name]) {
          np.id = U.uid('prj');
          np.name = p.name + '（示例）';
        }
        idTaken[np.id] = true;
        nameTaken[np.name] = true;
        nameMap[p.name] = np.id;
        s.projects.push(np);
        added.projects++;
      });

      /* 演示记录：归属改指向上面的演示项目；id 冲突则换新 id */
      var prefix = { tasks: 'tsk', incidents: 'inc', timeLogs: 'tl', releases: 'rel', queries: 'qry' };
      Object.keys(prefix).forEach(function (k) {
        var used = {};
        (s[k] || []).forEach(function (r) { used[r.id] = true; });
        (demo[k] || []).forEach(function (r) {
          if (r.project && nameMap[r.project]) r.project = nameMap[r.project];
          if (used[r.id]) r.id = U.uid(prefix[k]);
          used[r.id] = true;
          r.demo = true;
          s[k].push(r);
          added[k]++;
        });
      });
    }, 'demo:append');
    return added;
  }

  /** 清除全部演示数据，保留真实数据 */
  function purgeDemo() {
    var res = Seed.stripDemo(state);
    mutate(function (s) {
      Object.keys(s).forEach(function (k) { delete s[k]; });
      Object.assign(s, res.state);
      /* 至少保留一个项目，否则各模块无处归属 */
      if (!s.projects.length) {
        var def = Seed.normalize(Seed.blank());
        s.projects = def.projects;
        s.settings.focusProjectId = def.settings.focusProjectId;
      }
    }, 'demo:purge');
    return res.removed;
  }

  /* ---------------- 变更 ---------------- */

  /**
   * 变更状态：mutate(fn, reason) —— fn 直接修改 draft（就地修改）
   */
  function mutate(fn, reason) {
    if (!state) return;
    fn(state);
    state.updatedAt = Date.now();
    persistSoon();
    emit(reason || 'mutate');
  }

  /* ---------------- 查询辅助 ---------------- */

  function projectById(id) {
    return state.projects.filter(function (p) {
      return p.id === id;
    })[0];
  }

  function projectName(id) {
    var p = projectById(id);
    return p ? p.name : '未分配';
  }

  function projectColor(id) {
    var p = projectById(id);
    return p ? p.color : '#64748b';
  }

  function taskById(id) {
    return state.tasks.filter(function (t) {
      return t.id === id;
    })[0];
  }

  function incidentById(id) {
    return state.incidents.filter(function (i) {
      return i.id === id;
    })[0];
  }

  function timeLogById(id) {
    return state.timeLogs.filter(function (l) {
      return l.id === id;
    })[0];
  }

  function releaseById(id) {
    return (state.releases || []).filter(function (r) {
      return r.id === id;
    })[0];
  }

  function queryById(id) {
    return (state.queries || []).filter(function (q) {
      return q.id === id;
    })[0];
  }

  function dict(key) {
    return DICT[key] || [];
  }

  function dictItem(key, val) {
    var list = dict(key);
    for (var i = 0; i < list.length; i++) if (list[i].key === val) return list[i];
    return list[0] || { key: val, label: String(val), color: '#64748b' };
  }

  /* ---------------- 统计 ---------------- */

  function stats() {
    var today = U.today();
    var todayTasks = state.tasks.filter(function (t) {
      return t.date === today;
    });
    var doneTasks = todayTasks.filter(function (t) {
      return t.status === 'done';
    });
    var openIncidents = state.incidents.filter(function (i) {
      return i.status === 'tracking';
    });
    var todayLogs = state.timeLogs.filter(function (l) {
      return l.date === today;
    });
    var minutes = U.sum(todayLogs, function (l) {
      return U.duration(l.startTime, l.endTime);
    });

    return {
      todayTaskTotal: todayTasks.length,
      todayTaskDone: doneTasks.length,
      todayTaskRate: todayTasks.length ? Math.round((doneTasks.length / todayTasks.length) * 100) : 0,
      openIncidents: openIncidents.length,
      totalIncidents: state.incidents.length,
      todayMinutes: minutes,
      focusTasks: state.tasks.filter(function (t) {
        return t.flagship || (t.status === 'doing' && t.priority === 'P0');
      }).length,
      projects: state.projects.length,
    };
  }

  /** 按分类统计某天的时间分配 */
  function categoryStats(date) {
    var day = date || U.today();
    var logs = state.timeLogs.filter(function (l) {
      return l.date === day;
    });
    var buckets = DICT.timeCategory.map(function (c) {
      return { key: c.key, label: c.label, color: c.color, minutes: 0, count: 0 };
    });
    var map = {};
    buckets.forEach(function (b) {
      map[b.key] = b;
    });
    logs.forEach(function (l) {
      var b = map[l.category];
      if (!b) return;
      // 与明细展示共用同一时长口径（含跨天处理）
      b.minutes += U.duration(l.startTime, l.endTime);
      b.count += 1;
    });
    var total = U.sum(buckets, function (b) {
      return b.minutes;
    });
    buckets.forEach(function (b) {
      b.pct = total ? Math.round((b.minutes / total) * 100) : 0;
    });
    return { date: day, total: total, buckets: buckets, logs: logs };
  }

  /* ---------------- 版本投产统计 ---------------- */

  /**
   * 版本投产统计口径：
   *   版本数 / 已上线 / 待上线 / 已回滚 / 投产条目总数
   *   byType —— 按投产内容类型（业务需求 / 技术优化 / 缺陷修复 …）分组计数
   *   byDev  —— 按开发人统计产出条数（降序）
   */
  function releaseStats() {
    var list = state.releases || [];
    var byType = DICT.releaseType.map(function (t) {
      return { key: t.key, label: t.label, icon: t.icon, color: t.color, count: 0 };
    });
    var typeMap = {};
    byType.forEach(function (b) {
      typeMap[b.key] = b;
    });

    var devMap = {};
    var itemCount = 0;

    list.forEach(function (r) {
      (r.items || []).forEach(function (it) {
        itemCount += 1;
        var b = typeMap[it.type];
        if (b) b.count += 1;
        var dev = (it.dev || '').trim();
        if (!dev) return;
        devMap[dev] = (devMap[dev] || 0) + 1;
      });
    });

    var byDev = Object.keys(devMap)
      .map(function (name) {
        return { name: name, count: devMap[name] };
      })
      .sort(function (a, b) {
        return b.count - a.count || a.name.localeCompare(b.name);
      });

    return {
      total: list.length,
      released: list.filter(function (r) {
        return r.status === 'released';
      }).length,
      planned: list.filter(function (r) {
        return r.status === 'planned';
      }).length,
      rolledback: list.filter(function (r) {
        return r.status === 'rolledback';
      }).length,
      items: itemCount,
      byType: byType,
      byDev: byDev,
    };
  }

  /* ---------------- 取数登记统计 ---------------- */

  /**
   * 取数登记统计口径：
   *   total      —— 取数单总数
   *   inProgress —— 进行中（待评估 / 口径已确认 / 开发中）
   *   delivered  —— 已交付（已交付 + 已核对归档）
   *   toCheck    —— 待核对（已交付但尚未与产品核对）
   *   checked    —— 已核对归档
   *   overdue    —— 已过交付期且未归档（需要催办）
   *   byStatus   —— 按状态分组计数
   *   byPriority —— 按优先级分组计数
   */
  function queryStats() {
    var list = state.queries || [];
    var today = U.today();

    var byStatus = DICT.queryStatus.map(function (s) {
      return { key: s.key, label: s.label, badge: s.badge, color: s.color, count: 0 };
    });
    var statusMap = {};
    byStatus.forEach(function (b) {
      statusMap[b.key] = b;
    });

    var byPriority = DICT.queryPriority.map(function (p) {
      return { key: p.key, label: p.label, color: p.color, count: 0 };
    });
    var prioMap = {};
    byPriority.forEach(function (b) {
      prioMap[b.key] = b;
    });

    list.forEach(function (q) {
      var s = statusMap[q.status];
      if (s) s.count += 1;
      var p = prioMap[q.priority];
      if (p) p.count += 1;
    });

    function countIn(keys) {
      return list.filter(function (q) {
        return keys.indexOf(q.status) >= 0;
      }).length;
    }

    var closed = ['checked', 'cancelled'];

    return {
      total: list.length,
      inProgress: countIn(['pending_eval', 'caliber_confirmed', 'developing']),
      delivered: countIn(['delivered', 'checked']),
      toCheck: countIn(['delivered']),
      checked: countIn(['checked']),
      overdue: list.filter(function (q) {
        return q.dueDate && q.dueDate < today && closed.indexOf(q.status) < 0;
      }).length,
      metrics: U.sum(list, function (q) {
        return (q.metrics || []).length;
      }),
      channels: U.sum(list, function (q) {
        return (q.channels || []).length;
      }),
      checks: U.sum(list, function (q) {
        return (q.checks || []).length;
      }),
      caliberChanges: U.sum(list, function (q) {
        return (q.caliberChanges || []).length;
      }),
      byStatus: byStatus,
      byPriority: byPriority,
    };
  }

  /* ---------------- 导出 API ---------------- */

  global.OpsDesk.Store = {
    init: init,
    subscribe: subscribe,
    emit: emit,
    mutate: mutate,
    persist: persist,
    persistSoon: persistSoon,
    appendDemo: appendDemo,
    purgeDemo: purgeDemo,
    demoStats: demoStats,
    get state() {
      return state;
    },
    get saveStatus() {
      return saveStatus;
    },
    projectById: projectById,
    projectName: projectName,
    projectColor: projectColor,
    taskById: taskById,
    incidentById: incidentById,
    timeLogById: timeLogById,
    releaseById: releaseById,
    queryById: queryById,
    dict: dict,
    dictItem: dictItem,
    stats: stats,
    categoryStats: categoryStats,
    releaseStats: releaseStats,
    queryStats: queryStats,
  };
})(window);
