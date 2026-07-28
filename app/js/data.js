/* Iron Log - プリセットデータと定数 */
(function (global) {
  'use strict';

  // 部位カテゴリ。色は分析画面の構成比バーで使う
  var CATEGORIES = [
    { id: 'chest', label: '胸', color: '#e2574c' },
    { id: 'back', label: '背中', color: '#3f7fd4' },
    { id: 'legs', label: '脚', color: '#2f9e6f' },
    { id: 'shoulders', label: '肩', color: '#d9902b' },
    { id: 'arms', label: '腕', color: '#8b5cc7' },
    { id: 'core', label: '体幹', color: '#4aa8b8' },
    { id: 'cardio', label: '有酸素', color: '#7a8590' }
  ];

  // 計測型
  // weight_reps    : 重量 × 回数
  // bodyweight_reps: 自重 × 回数（加重分のみ weight に入力）
  // time           : 秒数のみ
  var TYPES = [
    { id: 'weight_reps', label: '重量×回数' },
    { id: 'bodyweight_reps', label: '自重×回数' },
    { id: 'time', label: '時間' }
  ];

  /*
   * 器具。部位とは独立した軸として持つ。
   * 同じ部位でも自重かバーベルかで別種目として記録したいため、
   * カテゴリを増やすのではなくこの軸で区別する。
   */
  var EQUIPMENT = [
    { id: 'bw', label: '自重' },
    { id: 'free', label: 'フリーウェイト' },
    { id: 'machine', label: 'マシン' },
    { id: 'other', label: 'その他' }
  ];

  function ex(id, name, category, type, equip) {
    return {
      id: 'ex_' + id,
      name: name,
      category: category,
      type: type || 'weight_reps',
      equip: equip || 'free',
      archived: false,
      custom: false
    };
  }

  var PRESET_EXERCISES = [
    // 胸
    ex('bench_press', 'ベンチプレス', 'chest', 'weight_reps', 'free'),
    ex('incline_bench_press', 'インクラインベンチプレス', 'chest', 'weight_reps', 'free'),
    ex('decline_bench_press', 'デクラインベンチプレス', 'chest', 'weight_reps', 'free'),
    ex('dumbbell_press', 'ダンベルプレス', 'chest', 'weight_reps', 'free'),
    ex('dumbbell_fly', 'ダンベルフライ', 'chest', 'weight_reps', 'free'),
    ex('chest_press_machine', 'チェストプレス', 'chest', 'weight_reps', 'machine'),
    ex('pec_fly_machine', 'ペックフライ', 'chest', 'weight_reps', 'machine'),
    ex('push_up', 'プッシュアップ', 'chest', 'bodyweight_reps', 'bw'),
    ex('dips', 'ディップス', 'chest', 'bodyweight_reps', 'bw'),

    // 背中
    ex('deadlift', 'デッドリフト', 'back', 'weight_reps', 'free'),
    ex('bent_over_row', 'ベントオーバーロウ', 'back', 'weight_reps', 'free'),
    ex('dumbbell_row', 'ワンハンドダンベルロウ', 'back', 'weight_reps', 'free'),
    ex('lat_pulldown', 'ラットプルダウン', 'back', 'weight_reps', 'machine'),
    ex('seated_row', 'シーテッドロウ', 'back', 'weight_reps', 'machine'),
    ex('pull_up', '懸垂（プルアップ）', 'back', 'bodyweight_reps', 'bw'),
    ex('chin_up', 'チンニング（逆手）', 'back', 'bodyweight_reps', 'bw'),
    ex('inverted_row', '斜め懸垂（インバーテッドロウ）', 'back', 'bodyweight_reps', 'bw'),
    ex('t_bar_row', 'Tバーロウ', 'back', 'weight_reps', 'free'),
    ex('back_extension', 'バックエクステンション', 'back', 'bodyweight_reps', 'bw'),
    ex('shrug', 'シュラッグ', 'back', 'weight_reps', 'free'),

    // 脚
    ex('bodyweight_squat', '自重スクワット', 'legs', 'bodyweight_reps', 'bw'),
    ex('squat', 'スクワット（バーベル）', 'legs', 'weight_reps', 'free'),
    ex('front_squat', 'フロントスクワット', 'legs', 'weight_reps', 'free'),
    ex('leg_press', 'レッグプレス', 'legs', 'weight_reps', 'machine'),
    ex('leg_extension', 'レッグエクステンション', 'legs', 'weight_reps', 'machine'),
    ex('leg_curl', 'レッグカール', 'legs', 'weight_reps', 'machine'),
    ex('romanian_deadlift', 'ルーマニアンデッドリフト', 'legs', 'weight_reps', 'free'),
    ex('bulgarian_squat', 'ブルガリアンスクワット', 'legs', 'weight_reps', 'free'),
    ex('lunge', 'ランジ', 'legs', 'weight_reps', 'free'),
    ex('calf_raise', 'カーフレイズ', 'legs', 'weight_reps', 'free'),
    ex('hip_thrust', 'ヒップスラスト', 'legs', 'weight_reps', 'free'),
    ex('hip_lift', 'ヒップリフト', 'legs', 'bodyweight_reps', 'bw'),

    // 肩
    ex('shoulder_press', 'ショルダープレス', 'shoulders', 'weight_reps', 'free'),
    ex('military_press', 'ミリタリープレス', 'shoulders', 'weight_reps', 'free'),
    ex('side_raise', 'サイドレイズ', 'shoulders', 'weight_reps', 'free'),
    ex('front_raise', 'フロントレイズ', 'shoulders', 'weight_reps', 'free'),
    ex('rear_raise', 'リアレイズ', 'shoulders', 'weight_reps', 'free'),
    ex('upright_row', 'アップライトロウ', 'shoulders', 'weight_reps', 'free'),
    ex('face_pull', 'フェイスプル', 'shoulders', 'weight_reps', 'machine'),
    ex('pike_push_up', 'パイクプッシュアップ', 'shoulders', 'bodyweight_reps', 'bw'),

    // 腕
    ex('barbell_curl', 'バーベルカール', 'arms', 'weight_reps', 'free'),
    ex('dumbbell_curl', 'ダンベルカール', 'arms', 'weight_reps', 'free'),
    ex('hammer_curl', 'ハンマーカール', 'arms', 'weight_reps', 'free'),
    ex('incline_curl', 'インクラインカール', 'arms', 'weight_reps', 'free'),
    ex('triceps_pushdown', 'トライセプスプレスダウン', 'arms', 'weight_reps', 'machine'),
    ex('french_press', 'フレンチプレス', 'arms', 'weight_reps', 'free'),
    ex('kickback', 'キックバック', 'arms', 'weight_reps', 'free'),
    ex('narrow_bench_press', 'ナローベンチプレス', 'arms', 'weight_reps', 'free'),

    // 体幹
    ex('plank', 'プランク', 'core', 'time', 'bw'),
    ex('side_plank', 'サイドプランク', 'core', 'time', 'bw'),
    ex('crunch', 'クランチ', 'core', 'bodyweight_reps', 'bw'),
    ex('leg_raise', 'レッグレイズ', 'core', 'bodyweight_reps', 'bw'),
    ex('hanging_leg_raise', 'ハンギングレッグレイズ', 'core', 'bodyweight_reps', 'bw'),
    ex('ab_roller', 'アブローラー', 'core', 'bodyweight_reps', 'other'),
    ex('russian_twist', 'ロシアンツイスト', 'core', 'weight_reps', 'free'),

    // 有酸素
    ex('treadmill', 'トレッドミル', 'cardio', 'time', 'machine'),
    ex('bike', 'エアロバイク', 'cardio', 'time', 'machine'),
    ex('rowing', 'ローイングマシン', 'cardio', 'time', 'machine')
  ];

  // 初期ルーティン。数値を持たない項目は、展開時に前回の記録から補われる
  function item(id) {
    return { exerciseId: id, sets: null, reps: null, weight: null };
  }

  var PRESET_ROUTINES = [
    { id: 'rt_push', name: 'プッシュ（胸・肩・三頭）', items: ['ex_bench_press', 'ex_incline_bench_press', 'ex_shoulder_press', 'ex_side_raise', 'ex_triceps_pushdown'].map(item) },
    { id: 'rt_pull', name: 'プル（背中・二頭）', items: ['ex_deadlift', 'ex_lat_pulldown', 'ex_seated_row', 'ex_dumbbell_curl', 'ex_face_pull'].map(item) },
    { id: 'rt_legs', name: 'レッグ（脚・体幹）', items: ['ex_squat', 'ex_leg_press', 'ex_leg_curl', 'ex_calf_raise', 'ex_plank'].map(item) },
    { id: 'rt_full', name: 'フルボディ（週2回向け）', items: ['ex_squat', 'ex_bench_press', 'ex_bent_over_row', 'ex_shoulder_press', 'ex_ab_roller'].map(item) }
  ];

  /*
   * 器具紹介枠。
   * Amazonアソシエイト（タグ jpgo-22）の導線として設計画面 9 章の方針に従う。
   * 実際に使用し、かつ価格・型番を確認した商品のみをここに追加すること。
   * 未確認の商品を並べることはプロジェクトの厳守事項に反するため、初期状態は空とする。
   *
   * 形式:
   * { name: '商品名', asin: 'XXXXXXXXXX', note: '実際に使った上での一言' }
   */
  var GEAR = [];

  var AMAZON_TAG = 'jpgo-22';

  // 記事導線。公開後にURLを設定する（空文字の間は非表示）
  var ARTICLE_URL = '';
  var AUTHOR_URL = 'https://note.com/pine_mountain_jp';

  global.ILData = {
    CATEGORIES: CATEGORIES,
    TYPES: TYPES,
    EQUIPMENT: EQUIPMENT,
    equipmentById: function (id) {
      for (var i = 0; i < EQUIPMENT.length; i++) {
        if (EQUIPMENT[i].id === id) return EQUIPMENT[i];
      }
      return { id: 'other', label: 'その他' };
    },
    PRESET_EXERCISES: PRESET_EXERCISES,
    PRESET_ROUTINES: PRESET_ROUTINES,
    GEAR: GEAR,
    AMAZON_TAG: AMAZON_TAG,
    ARTICLE_URL: ARTICLE_URL,
    AUTHOR_URL: AUTHOR_URL,
    categoryById: function (id) {
      for (var i = 0; i < CATEGORIES.length; i++) {
        if (CATEGORIES[i].id === id) return CATEGORIES[i];
      }
      return { id: id, label: 'その他', color: '#7a8590' };
    }
  };
})(window);
