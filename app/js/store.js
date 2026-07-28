/* Iron Log - 永続化とCRUD */
(function (global) {
  'use strict';

  var KEY = 'ironlog.v1';
  var SCHEMA_VERSION = 4;

  function todayStr(d) {
    var t = d || new Date();
    var m = String(t.getMonth() + 1).padStart(2, '0');
    var day = String(t.getDate()).padStart(2, '0');
    return t.getFullYear() + '-' + m + '-' + day;
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function defaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      settings: {
        theme: 'auto',
        restSeconds: 90,
        sound: true,
        // 原則2により既定はオフ。オンにした利用者のみ自動起動する
        autoRest: false
      },
      exercises: JSON.parse(JSON.stringify(global.ILData.PRESET_EXERCISES)),
      routines: JSON.parse(JSON.stringify(global.ILData.PRESET_ROUTINES)),
      mysets: [],
      sessions: [],
      bodyLogs: [],
      meta: { lastExportedAt: null, createdAt: new Date().toISOString() }
    };
  }

  /*
   * 旧バージョンのデータを現行スキーマへ引き上げる。
   * schemaVersion を上げる際は、ここに段階的な変換を追加していく。
   */
  function migrate(raw) {
    var s = raw;
    if (!s || typeof s !== 'object') return defaultState();
    if (!s.schemaVersion) s.schemaVersion = 1;

    // 欠損フィールドの補完（手編集されたJSONのインポートにも耐えるようにする）
    var base = defaultState();
    s.settings = Object.assign({}, base.settings, s.settings || {});
    s.meta = Object.assign({}, base.meta, s.meta || {});
    if (!Array.isArray(s.exercises) || !s.exercises.length) s.exercises = base.exercises;
    if (!Array.isArray(s.routines)) s.routines = base.routines;
    if (!Array.isArray(s.mysets)) s.mysets = [];
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (!Array.isArray(s.bodyLogs)) s.bodyLogs = [];

    s.exercises.forEach(function (e) {
      if (!e.type) e.type = 'weight_reps';
      if (typeof e.archived !== 'boolean') e.archived = false;
    });

    /*
     * v1 → v2: 器具（equip）の軸を追加した。
     * 既存の種目には初期プリセットから器具を補い、
     * v2 で新しく増えたプリセット種目（自重スクワットなど）を取り込む。
     * この取り込みは一度きりにして、利用者が消した種目が毎回復活しないようにする。
     */
    if (s.schemaVersion < 2) {
      var presetById = {};
      base.exercises.forEach(function (p) { presetById[p.id] = p; });

      var have = {};
      s.exercises.forEach(function (e) {
        have[e.id] = true;
        if (!e.equip) e.equip = presetById[e.id] ? presetById[e.id].equip : 'other';
      });

      base.exercises.forEach(function (p) {
        if (!have[p.id]) s.exercises.push(p);
      });
    }

    /*
     * v2 → v3: 休憩タイマーの自動起動を既定オフに変えた。
     * 既定値を変えるだけでは、すでに true が保存されている利用者には届かないため、
     * 移行時に明示的に false へ落とす。オンにしたい利用者は設定から入れ直す。
     * あわせて、どこからも参照されていない unit を取り除く。
     */
    if (s.schemaVersion < 3) {
      s.settings.autoRest = false;
      delete s.settings.unit;
    }

    /*
     * v3 → v4: ルーティンが種目の並びだけを持つ形から、
     * 種目ごとにセット数・回数・重量を持つ形（items）に変わった。
     * 旧形式は値を持たないため null で埋め、展開時に前回値へ委ねる。
     */
    if (s.schemaVersion < 4) {
      s.routines.forEach(function (r) {
        if (Array.isArray(r.items)) return;
        r.items = (r.exerciseIds || []).map(function (id) {
          return { exerciseId: id, sets: null, reps: null, weight: null };
        });
        delete r.exerciseIds;
      });
    }

    // 旧形式のルーティンが手編集で混ざった場合の保険
    s.routines.forEach(function (r) {
      if (!Array.isArray(r.items)) {
        r.items = (r.exerciseIds || []).map(function (id) {
          return { exerciseId: id, sets: null, reps: null, weight: null };
        });
      }
    });

    // 手編集されたJSONの取り込みなど、上記を通らない経路の保険
    s.exercises.forEach(function (e) {
      if (!e.equip) e.equip = 'other';
    });
    s.sessions.forEach(function (ss) {
      if (!Array.isArray(ss.entries)) ss.entries = [];
      ss.entries.forEach(function (en) {
        if (!Array.isArray(en.sets)) en.sets = [];
        en.sets.forEach(function (st) {
          if (typeof st.done !== 'boolean') st.done = false;
          if (typeof st.warmup !== 'boolean') st.warmup = false;
        });
      });
    });

    s.schemaVersion = SCHEMA_VERSION;
    return s;
  }

  var state = null;
  var saveTimer = null;
  var listeners = [];

  function load() {
    var raw = null;
    try {
      raw = JSON.parse(global.localStorage.getItem(KEY));
    } catch (e) {
      raw = null;
    }
    var wasVersion = raw && raw.schemaVersion;
    state = raw ? migrate(raw) : defaultState();

    // 移行結果は即座に書き戻す。
    // 書き戻さないと毎回の起動で移行が走り、一度きりのはずの
    // プリセット取り込みが繰り返されてしまう。
    if (raw && wasVersion !== SCHEMA_VERSION) saveNow();

    return state;
  }

  function saveNow() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      // 容量超過などで保存できなかった場合は呼び出し側に伝える
      listeners.forEach(function (fn) { fn('save-error', e); });
      return false;
    }
  }

  // 入力のたびに書き込むと重いのでデバウンスする
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveNow();
    }, 250);
  }

  /*
   * 保存待ちがある場合だけ、即座に書き込む。
   *
   * 画面を離れるときに無条件で saveNow を呼ぶと、何も操作していないタブが
   * 起動時に読んだ内容を書き戻し、別のタブが保存した記録を消してしまう。
   * 「自分が変更を持っているときだけ書く」ことで、放置タブを無害にする。
   */
  function flush() {
    if (!saveTimer) return false;
    clearTimeout(saveTimer);
    saveTimer = null;
    return saveNow();
  }

  function get() {
    return state;
  }

  // --- 種目 ---------------------------------------------------------------

  function exerciseById(id) {
    for (var i = 0; i < state.exercises.length; i++) {
      if (state.exercises[i].id === id) return state.exercises[i];
    }
    return null;
  }

  function exerciseName(id) {
    var e = exerciseById(id);
    return e ? e.name : '削除された種目';
  }

  function addExercise(name, category, type, equip) {
    var e = {
      id: uid('ex'),
      name: name,
      category: category,
      type: type || 'weight_reps',
      equip: equip || 'other',
      archived: false,
      custom: true
    };
    state.exercises.push(e);
    save();
    return e;
  }

  function updateExercise(id, patch) {
    var e = exerciseById(id);
    if (!e) return null;
    Object.assign(e, patch);
    save();
    return e;
  }

  // 使用実績がある種目は論理削除にとどめ、過去記録の表示を壊さない
  function removeExercise(id) {
    var used = state.sessions.some(function (s) {
      return s.entries.some(function (en) { return en.exerciseId === id; });
    });
    /*
     * 削除・非表示のどちらの経路でも、ルーティン項目とマイセットからは外す。
     * 選べない種目がルーティン経由だけで増えると説明がつかないため。
     * 過去の記録は種目名を引けるので、参照整合性は壊れない。
     */
    state.routines.forEach(function (r) {
      r.items = r.items.filter(function (x) { return x.exerciseId !== id; });
    });
    state.mysets = state.mysets.filter(function (m) { return m.exerciseId !== id; });

    if (used) {
      updateExercise(id, { archived: true });
      return 'archived';
    }
    state.exercises = state.exercises.filter(function (e) { return e.id !== id; });
    save();
    return 'deleted';
  }

  // --- セッション ---------------------------------------------------------

  function sessionByDate(date) {
    for (var i = 0; i < state.sessions.length; i++) {
      if (state.sessions[i].date === date) return state.sessions[i];
    }
    return null;
  }

  function ensureSession(date) {
    var s = sessionByDate(date);
    if (s) return s;
    s = { id: uid('se'), date: date, memo: '', condition: 0, entries: [] };
    state.sessions.push(s);
    state.sessions.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    save();
    return s;
  }

  // 種目が空のセッションは残さない（カレンダーに空の実施日を出さないため）
  function pruneSession(date) {
    var s = sessionByDate(date);
    if (!s) return;
    if (s.entries.length === 0 && !s.memo && !s.condition) {
      state.sessions = state.sessions.filter(function (x) { return x.id !== s.id; });
      save();
    }
  }

  function removeSession(id) {
    state.sessions = state.sessions.filter(function (s) { return s.id !== id; });
    save();
  }

  function addEntry(date, exerciseId) {
    var s = ensureSession(date);
    var exists = s.entries.some(function (en) { return en.exerciseId === exerciseId; });
    if (exists) return s;
    var prev = lastPerformance(exerciseId, date);
    var seed = prev && prev.sets.length ? prev.sets[0] : null;
    s.entries.push({
      exerciseId: exerciseId,
      sets: [{
        weight: seed ? seed.weight : null,
        reps: seed ? seed.reps : null,
        rpe: null,
        done: false,
        warmup: false
      }]
    });
    save();
    return s;
  }

  function removeEntry(date, exerciseId) {
    var s = sessionByDate(date);
    if (!s) return;
    s.entries = s.entries.filter(function (en) { return en.exerciseId !== exerciseId; });
    save();
    pruneSession(date);
  }

  function moveEntry(date, exerciseId, delta) {
    var s = sessionByDate(date);
    if (!s) return;
    var i = s.entries.findIndex(function (en) { return en.exerciseId === exerciseId; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= s.entries.length) return;
    var tmp = s.entries[i];
    s.entries[i] = s.entries[j];
    s.entries[j] = tmp;
    save();
  }

  function entryOf(date, exerciseId) {
    var s = sessionByDate(date);
    if (!s) return null;
    for (var i = 0; i < s.entries.length; i++) {
      if (s.entries[i].exerciseId === exerciseId) return s.entries[i];
    }
    return null;
  }

  /*
   * セット数・回数・重量を指定して種目を追加する。
   * すでにその種目がある場合は、末尾にセット行を足す。
   */
  function addEntryWithSets(date, exerciseId, setCount, reps, weight) {
    var s = ensureSession(date);
    var en = entryOf(date, exerciseId);
    if (!en) {
      en = { exerciseId: exerciseId, sets: [] };
      s.entries.push(en);
    }
    var n = Math.max(1, Math.min(12, Math.round(Number(setCount) || 1)));
    for (var i = 0; i < n; i++) {
      en.sets.push({
        weight: weight == null ? null : weight,
        reps: reps == null ? null : reps,
        rpe: null,
        done: false,
        warmup: false
      });
    }
    save();
    return en;
  }

  // 取り消し用に、その日のセッションを丸ごと複製して保持する
  function snapshotSession(date) {
    var s = sessionByDate(date);
    return { date: date, data: s ? JSON.parse(JSON.stringify(s)) : null };
  }

  function restoreSession(snap) {
    if (!snap) return;
    state.sessions = state.sessions.filter(function (s) { return s.date !== snap.date; });
    if (snap.data) {
      state.sessions.push(snap.data);
      state.sessions.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    }
    save();
  }

  function addSet(date, exerciseId) {
    var en = entryOf(date, exerciseId);
    if (!en) return;
    var last = en.sets[en.sets.length - 1];
    en.sets.push({
      weight: last ? last.weight : null,
      reps: last ? last.reps : null,
      rpe: last ? last.rpe : null,
      done: false,
      warmup: false
    });
    save();
  }

  function removeSet(date, exerciseId, index) {
    var en = entryOf(date, exerciseId);
    if (!en) return;
    en.sets.splice(index, 1);
    // セットが1行も無い種目は残さない（サマリーの種目数が実態とずれるため）
    if (en.sets.length === 0) {
      removeEntry(date, exerciseId);
      return;
    }
    save();
  }

  function updateSet(date, exerciseId, index, patch) {
    var en = entryOf(date, exerciseId);
    if (!en || !en.sets[index]) return;
    Object.assign(en.sets[index], patch);
    save();
  }

  /*
   * 指定日より前で、その種目を最後に行ったセッションを返す。
   * 記録画面に「前回」を出すために使う。
   */
  function lastPerformance(exerciseId, beforeDate, workingOnly) {
    var found = null;
    for (var i = 0; i < state.sessions.length; i++) {
      var s = state.sessions[i];
      if (beforeDate && s.date >= beforeDate) continue;
      for (var j = 0; j < s.entries.length; j++) {
        if (s.entries[j].exerciseId !== exerciseId) continue;
        var done = s.entries[j].sets.filter(function (st) {
          return st.done && (!workingOnly || !st.warmup);
        });
        if (!done.length) continue;
        if (!found || s.date > found.date) found = { date: s.date, sets: done };
      }
    }
    return found;
  }

  // --- ルーティン ---------------------------------------------------------

  function addRoutine(name, items) {
    var r = { id: uid('rt'), name: name, items: items || [] };
    state.routines.push(r);
    save();
    return r;
  }

  function updateRoutine(id, patch) {
    var r = state.routines.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    Object.assign(r, patch);
    save();
  }

  function removeRoutine(id) {
    state.routines = state.routines.filter(function (r) { return r.id !== id; });
    save();
  }

  /*
   * ルーティンを展開する。
   * 値を持たない項目（旧形式から移行したものなど）は前回の本番セットに従い、
   * 前回も無ければ 3セット×10回 とする。
   */
  function applyRoutine(date, routineId) {
    var r = state.routines.filter(function (x) { return x.id === routineId; })[0];
    if (!r) return { added: 0, skipped: 0 };

    var added = 0;
    var skipped = 0;
    r.items.forEach(function (it) {
      var ex = exerciseById(it.exerciseId);
      // 非表示にした種目は、ルーティン経由でも復活させない
      if (!ex || ex.archived) { skipped++; return; }
      // すでにその種目がある場合は足さない。連打で倍に増えるのを防ぐ
      if (entryOf(date, it.exerciseId)) { skipped++; return; }

      // 値は項目ごとではなく値ごとに解決する。
      // セット数と回数は固定で重量だけ前回に委ねる、という指定を成立させるため
      var needPrev = it.sets == null || it.reps == null || it.weight == null;
      var prev = needPrev ? lastPerformance(it.exerciseId, date, true) : null;
      var seed = prev && prev.sets.length ? prev.sets[0] : null;

      var sets = it.sets != null ? it.sets : (prev ? prev.sets.length : 3);
      var reps = it.reps != null ? it.reps : (seed ? seed.reps : 10);
      var weight = it.weight != null ? it.weight : (seed ? seed.weight : null);
      addEntryWithSets(date, it.exerciseId, sets, reps, weight);
      added++;
    });
    return { added: added, skipped: skipped };
  }

  /*
   * その日の記録から、ルーティン／マイセットに使える構成を取り出す。
   * セット数は本番セットの数、回数と重量は最初の本番セットの値を使う。
   */
  function entryConfig(entry) {
    var work = entry.sets.filter(function (st) { return !st.warmup; });
    if (!work.length) work = entry.sets;
    var first = work[0] || {};
    return {
      exerciseId: entry.exerciseId,
      sets: work.length || 1,
      reps: first.reps == null ? null : first.reps,
      weight: first.weight == null ? null : first.weight
    };
  }

  function sessionConfig(date) {
    var s = sessionByDate(date);
    if (!s) return [];
    return s.entries.map(entryConfig);
  }

  // --- マイセット ---------------------------------------------------------

  function mysetLabel(m) {
    var ex = exerciseById(m.exerciseId);
    var unit = ex && ex.type === 'time' ? '秒' : '';
    var w = m.weight == null ? '' : m.weight + 'kg×';
    return w + (m.reps == null ? '-' : m.reps) + unit + '×' + m.sets + 'セット';
  }

  function mysetsOf(exerciseId) {
    return state.mysets.filter(function (m) { return m.exerciseId === exerciseId; });
  }

  /*
   * 同じ内容が登録済みなら追加しない。
   * 同じ組み合わせが並ぶと選ぶ手間が増えるだけのため。
   */
  function addMySet(exerciseId, sets, reps, weight) {
    var dup = state.mysets.filter(function (m) {
      return m.exerciseId === exerciseId && m.sets === sets &&
        m.reps === reps && m.weight === weight;
    })[0];
    if (dup) return { added: false, myset: dup };

    var m = {
      id: uid('ms'),
      exerciseId: exerciseId,
      sets: sets,
      reps: reps,
      weight: weight == null ? null : weight
    };
    state.mysets.push(m);
    save();
    return { added: true, myset: m };
  }

  function removeMySet(id) {
    var removed = state.mysets.filter(function (m) { return m.id === id; })[0];
    state.mysets = state.mysets.filter(function (m) { return m.id !== id; });
    save();
    return removed || null;
  }

  function restoreMySet(myset) {
    if (!myset) return;
    var exists = state.mysets.some(function (m) { return m.id === myset.id; });
    if (!exists) state.mysets.push(myset);
    save();
  }

  // --- 体組成 -------------------------------------------------------------

  function setBodyLog(date, weight, fat) {
    var log = state.bodyLogs.filter(function (b) { return b.date === date; })[0];
    if (weight == null && fat == null) {
      state.bodyLogs = state.bodyLogs.filter(function (b) { return b.date !== date; });
      save();
      return;
    }
    if (log) {
      log.weight = weight;
      log.fat = fat;
    } else {
      state.bodyLogs.push({ date: date, weight: weight, fat: fat });
      state.bodyLogs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    }
    save();
  }

  function bodyLogByDate(date) {
    return state.bodyLogs.filter(function (b) { return b.date === date; })[0] || null;
  }

  // --- 入出力 -------------------------------------------------------------

  function exportJSON() {
    state.meta.lastExportedAt = new Date().toISOString();
    saveNow();
    return JSON.stringify(state, null, 2);
  }

  /*
   * 読み込もうとしているテキストが Iron Log のデータとして成立するかを調べる。
   * migrate() は欠損を補って必ず状態を返すため、検証をここで独立して行わないと
   * 無関係なJSONでも「移行成功」として既存データを置き換えてしまう。
   *
   * 成立する場合は解析結果を返し、しない場合は理由を Error で投げる。
   */
  function parseImport(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('JSONとして読み取れませんでした');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Iron Log のデータ形式ではありません');
    }
    if (!Array.isArray(data.sessions)) {
      throw new Error('記録（sessions）が見つかりません');
    }
    if (!Array.isArray(data.exercises)) {
      throw new Error('種目（exercises）が見つかりません');
    }
    for (var i = 0; i < data.sessions.length; i++) {
      var s = data.sessions[i];
      if (!s || typeof s !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Array.isArray(s.entries)) {
        throw new Error((i + 1) + '件目の記録の形式が正しくありません');
      }
    }
    return {
      sessions: data.sessions.length,
      exercises: data.exercises.length,
      raw: data
    };
  }

  /*
   * mode: 'replace' なら丸ごと差し替え、'merge' なら日付が重複しないセッションのみ取り込む。
   * 呼び出し前に parseImport で検証を通すこと。
   */
  function importJSON(text, mode) {
    var incoming = migrate(parseImport(text).raw);
    if (mode === 'replace') {
      state = incoming;
      saveNow();
      return { sessions: state.sessions.length };
    }

    var added = 0;
    var existingDates = {};
    state.sessions.forEach(function (s) { existingDates[s.date] = true; });
    incoming.sessions.forEach(function (s) {
      if (existingDates[s.date]) return;
      state.sessions.push(s);
      added++;
    });
    state.sessions.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    var knownEx = {};
    state.exercises.forEach(function (e) { knownEx[e.id] = true; });
    incoming.exercises.forEach(function (e) {
      if (!knownEx[e.id]) state.exercises.push(e);
    });

    var knownRt = {};
    state.routines.forEach(function (r) { knownRt[r.id] = true; });
    incoming.routines.forEach(function (r) {
      if (!knownRt[r.id]) state.routines.push(r);
    });

    var knownMs = {};
    state.mysets.forEach(function (m) { knownMs[m.id] = true; });
    incoming.mysets.forEach(function (m) {
      if (!knownMs[m.id]) state.mysets.push(m);
    });

    var knownBody = {};
    state.bodyLogs.forEach(function (b) { knownBody[b.date] = true; });
    incoming.bodyLogs.forEach(function (b) {
      if (!knownBody[b.date]) state.bodyLogs.push(b);
    });
    state.bodyLogs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    saveNow();
    return { sessions: added };
  }

  function exportCSV() {
    var rows = [['date', 'exercise', 'category', 'set', 'weight_kg', 'reps', 'rpe', 'warmup', 'volume_kg']];
    state.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (s) {
      s.entries.forEach(function (en) {
        var e = exerciseById(en.exerciseId);
        en.sets.forEach(function (st, i) {
          if (!st.done) return;
          var w = Number(st.weight) || 0;
          var r = Number(st.reps) || 0;
          rows.push([
            s.date,
            e ? e.name : en.exerciseId,
            e ? e.category : '',
            i + 1,
            st.weight == null ? '' : st.weight,
            st.reps == null ? '' : st.reps,
            st.rpe == null ? '' : st.rpe,
            st.warmup ? 1 : 0,
            st.warmup ? 0 : w * r
          ]);
        });
      });
    });
    return rows.map(function (r) {
      return r.map(function (c) {
        var v = String(c);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');
  }

  function clearAll() {
    state = defaultState();
    saveNow();
  }

  function usageBytes() {
    try {
      return new Blob([global.localStorage.getItem(KEY) || '']).size;
    } catch (e) {
      return (global.localStorage.getItem(KEY) || '').length;
    }
  }

  /*
   * --- 記録を失わせないための仕組み ---------------------------------------
   *
   * localStorage は永続保存ではない。次の経路で消える。
   *
   *   1. 利用者がサイトデータを削除した
   *   2. iOS Safari が、一定期間そのサイトを開かなかったサイトの
   *      スクリプト書き込み領域を削除した
   *   3. 端末の空き容量が減り、ブラウザが古いサイトのデータを追い出した
   *   4. プライベートブラウズだった
   *
   * 2 が最も危ない。数週間トレーニングを休んだだけで消えるためである。
   * 対策は次の3段構えとする。通信を伴うものは採らない（原則4）。
   *
   *   a. 永続化を要求する（persist）。付与されると 2 と 3 の対象から外れる
   *   b. ホーム画面に追加してもらう。iOS では 2 の対象から外れる
   *   c. 書き出しを促す。1 と 4 はアプリ側では防げないため、退避手段を持たせる
   */

  // ブラウザに永続化を要求する。付与の判断はブラウザ側が行う。
  // Chrome は利用実績から自動で判断し、Firefox は利用者に確認する。
  // Safari はホーム画面に追加されている場合に付与する。
  function requestPersistence() {
    if (!global.navigator || !navigator.storage || !navigator.storage.persist) {
      return Promise.resolve(false);
    }
    return navigator.storage.persist().then(function (ok) {
      return !!ok;
    })['catch'](function () { return false; });
  }

  function persistenceGranted() {
    if (!global.navigator || !navigator.storage || !navigator.storage.persisted) {
      return Promise.resolve(null); // 判定できない
    }
    return navigator.storage.persisted().then(function (ok) {
      return !!ok;
    })['catch'](function () { return null; });
  }

  // 永続化の自動要求は一度だけにする。
  // 毎回聞くと、確認を出すブラウザで煩わしくなる（原則2）
  function persistAsked() {
    return !!state.meta.persistAskedAt;
  }

  function markPersistAsked() {
    state.meta.persistAskedAt = new Date().toISOString();
    save();
  }

  // ホーム画面への追加の案内を閉じた記録。閉じたあとは記録画面に出さない
  function dismissInstall() {
    state.meta.installDismissedAt = new Date().toISOString();
    save();
  }

  function installDismissedAt() {
    return state.meta.installDismissedAt || null;
  }

  // 最後の書き出し以降に記録されたセッションの件数。
  // 書き出しの必要性を、日数ではなく「失う量」で示すために使う
  function unexportedSessions() {
    var last = state.meta.lastExportedAt;
    var withRecord = state.sessions.filter(function (s) {
      return s.entries.some(function (en) {
        return en.sets.some(function (x) { return x.done && !x.warmup; });
      }) || s.memo || s.condition;
    });
    if (!last) return withRecord.length;
    var lastDate = last.slice(0, 10);
    return withRecord.filter(function (s) { return s.date > lastDate; }).length;
  }

  function daysSinceExport() {
    var last = state.meta.lastExportedAt;
    if (!last) return null;
    return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  }

  /*
   * 書き出しを促すかどうか。
   * 記録が数件しかないうちは促さない。促す価値より煩わしさが勝るため。
   */
  function backupDue() {
    var n = unexportedSessions();
    if (n < 5) return false;
    var d = daysSinceExport();
    return d === null || d >= 14;
  }

  function onEvent(fn) {
    listeners.push(fn);
  }

  global.ILStore = {
    KEY: KEY,
    load: load,
    save: save,
    saveNow: saveNow,
    flush: flush,
    get: get,
    todayStr: todayStr,
    uid: uid,
    exerciseById: exerciseById,
    exerciseName: exerciseName,
    addExercise: addExercise,
    updateExercise: updateExercise,
    removeExercise: removeExercise,
    sessionByDate: sessionByDate,
    ensureSession: ensureSession,
    pruneSession: pruneSession,
    removeSession: removeSession,
    addEntry: addEntry,
    addEntryWithSets: addEntryWithSets,
    snapshotSession: snapshotSession,
    restoreSession: restoreSession,
    removeEntry: removeEntry,
    moveEntry: moveEntry,
    entryOf: entryOf,
    addSet: addSet,
    removeSet: removeSet,
    updateSet: updateSet,
    lastPerformance: lastPerformance,
    addRoutine: addRoutine,
    updateRoutine: updateRoutine,
    removeRoutine: removeRoutine,
    applyRoutine: applyRoutine,
    entryConfig: entryConfig,
    sessionConfig: sessionConfig,
    mysetLabel: mysetLabel,
    mysetsOf: mysetsOf,
    addMySet: addMySet,
    removeMySet: removeMySet,
    restoreMySet: restoreMySet,
    setBodyLog: setBodyLog,
    bodyLogByDate: bodyLogByDate,
    exportJSON: exportJSON,
    parseImport: parseImport,
    importJSON: importJSON,
    exportCSV: exportCSV,
    clearAll: clearAll,
    usageBytes: usageBytes,
    requestPersistence: requestPersistence,
    persistenceGranted: persistenceGranted,
    persistAsked: persistAsked,
    markPersistAsked: markPersistAsked,
    dismissInstall: dismissInstall,
    installDismissedAt: installDismissedAt,
    unexportedSessions: unexportedSessions,
    daysSinceExport: daysSinceExport,
    backupDue: backupDue,
    onEvent: onEvent
  };
})(window);
