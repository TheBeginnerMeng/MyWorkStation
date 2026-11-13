/* ============================================================
   storage.js — 持久化适配器
   策略：localStorage 作为主存储（同步、快、简单）
        IndexedDB 作为镜像备份（容量大、可存 Blob）
        启动时二者取「更新时间较新」的一份，并立即互相回填
        文件级备份（opsdesk-data.json，与程序同目录）作为跨设备/跨空间的最后保险
   ============================================================ */
(function (global) {
  'use strict';

  var NS = 'opsdesk';
  var LS_KEY = NS + ':state:v1';
  var LS_META = NS + ':meta:v1';
  var LS_CORRUPT = NS + ':corrupt:v1';
  var IDB_NAME = NS + '-db';
  var IDB_STORE = 'kv';
  var IDB_KEY = 'state';
  var FILE_API = '/__opsdesk/backup';

  /* ---------------- IndexedDB helpers ---------------- */

  var idbPromise = null;

  function openIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve) {
      var idb = global.indexedDB;
      if (!idb) return resolve(null);
      var req;
      try {
        req = idb.open(IDB_NAME, 1);
      } catch (e) {
        return resolve(null);
      }
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function (e) {
        var db = e.target.result;
        db.onversionchange = function () {
          db.close();
          idbPromise = null;
        };
        resolve(db);
      };
      req.onerror = function () {
        resolve(null);
      };
      req.onblocked = function () {
        resolve(null);
      };
    });
    return idbPromise;
  }

  function idbGet(key) {
    return openIDB().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(IDB_STORE, 'readonly');
          var req = tx.objectStore(IDB_STORE).get(key);
          req.onsuccess = function () {
            resolve(req.result == null ? null : req.result);
          };
          req.onerror = function () {
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  function idbSet(key, value) {
    return openIDB().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(value, key);
          tx.oncomplete = function () {
            resolve(true);
          };
          tx.onerror = function () {
            resolve(false);
          };
          tx.onabort = function () {
            resolve(false);
          };
        } catch (e) {
          resolve(false);
        }
      });
    });
  }

  function idbDelete(key) {
    return openIDB().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).delete(key);
          tx.oncomplete = function () {
            resolve(true);
          };
          tx.onerror = function () {
            resolve(false);
          };
        } catch (e) {
          resolve(false);
        }
      });
    });
  }

  /* ---------------- localStorage helpers ---------------- */

  /** 统计一个状态里的业务记录条数（用于诊断展示） */
  function countRecords(state) {
    if (!state || typeof state !== 'object') return 0;
    var keys = ['projects', 'tasks', 'incidents', 'timeLogs', 'releases', 'queries'];
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(state[keys[i]])) n += state[keys[i]].length;
    }
    return n;
  }

  function lsGet(key) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * 区分「键不存在」与「键存在但内容解析失败」。
   *
   * 这一步很关键：以前两者都返回 null，导致「数据被写坏」和「首次使用」
   * 无法分辨，旧版会在这种情况下重新灌入演示数据并覆盖真实数据 ——
   * 这正是用户重启后数据变成测试数据的根因之一。
   */
  function lsRead(key) {
    var raw = null;
    try {
      raw = global.localStorage.getItem(key);
    } catch (e) {
      return { present: false, value: null, corrupted: false, raw: null, error: e };
    }
    if (raw == null) return { present: false, value: null, corrupted: false, raw: null, error: null };
    try {
      return { present: true, value: JSON.parse(raw), corrupted: false, raw: raw, error: null };
    } catch (e) {
      return { present: true, value: null, corrupted: true, raw: raw, error: e };
    }
  }

  function lsSet(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // 配额溢出等异常：不静默吞掉，交给上层提示
      throw e;
    }
  }

  /* ---------------- Public API ---------------- */

  var Storage = {
    NS: NS,
    lastError: null,

    /**
     * 读取状态。返回 { state, source, updatedAt, diagnostics }
     *
     * diagnostics 用于回答「我的数据去哪了 / 会不会丢」：
     *   localPresent / localCorrupted / localRecords
     *   idbAvailable / idbHasCopy / idbRecords
     *   updatedAt 两侧时间戳对比、corruptSaved（损坏原文是否已抢救留存）
     */
    load: function () {
      var ls = lsRead(LS_KEY);
      var meta = lsGet(LS_META) || {};
      var lsState = ls.value;
      /* 时间戳兜底：meta 被单独清掉时，用状态自带的 updatedAt 兜底，
         否则会拿「旧的 IDB 副本」盖掉「新的 localStorage 数据」 */
      var lsUpdated = lsState && lsState.updatedAt ? lsState.updatedAt : 0;
      var diagnostics = {
        localPresent: ls.present,
        localCorrupted: ls.corrupted,
        localRecords: lsState ? countRecords(lsState) : 0,
        idbAvailable: false,
        idbHasCopy: false,
        idbRecords: 0,
        updatedAtLocal: lsUpdated,
        updatedAtIdb: 0,
        corruptSaved: false,
        source: lsState ? 'localStorage' : 'none',
      };

      /* 关键：数据存在但解析失败时，绝不能当成「首次使用」，
         先把损坏原文另存一份，别让下一次启动把它彻底冲掉 */
      if (ls.corrupted) {
        try {
          global.localStorage.setItem(LS_CORRUPT, JSON.stringify({
            savedAt: new Date().toISOString(),
            reason: String(ls.error && ls.error.message ? ls.error.message : ls.error),
            raw: ls.raw,
          }));
          diagnostics.corruptSaved = true;
        } catch (e) {
          /* ignore */
        }
      }

      var result = {
        state: lsState,
        source: diagnostics.source,
        updatedAt: Math.max(meta.updatedAt || 0, lsUpdated),
        idbChecked: false,
        diagnostics: diagnostics,
      };

      return idbGet(IDB_KEY).then(function (rec) {
        result.idbChecked = true;
        diagnostics.idbAvailable = true;
        if (!rec) return result;

        var idbState = rec.state;
        var idbUpdated = rec.updatedAt || 0;
        diagnostics.idbHasCopy = !!idbState;
        diagnostics.idbRecords = idbState ? countRecords(idbState) : 0;
        diagnostics.updatedAtIdb = idbUpdated;

        if (!result.state) {
          // 本地无数据 —— 直接用 IDB 恢复
          result.state = idbState;
          result.source = 'indexedDB';
          result.updatedAt = idbUpdated;
          diagnostics.source = 'indexedDB';
          if (idbState) {
            try {
              lsSet(LS_KEY, idbState);
              lsSet(LS_META, { updatedAt: idbUpdated });
            } catch (e) {
              /* ignore */
            }
          }
          return result;
        }

        // 两边都有 —— 取更新时间新的一份，并回填较旧的一侧
        if (idbUpdated > result.updatedAt) {
          result.state = idbState;
          result.source = 'indexedDB';
          result.updatedAt = idbUpdated;
          diagnostics.source = 'indexedDB';
          try {
            lsSet(LS_KEY, idbState);
            lsSet(LS_META, { updatedAt: idbUpdated });
          } catch (e) {
            /* ignore */
          }
        } else if (result.updatedAt > idbUpdated && idbUpdated > 0) {
          // 本地更新，回填 IDB
          idbSet(IDB_KEY, { state: result.state, updatedAt: result.updatedAt });
        }
        return result;
      });
    },

    /**
     * 写入状态（双写）。返回 Promise<{ok, ls, idb, degraded, error, updatedAt}>
     *
     * degraded=true 表示只写进了一侧 —— 数据还在，但需要提醒用户
     * （例如浏览器禁用了 localStorage，就只剩 IndexedDB 一份）
     */
    save: function (state) {
      var updatedAt = Date.now();
      var lsOk = false;
      var lsErr = null;

      try {
        lsSet(LS_KEY, state);
        lsSet(LS_META, { updatedAt: updatedAt });
        lsOk = true;
      } catch (e) {
        lsErr = e;
        this.lastError = e;
      }

      return idbSet(IDB_KEY, { state: state, updatedAt: updatedAt }).then(function (idbOk) {
        return {
          ok: lsOk || idbOk,
          ls: lsOk,
          idb: idbOk,
          degraded: lsOk !== idbOk,
          error: lsErr,
          updatedAt: updatedAt,
        };
      });
    },

    /** 清空所有本地数据 */
    clear: function () {
      try {
        global.localStorage.removeItem(LS_KEY);
        global.localStorage.removeItem(LS_META);
      } catch (e) {
        /* ignore */
      }
      return idbDelete(IDB_KEY);
    },

    /** 导出为 JSON 文本 */
    exportJSON: function (state) {
      return JSON.stringify(
        { app: NS, version: 1, exportedAt: new Date().toISOString(), state: state },
        null,
        2
      );
    },

    /** 解析导入的 JSON */
    importJSON: function (text) {
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('文件格式无效');
      }
      var state = parsed.state && typeof parsed.state === 'object' && !Array.isArray(parsed.state) ? parsed.state : parsed;
      if (!state || typeof state !== 'object' || Array.isArray(state)) {
        throw new Error('文件中未找到可用的状态数据');
      }
      // 状态必须至少具备一个可识别的业务字段，否则视为无效备份
      var hasKnownField = ['tasks', 'incidents', 'timeLogs', 'projects', 'releases', 'queries', 'settings'].some(function (k) {
        return Object.prototype.hasOwnProperty.call(state, k);
      });
      if (!hasKnownField) {
        throw new Error('文件中未找到可用的状态数据');
      }
      return state;
    },

    /** 存储占用估算 */
    usage: function () {
      var bytes = 0;
      try {
        var raw = global.localStorage.getItem(LS_KEY) || '';
        bytes = new Blob([raw]).size;
      } catch (e) {
        bytes = 0;
      }
      return { bytes: bytes, kb: Math.round((bytes / 1024) * 10) / 10 };
    },

    /**
     * 存储可用性自检
     * 用于回答两个问题：数据到底存在哪个空间？这次到底能不能存住？
     */
    probe: function () {
      var ls = false;
      try {
        var k = NS + ':probe:v1';
        global.localStorage.setItem(k, '1');
        global.localStorage.removeItem(k);
        ls = true;
      } catch (e) {
        ls = false;
      }
      var idb = false;
      try {
        idb = !!global.indexedDB;
      } catch (e) {
        idb = false;
      }
      var origin = '';
      try {
        origin = global.location && global.location.origin ? global.location.origin : '';
      } catch (e) {
        origin = '';
      }
      return { localStorage: ls, indexedDB: idb, origin: origin };
    },
  };

  /* ============================================================
     文件级备份（与程序同目录的 opsdesk-data.json）
     ------------------------------------------------------------
     为什么需要它：浏览器存储是「按 origin 隔离」的，换电脑、换端口、
     换目录、换浏览器、清理站点数据 —— 任何一样发生，数据就"不见了"。
     把数据另存一份到程序文件夹里，等于给数据上了第三道保险：
       · 换电脑只要拷贝整个文件夹，数据跟着走
       · 浏览器存储被清、损坏，自动从文件恢复
       · 文件模式打开（file://）时自动降级，不影响正常使用
     ============================================================ */
  var FileBackup = {
    supported: (function () {
      try {
        return !!(global.fetch && global.location && global.location.protocol &&
          global.location.protocol.indexOf('http') === 0);
      } catch (e) {
        return false;
      }
    })(),

    /** 读取目录备份文件；没有则返回 null */
    load: function () {
      if (!FileBackup.supported) return Promise.resolve(null);
      return fetch(FILE_API, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) return null;
          return r.json();
        })
        .then(function (res) {
          if (!res || !res.ok || typeof res.content !== 'string') return null;
          var parsed;
          try {
            parsed = JSON.parse(res.content);
          } catch (e) {
            return null;
          }
          var state = parsed && parsed.state && typeof parsed.state === 'object' ? parsed.state : parsed;
          if (!state || typeof state !== 'object') return null;
          return { state: state, mtime: res.mtime || 0, bytes: (res.content || '').length };
        })
        .catch(function () {
          return null;
        });
    },

    /** 把状态写回目录备份文件 */
    save: function (state) {
      if (!FileBackup.supported) return Promise.resolve({ ok: false, unsupported: true });
      var body = Storage.exportJSON(state);
      return fetch(FILE_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: body,
        keepalive: true,
      })
        .then(function (r) {
          return r.ok;
        })
        .catch(function () {
          return false;
        });
    },
  };

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Storage = Storage;
  global.OpsDesk.FileBackup = FileBackup;
})(window);
