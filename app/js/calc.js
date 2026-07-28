/* Iron Log - 集計・推定1RM・SVGグラフ生成 */
(function (global) {
  'use strict';

  var S = global.ILStore;

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /*
   * 推定1RM（Epley式）。
   * reps が 1 のときは実測値そのもの、多レップでは実際より高めに出る性質がある。
   * 12レップを超える推定は誤差が大きいため対象外とする。
   */
  function e1RM(weight, reps) {
    var w = num(weight);
    var r = num(reps);
    if (w <= 0 || r <= 0 || r > 12) return 0;
    return w * (1 + r / 30);
  }

  function setVolume(st) {
    if (!st.done || st.warmup) return 0;
    return num(st.weight) * num(st.reps);
  }

  function entryVolume(entry) {
    return entry.sets.reduce(function (a, st) { return a + setVolume(st); }, 0);
  }

  function sessionVolume(session) {
    if (!session) return 0;
    return session.entries.reduce(function (a, en) { return a + entryVolume(en); }, 0);
  }

  /*
   * その日を「実施日」として数えるか。
   * 履歴カレンダー・月サマリー・分析の実施日数・連続週数すべてがこれを使う。
   * 自重種目だけの日はボリュームが0になるため、ボリュームで判定してはいけない。
   */
  function hasRecord(session) {
    if (!session) return false;
    if (sessionSetCount(session) > 0) return true;
    return !!session.memo || !!session.condition;
  }

  function sessionSetCount(session) {
    if (!session) return 0;
    return session.entries.reduce(function (a, en) {
      return a + en.sets.filter(function (st) { return st.done && !st.warmup; }).length;
    }, 0);
  }

  // --- 日付ユーティリティ -------------------------------------------------

  function parseDate(str) {
    var p = str.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function fmt(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDays(str, n) {
    var d = parseDate(str);
    d.setDate(d.getDate() + n);
    return fmt(d);
  }

  // その日を含む週の月曜日を返す
  function weekStart(str) {
    var d = parseDate(str);
    var dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return fmt(d);
  }

  // --- 集計 ---------------------------------------------------------------

  /*
   * 直近 weeks 週の週次総ボリューム。今週を最後尾に置いた配列を返す。
   */
  function weeklyVolume(weeks) {
    var state = S.get();
    var buckets = [];
    var index = {};
    var cur = weekStart(S.todayStr());
    for (var i = weeks - 1; i >= 0; i--) {
      var ws = addDays(cur, -7 * i);
      index[ws] = buckets.length;
      buckets.push({ week: ws, volume: 0, sets: 0, days: 0 });
    }
    var seenDays = {};
    state.sessions.forEach(function (s) {
      var ws = weekStart(s.date);
      if (!(ws in index)) return;
      var b = buckets[index[ws]];
      var v = sessionVolume(s);
      b.volume += v;
      b.sets += sessionSetCount(s);
      if (hasRecord(s) && !seenDays[s.date]) {
        seenDays[s.date] = true;
        b.days++;
      }
    });
    return buckets;
  }

  /*
   * 期間内の部位別ボリューム。降順で返す。
   */
  function volumeByCategory(fromDate, toDate) {
    var state = S.get();
    var map = {};
    state.sessions.forEach(function (s) {
      if (fromDate && s.date < fromDate) return;
      if (toDate && s.date > toDate) return;
      s.entries.forEach(function (en) {
        var ex = S.exerciseById(en.exerciseId);
        var cat = ex ? ex.category : 'other';
        map[cat] = (map[cat] || 0) + entryVolume(en);
      });
    });
    return Object.keys(map)
      .map(function (k) {
        var c = global.ILData.categoryById(k);
        return { category: k, label: c.label, color: c.color, volume: map[k] };
      })
      .filter(function (x) { return x.volume > 0; })
      .sort(function (a, b) { return b.volume - a.volume; });
  }

  /*
   * 種目の推定1RM推移。セッションごとの最大 e1RM を時系列で返す。
   */
  function e1rmSeries(exerciseId) {
    var state = S.get();
    var out = [];
    state.sessions.forEach(function (s) {
      var best = 0;
      s.entries.forEach(function (en) {
        if (en.exerciseId !== exerciseId) return;
        en.sets.forEach(function (st) {
          if (!st.done || st.warmup) return;
          var v = e1RM(st.weight, st.reps);
          if (v > best) best = v;
        });
      });
      if (best > 0) out.push({ date: s.date, value: best });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return out;
  }

  /*
   * 種目ごとの自己ベスト。
   * beforeDate を渡すとその日より前の記録のみを対象にする（更新判定用）。
   */
  function personalBest(exerciseId, beforeDate) {
    var state = S.get();
    var best = { weight: 0, e1rm: 0, volume: 0, date: null };
    state.sessions.forEach(function (s) {
      if (beforeDate && s.date >= beforeDate) return;
      s.entries.forEach(function (en) {
        if (en.exerciseId !== exerciseId) return;
        en.sets.forEach(function (st) {
          if (!st.done || st.warmup) return;
          var w = num(st.weight);
          var v = e1RM(st.weight, st.reps);
          var vol = w * num(st.reps);
          if (w > best.weight) { best.weight = w; best.date = s.date; }
          if (v > best.e1rm) best.e1rm = v;
          if (vol > best.volume) best.volume = vol;
        });
      });
    });
    return best;
  }

  function allPersonalBests() {
    var state = S.get();
    var used = {};
    state.sessions.forEach(function (s) {
      s.entries.forEach(function (en) { used[en.exerciseId] = true; });
    });
    return Object.keys(used).map(function (id) {
      var pb = personalBest(id);
      var ex = S.exerciseById(id);
      return {
        id: id,
        name: ex ? ex.name : '削除された種目',
        category: ex ? ex.category : 'other',
        weight: pb.weight,
        e1rm: pb.e1rm,
        date: pb.date
      };
    }).filter(function (x) { return x.e1rm > 0 || x.weight > 0; })
      .sort(function (a, b) { return b.e1rm - a.e1rm; });
  }

  /*
   * そのセットが自己ベスト更新かを判定する。
   * 同一セッション内の先行セットも比較対象に含める。
   */
  function isPRSet(date, exerciseId, set) {
    if (!set.done || set.warmup) return false;
    var v = e1RM(set.weight, set.reps);
    if (v <= 0) return false;
    var pb = personalBest(exerciseId, date);
    if (v <= pb.e1rm) return false;

    // 同日内の他セットに、より高い e1RM がある場合はそちらを優先する
    var en = S.entryOf(date, exerciseId);
    if (en) {
      for (var i = 0; i < en.sets.length; i++) {
        var o = en.sets[i];
        if (o === set || !o.done || o.warmup) continue;
        if (e1RM(o.weight, o.reps) > v) return false;
      }
    }
    return true;
  }

  // 連続トレーニング週数
  function weekStreak() {
    var state = S.get();
    var weeks = {};
    state.sessions.forEach(function (s) {
      if (hasRecord(s)) weeks[weekStart(s.date)] = true;
    });
    var cur = weekStart(S.todayStr());
    var n = 0;
    // 今週まだ実施していない場合は前週から数える
    if (!weeks[cur]) cur = addDays(cur, -7);
    while (weeks[cur]) {
      n++;
      cur = addDays(cur, -7);
    }
    return n;
  }

  function totals() {
    var state = S.get();
    var vol = 0;
    var sets = 0;
    var days = 0;
    state.sessions.forEach(function (s) {
      vol += sessionVolume(s);
      sets += sessionSetCount(s);
      if (hasRecord(s)) days++;
    });
    return { volume: vol, sets: sets, days: days };
  }

  // --- 表示整形 -----------------------------------------------------------

  function fmtVolume(v) {
    if (v >= 10000) return (v / 1000).toFixed(1) + 't';
    return Math.round(v).toLocaleString('ja-JP') + 'kg';
  }

  function fmtNum(v, digits) {
    var d = digits == null ? 1 : digits;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // --- SVGグラフ ----------------------------------------------------------

  /*
   * 棒グラフ。data: [{label, value, sub}]
   * viewBox を使い、幅は CSS 側に委ねる（横スクロールを起こさないため）。
   */
  function barChart(data, opts) {
    var o = opts || {};
    var W = 340;
    var H = o.height || 150;
    var padL = 8, padR = 8, padB = 22, padT = 10;
    if (!data.length) return emptyChart('データがありません');

    var max = Math.max.apply(null, data.map(function (d) { return d.value; }));
    if (max <= 0) max = 1;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var slot = innerW / data.length;
    var bw = Math.max(4, slot * 0.62);

    var bars = data.map(function (d, i) {
      var h = (d.value / max) * innerH;
      var x = padL + slot * i + (slot - bw) / 2;
      var y = padT + innerH - h;
      var color = d.color || 'var(--accent)';
      // 末尾を基準に間引く。先頭基準にすると最終ラベルが隣と重なる
      var step = Math.ceil(data.length / 6);
      var label = (data.length - 1 - i) % step === 0 ? d.label : '';
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.max(h, d.value > 0 ? 1 : 0).toFixed(1) + '" rx="2" fill="' + color + '">' +
        '<title>' + esc(d.label + ' : ' + (d.title || d.value)) + '</title></rect>' +
        (label ? '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) +
          '" class="ax" text-anchor="middle">' + esc(label) + '</text>' : '');
    }).join('');

    var maxLabel = o.maxLabel
      ? '<text x="' + padL + '" y="' + (padT - 1) + '" class="ax">' + esc(o.maxLabel(max)) + '</text>'
      : '';

    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(o.aria || '棒グラフ') + '">' +
      '<line x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (W - padR) + '" y2="' + (padT + innerH) + '" class="axis"/>' +
      bars + maxLabel + '</svg>';
  }

  /*
   * 折れ線グラフ。data: [{label, value}]
   */
  function lineChart(data, opts) {
    var o = opts || {};
    var W = 340;
    var H = o.height || 150;
    var padL = 30, padR = 10, padB = 22, padT = 12;
    if (data.length === 0) return emptyChart('データがありません');
    if (data.length === 1) {
      return emptyChart('記録が2件以上になると推移を表示します');
    }

    var vals = data.map(function (d) { return d.value; });
    var max = Math.max.apply(null, vals);
    var min = Math.min.apply(null, vals);
    if (max === min) { max = max + 1; min = Math.max(0, min - 1); }
    var pad = (max - min) * 0.1;
    max += pad; min -= pad;

    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var pts = data.map(function (d, i) {
      var x = padL + (innerW * i) / (data.length - 1);
      var y = padT + innerH - ((d.value - min) / (max - min)) * innerH;
      return { x: x, y: y, d: d };
    });

    var path = pts.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
    }).join(' ');

    var area = path + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (padT + innerH) +
      ' L' + pts[0].x.toFixed(1) + ' ' + (padT + innerH) + ' Z';

    var dots = pts.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.5" class="dot">' +
        '<title>' + esc(p.d.label + ' : ' + (p.d.title || fmtNum(p.d.value))) + '</title></circle>';
    }).join('');

    var labels = '<text x="2" y="' + (padT + 4) + '" class="ax">' + esc(fmtNum(max, 0)) + '</text>' +
      '<text x="2" y="' + (padT + innerH) + '" class="ax">' + esc(fmtNum(min, 0)) + '</text>' +
      '<text x="' + padL + '" y="' + (H - 6) + '" class="ax">' + esc(data[0].label) + '</text>' +
      '<text x="' + (W - padR) + '" y="' + (H - 6) + '" class="ax" text-anchor="end">' +
      esc(data[data.length - 1].label) + '</text>';

    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(o.aria || '折れ線グラフ') + '">' +
      '<path d="' + area + '" class="area"/>' +
      '<path d="' + path + '" class="line"/>' + dots + labels + '</svg>';
  }

  function emptyChart(msg) {
    return '<div class="chart-empty">' + esc(msg) + '</div>';
  }

  /*
   * 構成比の横バー。data: [{label, value, color}]
   */
  function stackedBar(data) {
    if (!data.length) return emptyChart('データがありません');
    var total = data.reduce(function (a, d) { return a + d.value; }, 0);
    if (total <= 0) return emptyChart('データがありません');
    var segs = data.map(function (d) {
      var pct = (d.value / total) * 100;
      return '<span class="seg" style="width:' + pct.toFixed(2) + '%;background:' + d.color +
        '" title="' + esc(d.label + ' ' + pct.toFixed(1) + '%') + '"></span>';
    }).join('');
    var legend = data.map(function (d) {
      var pct = (d.value / total) * 100;
      return '<li><i style="background:' + d.color + '"></i>' + esc(d.label) +
        '<b>' + pct.toFixed(0) + '%</b><span>' + fmtVolume(d.value) + '</span></li>';
    }).join('');
    return '<div class="stack">' + segs + '</div><ul class="legend">' + legend + '</ul>';
  }

  global.ILCalc = {
    e1RM: e1RM,
    setVolume: setVolume,
    entryVolume: entryVolume,
    sessionVolume: sessionVolume,
    hasRecord: hasRecord,
    sessionSetCount: sessionSetCount,
    weeklyVolume: weeklyVolume,
    volumeByCategory: volumeByCategory,
    e1rmSeries: e1rmSeries,
    personalBest: personalBest,
    allPersonalBests: allPersonalBests,
    isPRSet: isPRSet,
    weekStreak: weekStreak,
    totals: totals,
    parseDate: parseDate,
    fmt: fmt,
    addDays: addDays,
    weekStart: weekStart,
    fmtVolume: fmtVolume,
    fmtNum: fmtNum,
    esc: esc,
    barChart: barChart,
    lineChart: lineChart,
    stackedBar: stackedBar,
    emptyChart: emptyChart
  };
})(window);
