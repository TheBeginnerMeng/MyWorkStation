/* ============================================================
   storage.js — 持久化适配器
   策略：localStorage 作为主存储（同步、快、简单）
        IndexedDB 作为镜像备份（容量大、可存 Blob）
        启动时二者取「更新时间较新」的一份，并立即互相回填
   ============================================================ */
(function (global) {
  'use strict';

  var NS = 'opsdesk';
  var LS_KEY = NS + ':state:v1';
  var LS_META = NS + ':meta:v1';
  var IDB_NAME = NS + '-db';
  var IDB_STORE = 'kv';
  var IDB_KEY = 'state';

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

  function lsGet(key) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch (e) {
      return null;
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
     * 读取状态。返回 { state, source, updatedAt }
     * 同步读取 localStorage，异步比對 IndexedDB 镜像。
     */
    load: function () {
      var lsState = lsGet(LS_KEY);
      var meta = lsGet(LS_META) || {};
      /* 时间戳兜底：meta 被单独清掉时，用状态自带的 updatedAt 兜底，
         否则会拿「旧的 IDB 副本」盖掉「新的 localStorage 数据」 */
      var lsUpdated = lsState && lsState.updatedAt ? lsState.updatedAt : 0;
      var result = {
        state: lsState,
        source: lsState ? 'localStorage' : 'none',
        updatedAt: Math.max(meta.updatedAt || 0, lsUpdated),
        idbChecked: false,
      };

      return idbGet(IDB_KEY).then(function (rec) {
        result.idbChecked = true;
        if (!rec) return result;

        var idbState = rec.state;
        var idbUpdated = rec.updatedAt || 0;

        if (!result.state) {
          // 本地无数据 —— 直接用 IDB 恢复
          result.state = idbState;
          result.source = 'indexedDB';
          result.updatedAt = idbUpdated;
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
     * 写入状态（双写）。返回 Promise<{ok, ls, idb}>
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
        return { ok: lsOk || idbOk, ls: lsOk, idb: idbOk, error: lsErr, updatedAt: updatedAt };
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

  global.OpsDesk = global.OpsDesk || {};
  global.OpsDesk.Storage = Storage;
})(window);
