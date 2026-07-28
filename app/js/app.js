/* Iron Log - 画面描画とイベント処理 */
(function (global) {
  'use strict';

  var S = global.ILStore;
  var C = global.ILCalc;
  var D = global.ILData;
  var esc = C.esc;

  var ui = {
    tab: 'log',
    date: S.todayStr(),
    historyMonth: null,   // 'YYYY-MM'
    historyDate: null,
    analyticsExercise: null,
    analyticsRange: 90,
    pickerOpenId: null,
    modal: null
  };

  var WDAY = ['日', '月', '火', '水', '木', '金', '土'];

  function $(sel) { return document.querySelector(sel); }

  function fmtDateLabel(str) {
    var d = C.parseDate(str);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + WDAY[d.getDay()] + ')';
  }

  function isToday(str) {
    return str === S.todayStr();
  }

  // =====================================================================
  // 記録タブ
  // =====================================================================

  function renderLog() {
    var date = ui.date;
    var session = S.sessionByDate(date);
    var entries = session ? session.entries : [];
    var vol = C.sessionVolume(session);
    var sets = C.sessionSetCount(session);

    var head =
      '<div class="datebar">' +
        '<button class="icon" data-act="date-prev" aria-label="前の日">‹</button>' +
        '<div class="datebar-main">' +
          '<strong>' + esc(fmtDateLabel(date)) + '</strong>' +
          (isToday(date) ? '<span class="badge-today">今日</span>' : '<button class="link" data-act="date-today">今日へ</button>') +
        '</div>' +
        '<button class="icon" data-act="date-next" aria-label="次の日">›</button>' +
      '</div>' +
      '<div class="summary" id="log-summary">' + summaryHTML(vol, sets, entries.length) + '</div>';

    var body = entries.length
      ? entries.map(function (en, i) { return entryCard(en, i, entries.length); }).join('')
      : '<div class="empty">' +
          '<p>まだ記録がありません</p>' +
          '<p class="sub">ルーティンを展開するか、種目を追加してください</p>' +
        '</div>';

    var routines = S.get().routines;
    var routineHTML = routines.length
      ? '<div class="routine-row">' +
          routines.map(function (r) {
            return '<button class="chip" data-act="apply-routine" data-id="' + r.id + '">' + esc(r.name) + '</button>';
          }).join('') +
        '</div>'
      : '';

    var actions =
      '<div class="actions">' +
        '<button class="primary" data-act="pick-exercise">種目を追加</button>' +
      '</div>' + routineHTML;

    return head + actions + body + bodyLogCard(date) + memoCard(session);
  }

  function summaryHTML(vol, sets, exCount) {
    return '<div><span class="k">総ボリューム</span><span class="v">' + C.fmtVolume(vol) + '</span></div>' +
      '<div><span class="k">セット</span><span class="v">' + sets + '</span></div>' +
      '<div><span class="k">種目</span><span class="v">' + exCount + '</span></div>';
  }

  function entryCard(entry, index, total) {
    var ex = S.exerciseById(entry.exerciseId);
    var name = ex ? ex.name : '削除された種目';
    var cat = D.categoryById(ex ? ex.category : 'other');
    var type = ex ? ex.type : 'weight_reps';
    var prev = S.lastPerformance(entry.exerciseId, ui.date);

    var prevHTML = prev
      ? '<div class="prev">前回 ' + esc(prev.date.slice(5).replace('-', '/')) + '：' +
          prev.sets.slice(0, 5).map(function (st) { return setLabel(st, type); }).join('、') +
          (prev.sets.length > 5 ? ' 他' + (prev.sets.length - 5) + 'セット' : '') +
        '</div>'
      : '<div class="prev muted">初めての種目です</div>';

    var header =
      '<div class="card-head">' +
        '<span class="cat-dot" style="background:' + cat.color + '"></span>' +
        '<h3>' + esc(name) + '</h3>' +
        '<span class="cat-label">' + esc(cat.label) + '・' +
          esc(D.equipmentById(ex ? ex.equip : 'other').label) + '</span>' +
        '<span class="card-vol" data-vol-for="' + entry.exerciseId + '">' + C.fmtVolume(C.entryVolume(entry)) + '</span>' +
        '<button class="icon sm" data-act="entry-up" data-id="' + entry.exerciseId + '" aria-label="上へ移動"' +
          (index === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="icon sm" data-act="entry-down" data-id="' + entry.exerciseId + '" aria-label="下へ移動"' +
          (index === total - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="icon sm danger" data-act="entry-remove" data-id="' + entry.exerciseId + '" aria-label="種目を削除">×</button>' +
      '</div>';

    var colHead = type === 'time'
      ? '<div class="set-row head"><span>#</span><span>秒</span><span></span><span>RPE</span><span>済</span><span></span></div>'
      : '<div class="set-row head"><span>#</span><span>' + (type === 'bodyweight_reps' ? '加重kg' : 'kg') +
        '</span><span>回</span><span>RPE</span><span>済</span><span></span></div>';

    var rows = entry.sets.map(function (st, i) { return setRow(entry.exerciseId, st, i, type); }).join('');

    return '<section class="card" data-card="' + entry.exerciseId + '">' + header + prevHTML +
      '<div class="sets">' + colHead + rows + '</div>' +
      '<div class="card-foot">' +
        '<button class="add-set" data-act="set-add" data-id="' + entry.exerciseId + '">＋ セットを追加</button>' +
        '<button class="myset-add" data-act="myset-from-card" data-id="' + entry.exerciseId +
          '" aria-label="この内容をマイセットに登録" title="この内容をマイセットに登録">＋★</button>' +
      '</div>' +
      '</section>';
  }

  function setLabel(st, type) {
    if (type === 'time') return (st.reps || 0) + '秒';
    var w = st.weight == null || st.weight === '' ? 0 : st.weight;
    return w + 'kg×' + (st.reps || 0);
  }

  function setRow(exId, st, i, type) {
    var pr = C.isPRSet(ui.date, exId, st);
    var cls = 'set-row' + (st.done ? ' done' : '') + (st.warmup ? ' warmup' : '');
    var first = type === 'time'
      ? '<input class="cell" type="number" inputmode="numeric" min="0" step="1" value="' +
          (st.reps == null ? '' : esc(st.reps)) + '" data-field="reps" data-id="' + exId + '" data-i="' + i +
          '" aria-label="秒数"><span class="cell-spacer"></span>'
      : '<input class="cell" type="number" inputmode="decimal" min="0" step="0.5" value="' +
          (st.weight == null ? '' : esc(st.weight)) + '" data-field="weight" data-id="' + exId + '" data-i="' + i +
          '" aria-label="重量"><input class="cell" type="number" inputmode="numeric" min="0" step="1" value="' +
          (st.reps == null ? '' : esc(st.reps)) + '" data-field="reps" data-id="' + exId + '" data-i="' + i +
          '" aria-label="回数">';

    return '<div class="' + cls + '">' +
      '<button class="setno' + (st.warmup ? ' w' : '') + '" data-act="set-warmup" data-id="' + exId + '" data-i="' + i +
        '" aria-label="ウォームアップ切替">' + (st.warmup ? 'W' : (i + 1)) + '</button>' +
      first +
      '<input class="cell" type="number" inputmode="decimal" min="1" max="10" step="0.5" value="' +
        (st.rpe == null ? '' : esc(st.rpe)) + '" data-field="rpe" data-id="' + exId + '" data-i="' + i +
        '" aria-label="RPE" placeholder="-">' +
      '<button class="check' + (st.done ? ' on' : '') + '" data-act="set-done" data-id="' + exId + '" data-i="' + i +
        '" aria-label="セット完了">✓</button>' +
      '<button class="icon sm" data-act="set-remove" data-id="' + exId + '" data-i="' + i + '" aria-label="セット削除">−</button>' +
      (pr ? '<span class="pr" title="自己ベスト更新" aria-label="自己ベスト更新">★</span>' : '') +
      '</div>';
  }

  function bodyLogCard(date) {
    var b = S.bodyLogByDate(date) || {};
    return '<section class="card compact">' +
      '<div class="card-head"><h3>体組成</h3></div>' +
      '<div class="body-row">' +
        '<label>体重 <input type="number" inputmode="decimal" step="0.1" min="0" value="' +
          (b.weight == null ? '' : esc(b.weight)) + '" data-field="bodyweight" placeholder="kg"></label>' +
        '<label>体脂肪 <input type="number" inputmode="decimal" step="0.1" min="0" value="' +
          (b.fat == null ? '' : esc(b.fat)) + '" data-field="bodyfat" placeholder="%"></label>' +
      '</div></section>';
  }

  function memoCard(session) {
    var memo = session ? session.memo || '' : '';
    var cond = session ? session.condition || 0 : 0;
    var stars = [1, 2, 3, 4, 5].map(function (n) {
      return '<button class="cond' + (n <= cond ? ' on' : '') + '" data-act="cond" data-n="' + n +
        '" aria-label="コンディション' + n + '">' + n + '</button>';
    }).join('');
    return '<section class="card compact">' +
      '<div class="card-head"><h3>コンディションとメモ</h3></div>' +
      '<div class="cond-row">' + stars + '</div>' +
      '<textarea data-field="memo" rows="2" placeholder="今日の気づき（任意）">' + esc(memo) + '</textarea>' +
      '</section>';
  }

  // 入力のたびに全再描画するとフォーカスが外れるため、数値だけ差し替える
  function refreshTotals() {
    var session = S.sessionByDate(ui.date);
    var el = $('#log-summary');
    if (el && session) {
      el.innerHTML = summaryHTML(C.sessionVolume(session), C.sessionSetCount(session), session.entries.length);
    }
    if (!session) return;
    session.entries.forEach(function (en) {
      var v = document.querySelector('[data-vol-for="' + en.exerciseId + '"]');
      if (v) v.textContent = C.fmtVolume(C.entryVolume(en));
    });
  }

  // =====================================================================
  // 履歴タブ
  // =====================================================================

  function renderHistory() {
    var month = ui.historyMonth || S.todayStr().slice(0, 7);
    var parts = month.split('-');
    var year = Number(parts[0]);
    var mon = Number(parts[1]);

    var first = new Date(year, mon - 1, 1);
    var lastDay = new Date(year, mon, 0).getDate();
    var lead = (first.getDay() + 6) % 7; // 月曜始まり

    // 月曜始まりで数えた列位置から曜日クラスを決める（5=土, 6=日）
    function dowClass(col) {
      var c = col % 7;
      return c === 5 ? ' sat' : (c === 6 ? ' sun' : '');
    }

    var cells = '';
    for (var i = 0; i < lead; i++) {
      cells += '<button class="cal-cell empty' + dowClass(i) + '" disabled></button>';
    }

    var monthVol = 0;
    var monthDays = 0;
    for (var d = 1; d <= lastDay; d++) {
      var ds = year + '-' + String(mon).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var s = S.sessionByDate(ds);
      var v = C.sessionVolume(s);
      monthVol += v;
      // 実施日の判定は月サマリーとカレンダーで揃える
      if (C.hasRecord(s)) monthDays++;
      var cats = {};
      if (s) {
        s.entries.forEach(function (en) {
          var ex = S.exerciseById(en.exerciseId);
          if (ex) cats[ex.category] = true;
        });
      }
      var dots = Object.keys(cats).slice(0, 3).map(function (c) {
        return '<i style="background:' + D.categoryById(c).color + '"></i>';
      }).join('');
      cells += '<button class="cal-cell' + dowClass(lead + d - 1) + (C.hasRecord(s) ? ' has' : '') +
        (ds === ui.historyDate ? ' sel' : '') +
        (ds === S.todayStr() ? ' today' : '') + '" data-act="cal-day" data-date="' + ds + '">' +
        '<span class="n">' + d + '</span><span class="dots">' + dots + '</span></button>';
    }

    // 行の長さと土日の帯を揃えるため、月末以降も枠を描く
    var used = lead + lastDay;
    var trail = (7 - (used % 7)) % 7;
    for (var k = 0; k < trail; k++) {
      cells += '<button class="cal-cell empty' + dowClass(used + k) + '" disabled></button>';
    }

    var header =
      '<div class="datebar">' +
        '<button class="icon" data-act="month-prev" aria-label="前の月">‹</button>' +
        '<div class="datebar-main"><strong>' + year + '年' + mon + '月</strong></div>' +
        '<button class="icon" data-act="month-next" aria-label="次の月">›</button>' +
      '</div>' +
      '<div class="summary">' +
        '<div><span class="k">実施日数</span><span class="v">' + monthDays + '日</span></div>' +
        '<div><span class="k">月間ボリューム</span><span class="v">' + C.fmtVolume(monthVol) + '</span></div>' +
        '<div><span class="k">連続週</span><span class="v">' + C.weekStreak() + '週</span></div>' +
      '</div>';

    var cal = '<div class="cal">' +
      ['月', '火', '水', '木', '金', '土', '日'].map(function (w) { return '<div class="cal-h">' + w + '</div>'; }).join('') +
      cells + '</div>';

    return header + cal + historyDetail();
  }

  function historyDetail() {
    if (!ui.historyDate) return '<div class="empty"><p class="sub">日付を選ぶと内容を表示します</p></div>';
    var s = S.sessionByDate(ui.historyDate);
    if (!s) {
      return '<section class="card"><div class="card-head"><h3>' + esc(fmtDateLabel(ui.historyDate)) + '</h3></div>' +
        '<p class="muted pad">記録がありません</p>' +
        '<button class="primary" data-act="goto-log" data-date="' + ui.historyDate + '">この日に記録する</button></section>';
    }
    var rows = s.entries.map(function (en) {
      var ex = S.exerciseById(en.exerciseId);
      var type = ex ? ex.type : 'weight_reps';
      var done = en.sets.filter(function (st) { return st.done; });
      return '<div class="hist-row">' +
        '<div class="hist-name"><span class="cat-dot" style="background:' +
          D.categoryById(ex ? ex.category : 'other').color + '"></span>' +
          esc(ex ? ex.name : '削除された種目') + '</div>' +
        '<div class="hist-sets">' + (done.length
          ? done.map(function (st) { return setLabel(st, type); }).join('、')
          : '<span class="muted">未実施</span>') + '</div>' +
        '<div class="hist-vol">' + C.fmtVolume(C.entryVolume(en)) + '</div>' +
      '</div>';
    }).join('');

    var b = S.bodyLogByDate(ui.historyDate);
    var bodyInfo = b ? '<p class="muted pad">体重 ' + (b.weight != null ? b.weight + 'kg' : '-') +
      '／体脂肪 ' + (b.fat != null ? b.fat + '%' : '-') + '</p>' : '';

    return '<section class="card">' +
      '<div class="card-head"><h3>' + esc(fmtDateLabel(ui.historyDate)) + '</h3>' +
      '<span class="card-vol">' + C.fmtVolume(C.sessionVolume(s)) + '</span></div>' +
      rows + bodyInfo +
      (s.memo ? '<p class="memo">' + esc(s.memo) + '</p>' : '') +
      '<div class="row-actions">' +
        '<button data-act="goto-log" data-date="' + ui.historyDate + '">この日を編集</button>' +
        '<button class="danger" data-act="session-remove" data-id="' + s.id + '">この日を削除</button>' +
      '</div></section>';
  }

  // =====================================================================
  // 分析タブ
  // =====================================================================

  function renderAnalytics() {
    var t = C.totals();
    var weeks = C.weeklyVolume(12);
    var barData = weeks.map(function (w) {
      return {
        label: w.week.slice(5).replace('-', '/'),
        value: w.volume,
        title: C.fmtVolume(w.volume) + ' / ' + w.days + '日'
      };
    });

    var from = C.addDays(S.todayStr(), -ui.analyticsRange);
    var byCat = C.volumeByCategory(from, S.todayStr()).map(function (c) {
      return { label: c.label, value: c.volume, color: c.color };
    });

    var summary = '<div class="summary">' +
      '<div><span class="k">総ボリューム</span><span class="v">' + C.fmtVolume(t.volume) + '</span></div>' +
      '<div><span class="k">総セット</span><span class="v">' + t.sets + '</span></div>' +
      '<div><span class="k">実施日数</span><span class="v">' + t.days + '日</span></div>' +
      '</div>';

    var ranges = [30, 90, 365].map(function (r) {
      return '<button class="chip' + (ui.analyticsRange === r ? ' on' : '') + '" data-act="range" data-r="' + r + '">' +
        (r === 365 ? '1年' : r + '日') + '</button>';
    }).join('');

    var hasWeekData = weeks.some(function (w) { return w.volume > 0 || w.days > 0; });
    var volCard = '<section class="card">' +
      '<div class="card-head"><h3>週次ボリューム（直近12週）</h3></div>' +
      (hasWeekData
        ? C.barChart(barData, { aria: '週次総ボリュームの推移', maxLabel: C.fmtVolume })
        : C.emptyChart('データがありません')) + '</section>';

    var catCard = '<section class="card">' +
      '<div class="card-head"><h3>部位別ボリューム</h3></div>' +
      '<div class="routine-row">' + ranges + '</div>' +
      C.stackedBar(byCat) + '</section>';

    // 種目別の推定1RM推移
    var used = {};
    S.get().sessions.forEach(function (s) {
      s.entries.forEach(function (en) { used[en.exerciseId] = true; });
    });
    var usedIds = Object.keys(used);
    var selected = ui.analyticsExercise;
    if (!selected || usedIds.indexOf(selected) < 0) selected = usedIds[0] || null;

    var e1rmCard;
    if (!selected) {
      e1rmCard = '<section class="card"><div class="card-head"><h3>推定1RMの推移</h3></div>' +
        C.emptyChart('記録を追加すると表示します') + '</section>';
    } else {
      var series = C.e1rmSeries(selected);
      var opts = usedIds.map(function (id) {
        return '<option value="' + id + '"' + (id === selected ? ' selected' : '') + '>' +
          esc(S.exerciseName(id)) + '</option>';
      }).join('');
      var lineData = series.map(function (p) {
        return { label: p.date.slice(5).replace('-', '/'), value: p.value, title: C.fmtNum(p.value) + 'kg' };
      });
      e1rmCard = '<section class="card">' +
        '<div class="card-head"><h3>推定1RMの推移</h3></div>' +
        '<select data-act="pick-analytics-ex" aria-label="種目を選択">' + opts + '</select>' +
        C.lineChart(lineData, { aria: '推定1RMの推移' }) +
        '<p class="note">Epley式 1RM = 重量 × (1 + 回数 ÷ 30)。12回を超えるセットは推定から除外しています。</p>' +
        '</section>';
    }

    var pbs = C.allPersonalBests().slice(0, 15);
    var pbCard = '<section class="card">' +
      '<div class="card-head"><h3>自己ベスト</h3></div>' +
      (pbs.length
        ? '<div class="pb-list">' + pbs.map(function (p) {
            return '<div class="pb-row"><span class="cat-dot" style="background:' +
              D.categoryById(p.category).color + '"></span><span class="pb-name">' + esc(p.name) + '</span>' +
              '<span class="pb-val">' + C.fmtNum(p.weight, 1) + 'kg</span>' +
              '<span class="pb-sub">推定1RM ' + C.fmtNum(p.e1rm, 1) + 'kg</span></div>';
          }).join('') + '</div>'
        : '<p class="muted pad">まだ記録がありません</p>') +
      '</section>';

    var body = S.get().bodyLogs.filter(function (b) { return b.weight != null; });
    var bodyCard = '<section class="card">' +
      '<div class="card-head"><h3>体重の推移</h3></div>' +
      C.lineChart(body.map(function (b) {
        return { label: b.date.slice(5).replace('-', '/'), value: Number(b.weight), title: b.weight + 'kg' };
      }), { aria: '体重の推移' }) + '</section>';

    return summary + volCard + catCard + e1rmCard + pbCard + bodyCard;
  }

  // =====================================================================
  // 設定タブ
  // =====================================================================

  function renderSettings() {
    var st = S.get().settings;
    var bytes = S.usageBytes();
    var meta = S.get().meta;
    var exported = meta.lastExportedAt
      ? new Date(meta.lastExportedAt).toLocaleDateString('ja-JP')
      : '未実施';

    var display = '<section class="card">' +
      '<div class="card-head"><h3>表示と動作</h3></div>' +
      '<label class="frow">テーマ' +
        '<select data-setting="theme">' +
          ['auto:端末に合わせる', 'light:ライト', 'dark:ダーク'].map(function (o) {
            var p = o.split(':');
            return '<option value="' + p[0] + '"' + (st.theme === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
          }).join('') +
        '</select></label>' +
      '<label class="frow">休憩時間（秒）' +
        '<input type="number" inputmode="numeric" min="10" max="600" step="10" value="' + st.restSeconds +
        '" data-setting="restSeconds"></label>' +
      '<label class="frow">セット完了でタイマー開始' +
        '<input type="checkbox" data-setting="autoRest"' + (st.autoRest ? ' checked' : '') + '></label>' +
      '<p class="note">オンにすると、本番セットの「済」を押すたびに休憩タイマーが自動で始まります。' +
      'オフのときは種目カードの休憩ボタンで開始します。</p>' +
      '<label class="frow">タイマー終了音' +
        '<input type="checkbox" data-setting="sound"' + (st.sound ? ' checked' : '') + '></label>' +
      '</section>';

    var manage = '<section class="card">' +
      '<div class="card-head"><h3>マスタ管理</h3></div>' +
      '<div class="row-actions">' +
        '<button data-act="manage-exercises">種目を管理</button>' +
        '<button data-act="manage-routines">ルーティンを管理</button>' +
        '<button data-act="manage-mysets">マイセットを管理</button>' +
      '</div></section>';

    /*
     * 記録の保全。
     * localStorage は永続保存ではないため、状態を隠さずに示し、
     * 利用者が取れる手を並べる。曖昧に「おすすめします」とだけ書くと、
     * 消えたときに何もしていなかったことになる。
     */
    var unexported = S.unexportedSessions();
    var due = S.backupDue();

    var backup = due
      ? '<div class="alert">' +
          '<p>書き出していない記録が' + unexported + '日ぶんあります</p>' +
          '<p class="note">端末のデータが消えると、この記録は戻せません。' +
          'ファイルに書き出して、クラウドやパソコンに置いておいてください。</p>' +
          '<div class="row-actions"><button class="primary" data-act="export-json">いま書き出す</button></div>' +
        '</div>'
      : '';

    var persistLabel = persistState === true
      ? '有効（自動削除の対象外）'
      : persistState === false
        ? '未取得'
        : '判定できません';

    var standalone = global.matchMedia && matchMedia('(display-mode: standalone)').matches
      || global.navigator.standalone === true;
    var isIOS = /iPad|iPhone|iPod/.test(global.navigator.userAgent);

    var addHome = (!standalone && isIOS)
      ? '<p class="note">iPhone・iPad では、この画面を開かない期間が続くと' +
        'ブラウザが記録を自動で削除することがあります。' +
        '共有メニューから「ホーム画面に追加」しておくと、その対象から外れます。</p>'
      : '';

    var keep = '<section class="card">' +
      '<div class="card-head"><h3>記録の保全</h3></div>' +
      backup +
      '<p class="muted pad">保存容量 ' + (bytes / 1024).toFixed(1) + 'KB' +
      ' ／ 最終書き出し ' + esc(exported) +
      ' ／ 永続化 ' + esc(persistLabel) + '</p>' +
      (persistState === false
        ? '<div class="row-actions"><button data-act="request-persist">この端末に記録を残す</button></div>'
        : '') +
      addHome +
      '<p class="note">記録はこの端末のブラウザの中だけにあります。外部には送っていません。' +
      'そのため、ブラウザのデータを消去した場合や、プライベートブラウズで使っていた場合は戻せません。' +
      '月に1回の書き出しをおすすめします。</p>' +
      '</section>';

    var data = '<section class="card">' +
      '<div class="card-head"><h3>データ</h3></div>' +
      '<div class="row-actions">' +
        '<button class="primary" data-act="export-json">JSONで書き出す</button>' +
        '<button data-act="import-json">JSONを読み込む</button>' +
        '<button data-act="export-csv">CSVで書き出す</button>' +
      '</div>' +
      '<p class="note">書き出したJSONは、別の端末で読み込めます。機種変更のときはこれを使います。</p>' +
      '<div class="row-actions"><button class="danger" data-act="clear-all">すべての記録を削除</button></div>' +
      '</section>';

    /*
     * 器具紹介枠は、アソシエイトの対象サイトとして登録したホスティング版でのみ出す。
     * 単一ファイル版や埋め込み版は、掲載先が自分の対象サイトとは限らないため出さない。
     * 詳細は docs/monetization.md の 6.1。
     */
    var gear = (D.GEAR.length && !global.IL_NO_AFFILIATE)
      ? '<section class="card">' +
          '<div class="card-head"><h3>使っている器具</h3></div>' +
          D.GEAR.map(function (g) {
            return '<div class="gear"><a href="https://www.amazon.co.jp/dp/' + esc(g.asin) + '?tag=' +
              esc(D.AMAZON_TAG) + '" target="_blank" rel="noopener noreferrer">' + esc(g.name) + '</a>' +
              (g.note ? '<span class="muted">' + esc(g.note) + '</span>' : '') + '</div>';
          }).join('') +
          '<p class="note">上記リンクはAmazonアソシエイトリンクです。</p>' +
        '</section>'
      : '';

    var about = '<section class="card">' +
      '<div class="card-head"><h3>このアプリについて</h3></div>' +
      '<p class="muted pad">Iron Log v1.0。サーバー送信・アカウント登録・外部通信を一切行いません。' +
      '記録は端末内の localStorage にのみ保存されます。</p>' +
      (D.ARTICLE_URL ? '<p class="pad"><a href="' + esc(D.ARTICLE_URL) +
        '" target="_blank" rel="noopener noreferrer">制作の経緯を読む（note）</a></p>' : '') +
      '<p class="pad"><a href="' + esc(D.AUTHOR_URL) + '" target="_blank" rel="noopener noreferrer">作者のnote</a></p>' +
      '</section>';

    // 記録の保全は、書き出しが滞っているときは上に出す。
    // 探しに行かないと気づけない位置に置くと、消えてから知ることになる（原則7）
    return (due ? keep + display : display) + manage + (due ? '' : keep) + data + gear + about;
  }

  // =====================================================================
  // モーダル
  // =====================================================================

  function openModal(title, html, cls) {
    ui.modal = true;
    var el = $('#modal');
    el.innerHTML = '<div class="modal-box ' + (cls || '') + '">' +
      '<div class="modal-head"><h2>' + esc(title) + '</h2>' +
      '<button class="icon" data-act="modal-close" aria-label="閉じる">×</button></div>' +
      '<div class="modal-body">' + html + '</div></div>';
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    ui.modal = null;
    var el = $('#modal');
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '';
  }

  function exercisePicker(query, category, equip) {
    var list = S.get().exercises.filter(function (e) {
      if (e.archived) return false;
      if (category && e.category !== category) return false;
      if (equip && e.equip !== equip) return false;
      if (query && e.name.toLowerCase().indexOf(query.toLowerCase()) < 0) return false;
      return true;
    });
    var session = S.sessionByDate(ui.date);
    var added = {};
    if (session) session.entries.forEach(function (en) { added[en.exerciseId] = true; });

    var catChips = '<div class="routine-row">' +
      '<button class="chip' + (!category ? ' on' : '') + '" data-act="pick-cat" data-cat="">全部位</button>' +
      D.CATEGORIES.map(function (c) {
        return '<button class="chip' + (category === c.id ? ' on' : '') + '" data-act="pick-cat" data-cat="' + c.id + '">' +
          esc(c.label) + '</button>';
      }).join('') + '</div>';

    var equipChips = '<div class="routine-row">' +
      '<button class="chip' + (!equip ? ' on' : '') + '" data-act="pick-equip" data-equip="">全器具</button>' +
      D.EQUIPMENT.map(function (q) {
        return '<button class="chip' + (equip === q.id ? ' on' : '') + '" data-act="pick-equip" data-equip="' + q.id + '">' +
          esc(q.label) + '</button>';
      }).join('') + '</div>';

    var items = list.length
      ? list.map(function (e) {
          if (e.id === ui.pickerOpenId) return pickerForm(e, !!added[e.id]);
          return '<button class="pick-item' + (added[e.id] ? ' added' : '') + '" data-act="pick-open" data-id="' + e.id + '">' +
            '<span class="cat-dot" style="background:' + D.categoryById(e.category).color + '"></span>' +
            '<span class="pick-name">' + esc(e.name) + '</span>' +
            '<span class="equip-tag">' + esc(D.equipmentById(e.equip).label) + '</span>' +
            (added[e.id] ? '<span class="tick">追加済</span>' : '') + '</button>';
        }).join('')
      : '<p class="muted pad">該当する種目がありません</p>';

    return '<input class="search" type="search" placeholder="種目名で検索" value="' + esc(query || '') +
      '" data-act="pick-search" data-cat="' + esc(category || '') + '" data-equip="' + esc(equip || '') +
      '" aria-label="種目を検索">' +
      catChips + equipChips + '<div class="pick-list">' + items + '</div>' +
      '<button class="primary wide" data-act="modal-close">完了</button>';
  }

  function showExercisePicker(query, category, equip) {
    // モバイルでキーボードが再表示されて一覧が隠れるため、フォーカスは戻さない
    openModal('種目を選ぶ', exercisePicker(query, category, equip), 'tall');
  }

  /*
   * 種目一覧の中で開く入力欄。
   * ここでセット数・回数・重量を決めてから追加する。
   * 前回の記録を初期値にして、同じ内容を続ける場合は数値を触らずに済むようにする。
   */
  function pickerForm(e, alreadyAdded) {
    // 初期値はウォームアップを除いた本番セットから取る。
    // ウォームアップの軽い重量が初期値に入ると、直さずに追加した場合に
    // ボリュームと自己ベストが誤るため。
    var prev = S.lastPerformance(e.id, ui.date, true);
    var isTime = e.type === 'time';
    var isBw = e.equip === 'bw' || e.type === 'bodyweight_reps';

    var sets = prev ? prev.sets.length : 3;
    var reps = prev && prev.sets.length ? prev.sets[0].reps : (isTime ? 60 : 10);
    var weight = prev && prev.sets.length ? prev.sets[0].weight : null;

    var prevText = prev
      ? '前回 ' + esc(prev.date.slice(5).replace('-', '/')) + '：' +
          prev.sets.slice(0, 5).map(function (st) { return setLabel(st, e.type); }).join('、')
      : '初めての種目です';

    var weightField = isTime ? '' :
      '<label>' + (isBw ? '加重kg' : 'kg') +
        '<input id="pf-weight" type="number" inputmode="decimal" min="0" max="999.5" step="0.5" value="' +
        (weight == null ? '' : esc(weight)) + '"></label>';

    var mysets = S.mysetsOf(e.id);
    var mysetHTML = mysets.length
      ? '<div class="myset-row">' +
          mysets.map(function (m) {
            return '<button class="chip myset" data-act="myset-apply" data-id="' + m.id + '">' +
              esc(S.mysetLabel(m)) + '</button>';
          }).join('') +
        '</div>'
      : '';

    return '<div class="pick-item expanded">' +
      '<div class="pick-head">' +
        '<span class="cat-dot" style="background:' + D.categoryById(e.category).color + '"></span>' +
        '<span class="pick-name">' + esc(e.name) + '</span>' +
        '<span class="equip-tag">' + esc(D.equipmentById(e.equip).label) + '</span>' +
      '</div>' +
      '<div class="pick-prev">' + prevText + '</div>' +
      mysetHTML +
      '<div class="pick-form">' +
        '<label>セット<input id="pf-sets" type="number" inputmode="numeric" min="1" max="12" step="1" value="' +
          sets + '"></label>' +
        '<label>' + (isTime ? '秒' : '回') + '<input id="pf-reps" type="number" inputmode="numeric" min="1" max="' +
          (isTime ? 9999 : 999) + '" step="1" value="' + (reps == null ? '' : esc(reps)) + '"></label>' +
        weightField +
      '</div>' +
      '<div class="pick-actions">' +
        '<button data-act="myset-save" data-id="' + e.id + '" title="この内容をマイセットに登録">★ 登録</button>' +
        '<button data-act="pick-cancel">やめる</button>' +
        '<button class="primary" data-act="pick-confirm" data-id="' + e.id + '"' +
          (sets && reps ? '' : ' disabled') + '>' +
          (alreadyAdded ? 'セットを追加' : '追加') + '</button>' +
      '</div>' +
      '</div>';
  }

  /*
   * マイセットのチップ行だけを差し替える。
   * 入力欄ごと作り直すと、登録のために入れた値が初期値へ戻ってしまう。
   */
  function refreshMysetRow(exerciseId) {
    var box = document.querySelector('.pick-item.expanded');
    if (!box) return;
    var html = S.mysetsOf(exerciseId).map(function (m) {
      return '<button class="chip myset" data-act="myset-apply" data-id="' + m.id + '">' +
        esc(S.mysetLabel(m)) + '</button>';
    }).join('');
    var row = box.querySelector('.myset-row');
    if (row) {
      row.innerHTML = html;
      return;
    }
    if (!html) return;
    row = document.createElement('div');
    row.className = 'myset-row';
    row.innerHTML = html;
    box.insertBefore(row, box.querySelector('.pick-form'));
  }

  /*
   * 一覧だけを差し替える。
   * モーダルごと作り直すとスクロール位置と入力途中の値が失われるため。
   */
  // 展開した入力欄が可視領域の外にある場合だけ、見える位置まで送る
  function ensureFormVisible() {
    var box = document.querySelector('.pick-item.expanded');
    var body = document.querySelector('.modal-body');
    if (!box || !body) return;
    var b = box.getBoundingClientRect();
    var m = body.getBoundingClientRect();
    if (b.bottom > m.bottom) body.scrollTop += b.bottom - m.bottom + 8;
    else if (b.top < m.top) body.scrollTop -= m.top - b.top + 8;
  }

  function refreshPickList() {
    var body = document.querySelector('.modal-body');
    var list = document.querySelector('.pick-list');
    if (!list) return;
    var top = body ? body.scrollTop : 0;
    var f = pickerFilters();
    var wrap = document.createElement('div');
    wrap.innerHTML = exercisePicker(f.query, f.category, f.equip);
    list.innerHTML = wrap.querySelector('.pick-list').innerHTML;
    if (body) body.scrollTop = top;
  }

  // 現在の絞り込み条件を検索欄から読み取る
  function pickerFilters() {
    var s = $('.search');
    return {
      query: s ? s.value : '',
      category: s ? s.getAttribute('data-cat') : '',
      equip: s ? s.getAttribute('data-equip') : ''
    };
  }

  function exerciseManager() {
    var cats = D.CATEGORIES.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.label) + '</option>';
    }).join('');
    var types = D.TYPES.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.label) + '</option>';
    }).join('');
    var equips = D.EQUIPMENT.map(function (q) {
      return '<option value="' + q.id + '">' + esc(q.label) + '</option>';
    }).join('');

    var form = '<div class="form-inline">' +
      '<input id="new-ex-name" type="text" placeholder="種目名" aria-label="種目名">' +
      '<select id="new-ex-cat" aria-label="部位">' + cats + '</select>' +
      '<select id="new-ex-equip" aria-label="器具">' + equips + '</select>' +
      '<select id="new-ex-type" aria-label="計測型">' + types + '</select>' +
      '<button class="primary" data-act="ex-create">追加</button>' +
      '</div>';

    var list = S.get().exercises.map(function (e) {
      return '<div class="man-row' + (e.archived ? ' archived' : '') + '">' +
        '<span class="cat-dot" style="background:' + D.categoryById(e.category).color + '"></span>' +
        '<span class="man-name">' + esc(e.name) + (e.archived ? '（非表示）' : '') +
          '<small>' + esc(D.categoryById(e.category).label) + ' / ' +
          esc(D.equipmentById(e.equip).label) + '</small></span>' +
        (e.archived
          ? '<button class="sm" data-act="ex-restore" data-id="' + e.id + '">戻す</button>'
          : '<button class="icon sm danger" data-act="ex-remove" data-id="' + e.id + '" aria-label="削除">×</button>') +
        '</div>';
    }).join('');

    return form + '<p class="note">記録に使用済みの種目は、削除せず非表示になります（過去の記録を残すため）。</p>' +
      '<div class="man-list">' + list + '</div>';
  }

  function mysetManager() {
    var list = S.get().mysets;
    if (!list.length) {
      return '<p class="muted pad">まだ登録がありません。</p>' +
        '<p class="note">種目を追加するときの入力欄にある「★ 登録」か、' +
        '種目カード右下の「★」から、よく使う組み合わせを登録できます。' +
        '登録すると、次回その種目を選んだときに1タップで同じ内容を入れられます。</p>';
    }
    var rows = list.map(function (m) {
      return '<div class="man-row">' +
        '<span class="cat-dot" style="background:' +
          D.categoryById((S.exerciseById(m.exerciseId) || {}).category || 'other').color + '"></span>' +
        '<span class="man-name">' + esc(S.exerciseName(m.exerciseId)) +
          '<small>' + esc(S.mysetLabel(m)) + '</small></span>' +
        '<button class="icon sm danger" data-act="myset-remove" data-id="' + m.id + '" aria-label="削除">×</button>' +
        '</div>';
    }).join('');
    return '<div class="man-list">' + rows + '</div>';
  }

  function routineManager() {
    var rs = S.get().routines;
    var list = rs.map(function (r) {
      return '<div class="man-row">' +
        '<span class="man-name">' + esc(r.name) +
          '<small>' + r.items.length + '種目：' +
          esc(r.items.slice(0, 3).map(function (it) {
            var label = S.exerciseName(it.exerciseId);
            if (it.sets != null && it.reps != null) {
              label += ' ' + (it.weight == null ? '' : it.weight + 'kg×') + it.reps + '×' + it.sets;
            }
            return label;
          }).join('、')) + (r.items.length > 3 ? ' ほか' : '') + '</small></span>' +
        '<button class="sm" data-act="rt-from-today" data-id="' + r.id + '">表示中の日付で上書き</button>' +
        '<button class="icon sm danger" data-act="rt-remove" data-id="' + r.id + '" aria-label="削除">×</button>' +
        '</div>';
    }).join('');

    var session = S.sessionByDate(ui.date);
    var canSave = session && session.entries.length;

    return '<div class="form-inline">' +
      '<input id="new-rt-name" type="text" placeholder="ルーティン名" aria-label="ルーティン名">' +
      '<button class="primary" data-act="rt-create"' + (canSave ? '' : ' disabled') + '>表示中の日付の内容で作成</button>' +
      '</div>' +
      '<p class="note">' + (canSave
        ? '記録タブで表示中の日付に入っている種目の並びを、そのままルーティンとして保存します。'
        : '記録タブで種目を追加してから作成してください。') + '</p>' +
      '<div class="man-list">' + (list || '<p class="muted pad">ルーティンがありません</p>') + '</div>';
  }

  // =====================================================================
  // 休憩タイマー
  // =====================================================================

  var timer = { id: null, endsAt: 0, total: 90, hideId: null };

  function fmtClock(sec) {
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  /*
   * 待機中は設定の休憩時間と[開始]を出し、実行中は残り時間と[+30秒][終了]を出す。
   * バー自体は常に表示しておく。使いたいときに探させないため。
   */
  function renderRestBar() {
    var running = !!timer.id;
    $('#rest-go').hidden = running;
    $('#rest-plus').hidden = !running;
    $('#rest-stop').hidden = !running;
    $('#rest').classList.toggle('running', running);
    if (!running) {
      $('#rest-time').textContent = fmtClock(S.get().settings.restSeconds || 90);
      $('#rest-fill').style.width = '0%';
    }
  }

  function startRest(seconds) {
    stopRest(true);
    if (timer.hideId) { clearTimeout(timer.hideId); timer.hideId = null; }
    timer.total = seconds;
    timer.endsAt = Date.now() + seconds * 1000;
    timer.id = setInterval(tickRest, 250);
    renderRestBar();
    tickRest();
  }

  function tickRest() {
    var left = Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
    $('#rest-time').textContent = fmtClock(left);
    // 総秒数は開始時の値を使う（+30秒でも進捗が破綻しないように）
    var total = timer.total || 90;
    $('#rest-fill').style.width = Math.max(0, Math.min(100, ((total - left) / total) * 100)) + '%';
    if (left <= 0) {
      stopRest();
      beep();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }

  function stopRest(silent) {
    if (timer.id) clearInterval(timer.id);
    timer.id = null;
    if (!silent) {
      // 終了直後は0:00を少し見せてから待機表示に戻す
      timer.hideId = setTimeout(function () {
        timer.hideId = null;
        renderRestBar();
      }, 1500);
    } else {
      renderRestBar();
    }
  }

  // 音声ファイルを同梱せず、Web Audio で短いビープを鳴らす
  function beep() {
    if (!S.get().settings.sound) return;
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      [0, 0.22, 0.44].forEach(function (offset) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      });
      setTimeout(function () { ctx.close(); }, 1200);
    } catch (e) {
      /* 音が鳴らせない環境では無視する */
    }
  }

  // =====================================================================
  // ファイル入出力
  // =====================================================================

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /*
   * 通知は取り消しトーストとは別の枠に出す。
   * 同じ枠を使うと、取り消せるはずの操作の直後に別の通知が出ただけで
   * 「元に戻す」が消えてしまう。
   */
  /*
   * 保存領域の永続化を一度だけ要求する。
   * 付与されると、端末の容量不足による追い出しや、
   * 一定期間開かなかったサイトの自動削除の対象から外れる。
   * 付与の判断はブラウザ側が行うため、失敗しても利用者には知らせない。
   */
  var persistState = null; // true / false / null（判定不能）

  function askPersistenceOnce() {
    if (S.persistAsked()) return;
    S.markPersistAsked();
    S.requestPersistence().then(function (ok) {
      persistState = ok;
      if (ui.tab === 'settings') render();
    });
  }

  function refreshPersistState() {
    S.persistenceGranted().then(function (v) {
      if (v === persistState) return;
      persistState = v;
      if (ui.tab === 'settings') render();
    });
  }

  // 設定タブに印を出すかどうか。書き出しが滞っている場合に付ける
  function updateTabBadge() {
    var b = document.querySelector('.tabbar button[data-tab="settings"]');
    if (!b) return;
    var due = S.backupDue();
    b.classList.toggle('badge', due);
    if (due) {
      b.setAttribute('aria-label', '設定（書き出していない記録があります）');
    } else {
      b.removeAttribute('aria-label');
    }
  }

  function note(msg) {
    var el = $('#note');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, 2400);
  }

  var toast = note;

  function hideToast() {
    var el = $('#toast');
    clearTimeout(el._t);
    el.classList.remove('on');
  }

  /*
   * 取り消しトースト（原則6）。
   * 失われる操作の直後に出し、押されればその日のセッションを操作前の状態に戻す。
   * 操作のたびに確認ダイアログを出すと記録の妨げになるため、こちらを主とする。
   */
  var pendingUndo = null;
  var pendingImport = null;

  // 取り消しの前提が崩れる操作の前に呼ぶ（仕様3.1）
  function dropUndo() {
    if (!pendingUndo) return;
    pendingUndo = null;
    document.body.classList.remove('undo-open');
    hideToast();
  }

  function offerUndo(msg, restore) {
    var el = $('#toast');
    pendingUndo = restore;
    document.body.classList.add('undo-open');
    el.innerHTML = '<span>' + esc(msg) + '</span>' +
      '<button class="undo" data-act="undo">元に戻す</button>';
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.classList.remove('on');
      document.body.classList.remove('undo-open');
      pendingUndo = null;
    }, 8000);
  }

  // =====================================================================
  // 描画とイベント
  // =====================================================================

  function render() {
    var view = $('#view');
    var html = '';
    if (ui.tab === 'log') html = renderLog();
    else if (ui.tab === 'history') html = renderHistory();
    else if (ui.tab === 'analytics') html = renderAnalytics();
    else html = renderSettings();
    view.innerHTML = html;
    view.scrollTop = view.scrollTop; // 位置を維持

    Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (b) {
      var on = b.getAttribute('data-tab') === ui.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    updateTabBadge();
    applyTheme();
  }

  /*
   * 「端末に合わせる」の場合は data-theme 属性を外し、メディアクエリに委ねる。
   * 毎回の描画で属性を書き直すと、閲覧側が付けたテーマ指定を打ち消してしまうため、
   * 設定が変わったときだけ属性を操作する。
   */
  var appliedTheme = null;

  function applyTheme() {
    var t = S.get().settings.theme;
    if (t === appliedTheme) return;
    appliedTheme = t;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function setTab(tab) {
    dropUndo();
    ui.tab = tab;
    if (tab === 'history' && !ui.historyMonth) ui.historyMonth = S.todayStr().slice(0, 7);
    render();
    $('#view').scrollTop = 0;
  }

  function shiftMonth(delta) {
    var p = (ui.historyMonth || S.todayStr().slice(0, 7)).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1 + delta, 1);
    ui.historyMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  var ACTIONS = {
    'date-prev': function () { dropUndo(); ui.date = C.addDays(ui.date, -1); render(); },
    'date-next': function () { dropUndo(); ui.date = C.addDays(ui.date, 1); render(); },
    'date-today': function () { dropUndo(); ui.date = S.todayStr(); render(); },

    'pick-exercise': function () { ui.pickerOpenId = null; showExercisePicker('', '', ''); },
    'pick-cat': function (el) {
      var f = pickerFilters();
      ui.pickerOpenId = null;
      showExercisePicker(f.query, el.getAttribute('data-cat'), f.equip);
    },
    'pick-equip': function (el) {
      var f = pickerFilters();
      ui.pickerOpenId = null;
      showExercisePicker(f.query, f.category, el.getAttribute('data-equip'));
    },
    'pick-open': function (el) {
      ui.pickerOpenId = el.getAttribute('data-id');
      refreshPickList();
      ensureFormVisible();
    },
    'myset-apply': function (el) {
      var m = S.get().mysets.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (!m) return;
      if ($('#pf-sets')) $('#pf-sets').value = m.sets;
      if ($('#pf-reps')) $('#pf-reps').value = m.reps == null ? '' : m.reps;
      if ($('#pf-weight')) $('#pf-weight').value = m.weight == null ? '' : m.weight;
      var btn = document.querySelector('[data-act="pick-confirm"]');
      if (btn) btn.disabled = !(m.sets && m.reps);
    },
    'myset-save': function (el) {
      var id = el.getAttribute('data-id');
      var ex = S.exerciseById(id);
      var isTime = ex && ex.type === 'time';
      var sets = clampInt($('#pf-sets') && $('#pf-sets').value, 1, 12, null);
      var reps = clampInt($('#pf-reps') && $('#pf-reps').value, 1, isTime ? 9999 : 999, null);
      if (sets == null || reps == null) { toast('セット数と回数を入力してください'); return; }
      var wEl = $('#pf-weight');
      var weight = wEl && wEl.value !== '' ? Math.max(0, Math.min(999.5, Number(wEl.value))) : null;
      var r = S.addMySet(id, sets, reps, isFinite(weight) ? weight : null);
      refreshMysetRow(id);
      toast(r.added ? 'マイセットに登録しました' : 'すでに登録されています');
    },
    'myset-from-card': function (el) {
      var id = el.getAttribute('data-id');
      var en = S.entryOf(ui.date, id);
      if (!en || !en.sets.length) { toast('セットがありません'); return; }
      var cfg = S.entryConfig(en);
      if (cfg.reps == null) { toast('回数を入力してから登録してください'); return; }
      var r = S.addMySet(id, cfg.sets, cfg.reps, cfg.weight);
      toast(r.added
        ? S.exerciseName(id) + ' の ' + S.mysetLabel(r.myset) + ' を登録しました'
        : 'すでに登録されています');
    },
    'manage-mysets': function () { openModal('マイセットを管理', mysetManager(), 'tall'); },
    'myset-remove': function (el) {
      var removed = S.removeMySet(el.getAttribute('data-id'));
      openModal('マイセットを管理', mysetManager(), 'tall');
      offerUndo('マイセットを削除しました', function () {
        S.restoreMySet(removed);
        openModal('マイセットを管理', mysetManager(), 'tall');
      });
    },

    'pick-cancel': function () {
      ui.pickerOpenId = null;
      refreshPickList();
    },
    'pick-confirm': function (el) {
      var id = el.getAttribute('data-id');
      var ex = S.exerciseById(id);
      var sets = clampInt($('#pf-sets') && $('#pf-sets').value, 1, 12, null);
      var isTime = ex && ex.type === 'time';
      var reps = clampInt($('#pf-reps') && $('#pf-reps').value, 1, isTime ? 9999 : 999, null);
      if (sets == null) { toast('セット数を1〜12で入力してください'); return; }
      if (reps == null) { toast((isTime ? '秒数' : '回数') + 'を入力してください'); return; }

      var wEl = $('#pf-weight');
      var weight = null;
      if (wEl && wEl.value !== '') {
        weight = Math.max(0, Math.min(999.5, Number(wEl.value)));
        if (!isFinite(weight)) weight = null;
      }

      S.addEntryWithSets(ui.date, id, sets, reps, weight);
      ui.pickerOpenId = null;
      refreshPickList();
      render();
      toast(S.exerciseName(id) + ' を' + sets + 'セット追加しました');
    },
    'modal-close': closeModal,

    'apply-routine': function (el) {
      var snap = S.snapshotSession(ui.date);
      var r = S.applyRoutine(ui.date, el.getAttribute('data-id'));
      render();
      if (!r.added) {
        note(r.skipped ? 'すでに追加済みの種目だけでした' : '展開する種目がありません');
        return;
      }
      offerUndo(r.added + '種目を追加しました' +
        (r.skipped ? '（' + r.skipped + '件は追加済みのため据え置き）' : ''),
        function () { S.restoreSession(snap); });
    },

    'entry-remove': function (el) {
      var id = el.getAttribute('data-id');
      var snap = S.snapshotSession(ui.date);
      S.removeEntry(ui.date, id);
      render();
      offerUndo(S.exerciseName(id) + ' を削除しました', function () { S.restoreSession(snap); });
    },
    'entry-up': function (el) { S.moveEntry(ui.date, el.getAttribute('data-id'), -1); render(); },
    'entry-down': function (el) { S.moveEntry(ui.date, el.getAttribute('data-id'), 1); render(); },

    'set-add': function (el) { S.addSet(ui.date, el.getAttribute('data-id')); render(); },
    'set-remove': function (el) {
      var snap = S.snapshotSession(ui.date);
      S.removeSet(ui.date, el.getAttribute('data-id'), Number(el.getAttribute('data-i')));
      render();
      offerUndo('セットを削除しました', function () { S.restoreSession(snap); });
    },
    'rest-start': function () {
      startRest(S.get().settings.restSeconds || 90);
    },
    'undo': function () {
      if (!pendingUndo) return;
      var restore = pendingUndo;
      pendingUndo = null;
      document.body.classList.remove('undo-open');
      hideToast();
      restore();
      render();
    },
    'set-warmup': function (el) {
      var id = el.getAttribute('data-id');
      var i = Number(el.getAttribute('data-i'));
      var en = S.entryOf(ui.date, id);
      if (!en || !en.sets[i]) return;
      S.updateSet(ui.date, id, i, { warmup: !en.sets[i].warmup });
      render();
    },
    'set-done': function (el) {
      var id = el.getAttribute('data-id');
      var i = Number(el.getAttribute('data-i'));
      var en = S.entryOf(ui.date, id);
      if (!en || !en.sets[i]) return;
      var next = !en.sets[i].done;
      S.updateSet(ui.date, id, i, { done: next });
      render();
      if (next && S.get().settings.autoRest && !en.sets[i].warmup) {
        startRest(S.get().settings.restSeconds || 90);
      }
      // 記録が実際に発生した時点で、保存領域の永続化を一度だけ要求する。
      // 起動直後に要求すると、確認を出すブラウザでは
      // まだ何もしていない利用者にいきなり許可を求めることになる（原則2）
      if (next) askPersistenceOnce();
    },

    'cond': function (el) {
      var n = Number(el.getAttribute('data-n'));
      var s = S.ensureSession(ui.date);
      s.condition = s.condition === n ? 0 : n;
      S.save();
      S.pruneSession(ui.date);
      render();
    },

    'month-prev': function () { shiftMonth(-1); render(); },
    'month-next': function () { shiftMonth(1); render(); },
    'cal-day': function (el) {
      ui.historyDate = el.getAttribute('data-date');
      render();
    },
    'goto-log': function (el) {
      ui.date = el.getAttribute('data-date');
      setTab('log');
    },
    'session-remove': function (el) {
      if (!confirm('この日の記録を削除します。元に戻せません。')) return;
      S.removeSession(el.getAttribute('data-id'));
      ui.historyDate = null;
      render();
    },

    'range': function (el) { ui.analyticsRange = Number(el.getAttribute('data-r')); render(); },

    'manage-exercises': function () { openModal('種目を管理', exerciseManager(), 'tall'); },
    'ex-create': function () {
      var name = $('#new-ex-name').value.trim();
      if (!name) { toast('種目名を入力してください'); return; }
      S.addExercise(name, $('#new-ex-cat').value, $('#new-ex-type').value, $('#new-ex-equip').value);
      openModal('種目を管理', exerciseManager(), 'tall');
      toast('追加しました');
    },
    'ex-remove': function (el) {
      var id = el.getAttribute('data-id');
      if (!confirm(S.exerciseName(id) + 'を削除します。よろしいですか。')) return;
      var result = S.removeExercise(id);
      openModal('種目を管理', exerciseManager(), 'tall');
      toast(result === 'archived' ? '記録があるため非表示にしました' : '削除しました');
    },
    'ex-restore': function (el) {
      S.updateExercise(el.getAttribute('data-id'), { archived: false });
      openModal('種目を管理', exerciseManager(), 'tall');
    },

    'manage-routines': function () { openModal('ルーティンを管理', routineManager(), 'tall'); },
    'rt-create': function () {
      var name = $('#new-rt-name').value.trim();
      var session = S.sessionByDate(ui.date);
      if (!name) { toast('ルーティン名を入力してください'); return; }
      if (!session || !session.entries.length) { toast('記録タブに種目がありません'); return; }
      S.addRoutine(name, S.sessionConfig(ui.date));
      openModal('ルーティンを管理', routineManager(), 'tall');
      toast('作成しました');
    },
    'rt-from-today': function (el) {
      var session = S.sessionByDate(ui.date);
      if (!session || !session.entries.length) { toast('記録タブに種目がありません'); return; }
      if (!confirm('表示中の日付の種目構成で上書きします。よろしいですか。')) return;
      S.updateRoutine(el.getAttribute('data-id'), { items: S.sessionConfig(ui.date) });
      openModal('ルーティンを管理', routineManager(), 'tall');
      toast('更新しました');
    },
    'rt-remove': function (el) {
      if (!confirm('このルーティンを削除します。よろしいですか。')) return;
      S.removeRoutine(el.getAttribute('data-id'));
      openModal('ルーティンを管理', routineManager(), 'tall');
    },

    'export-json': function () {
      download('ironlog_' + S.todayStr() + '.json', S.exportJSON());
      toast('書き出しました');
      if (ui.tab === 'settings') render();
    },
    'request-persist': function () {
      S.requestPersistence().then(function (ok) {
        persistState = ok;
        note(ok
          ? 'この端末に記録を残す設定にしました'
          : 'ブラウザが許可しませんでした。書き出しでの保全をおすすめします');
        if (ui.tab === 'settings') render();
      });
    },
    'export-csv': function () {
      download('ironlog_' + S.todayStr() + '.csv', '﻿' + S.exportCSV(), 'text/csv');
      toast('書き出しました');
    },
    'import-json': function () { $('#import-file').click(); },
    'import-merge': function () { runImport('merge'); },
    'import-replace': function () { runImport('replace'); },
    'clear-all': function () {
      if (!confirm('すべての記録を削除します。この操作は元に戻せません。')) return;
      if (!confirm('本当によろしいですか。事前にJSONで書き出すことを強くおすすめします。')) return;
      S.clearAll();
      ui.date = S.todayStr();
      ui.historyDate = null;
      render();
      toast('削除しました');
    },

    'rest-stop': function () { stopRest(true); },
    'rest-plus': function () {
      // 終了後に押された場合は、30秒で開始し直す
      if (!timer.id) { startRest(30); return; }
      timer.endsAt += 30000;
      timer.total += 30;
      tickRest();
    },
    'rest-skip': function () { stopRest(true); }
  };

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (el) {
      var act = el.getAttribute('data-act');
      if (ACTIONS[act]) {
        e.preventDefault();
        ACTIONS[act](el);
        return;
      }
    }
    var tab = e.target.closest('[data-tab]');
    if (tab) setTab(tab.getAttribute('data-tab'));
    if (e.target.id === 'modal') closeModal();
  }

  function onInput(e) {
    var t = e.target;

    if (t.id === 'pf-sets' || t.id === 'pf-reps') {
      var btn = document.querySelector('[data-act="pick-confirm"]');
      if (btn) {
        var okSets = clampInt($('#pf-sets') && $('#pf-sets').value, 1, 12, null);
        var okReps = clampInt($('#pf-reps') && $('#pf-reps').value, 1, 9999, null);
        btn.disabled = !(okSets && okReps);
      }
      return;
    }

    if (t.getAttribute('data-act') === 'pick-search') {
      // 検索は再描画するとフォーカスが外れるため、リスト部分だけ差し替える
      var list = document.querySelector('.pick-list');
      if (list) {
        var wrap = document.createElement('div');
        wrap.innerHTML = exercisePicker(t.value, t.getAttribute('data-cat'), t.getAttribute('data-equip'));
        list.innerHTML = wrap.querySelector('.pick-list').innerHTML;
      }
      return;
    }

    var field = t.getAttribute('data-field');
    if (!field) {
      var setting = t.getAttribute('data-setting');
      if (setting) {
        var val = t.type === 'checkbox' ? t.checked : (t.type === 'number' ? Number(t.value) : t.value);
        S.get().settings[setting] = val;
        S.save();
        if (setting === 'theme') applyTheme();
        if (setting === 'restSeconds') renderRestBar();
      }
      return;
    }

    if (field === 'memo') {
      S.ensureSession(ui.date).memo = t.value;
      S.save();
      S.pruneSession(ui.date);
      return;
    }
    if (field === 'bodyweight' || field === 'bodyfat') {
      var cur = S.bodyLogByDate(ui.date) || {};
      var w = field === 'bodyweight' ? numOrNull(t.value) : (cur.weight == null ? null : cur.weight);
      var f = field === 'bodyfat' ? numOrNull(t.value) : (cur.fat == null ? null : cur.fat);
      S.setBodyLog(ui.date, w, f);
      return;
    }

    var id = t.getAttribute('data-id');
    var i = Number(t.getAttribute('data-i'));
    if (!id) return;

    // 直後の入力が取り消しで巻き戻らないよう、編集が入ったら取り消しは締める
    dropUndo();

    var LIMITS = { weight: [0, 999.5], reps: [0, 9999], rpe: [1, 10] };
    var v = numOrNull(t.value);
    var lim = LIMITS[field];
    if (v != null && lim) v = Math.max(lim[0], Math.min(lim[1], v));
    var patch = {};
    patch[field] = v;
    S.updateSet(ui.date, id, i, patch);
    refreshTotals();
  }

  function onChange(e) {
    if (e.target.getAttribute('data-act') === 'pick-analytics-ex') {
      ui.analyticsExercise = e.target.value;
      render();
    }
  }

  // 範囲内の整数に丸める。空欄や数値でない場合は fallback を返す
  function clampInt(v, min, max, fallback) {
    if (v === '' || v == null) return fallback;
    var n = Math.round(Number(v));
    if (!isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function numOrNull(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function onImportFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result);
      var info;

      // 既存データに触れる前に必ず検証する
      try {
        info = S.parseImport(text);
      } catch (err) {
        openModal('読み込めませんでした',
          '<p class="pad">' + esc(err.message) + '</p>' +
          '<p class="note">現在の記録は変更していません。' +
          'Iron Log の設定画面から書き出したJSONファイルを選んでください。</p>' +
          '<button class="primary wide" data-act="modal-close">閉じる</button>');
        return;
      }

      pendingImport = text;
      var current = S.get().sessions.length;
      openModal('読み込み方法を選ぶ',
        '<p class="pad">ファイルには記録 ' + info.sessions + '件、種目 ' + info.exercises + '件が入っています。</p>' +
        '<div class="import-choice">' +
          '<button data-act="import-merge">' +
            '<strong>追加する</strong>' +
            '<span>日付が重複しない記録だけを取り込みます。現在の' + current + '件は残ります</span>' +
          '</button>' +
          '<button class="danger" data-act="import-replace">' +
            '<strong>置き換える</strong>' +
            '<span>現在の記録' + current + '件を破棄して、読み込んだ' + info.sessions + '件にします</span>' +
          '</button>' +
          '<button data-act="modal-close"><strong>やめる</strong></button>' +
        '</div>');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function runImport(mode) {
    if (!pendingImport) return;
    try {
      var r = S.importJSON(pendingImport, mode);
      pendingImport = null;
      closeModal();
      ui.date = S.todayStr();
      ui.historyDate = null;
      render();
      toast(mode === 'replace'
        ? '置き換えました（' + r.sessions + '件）'
        : r.sessions + '件を追加しました');
    } catch (err) {
      pendingImport = null;
      closeModal();
      toast('読み込みに失敗しました：' + err.message);
    }
  }

  function init() {
    S.load();
    S.onEvent(function (type) {
      if (type === 'save-error') toast('保存に失敗しました。空き容量を確認してください');
    });

    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    $('#import-file').addEventListener('change', onImportFile);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ui.modal) closeModal();
    });

    /*
     * 画面を離れるときに、デバウンス待ちの入力を確実に書き込む（原則3）。
     * モバイルでは入力直後にホームへ戻る操作が日常的に起きる。
     * 日付が変わっても表示中の日付は動かさない（原則2）。
     */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') S.flush();
    });
    window.addEventListener('pagehide', function () { S.flush(); });

    applyTheme();
    renderRestBar();
    render();
    // 永続化の現状を調べる。要求はここでは行わない（原則2）
    refreshPersistState();

    // 単一ファイル版には sw.js が同梱されないため登録しない
    if (!global.IL_SINGLE_FILE && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* オフライン化は任意機能 */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
