/* Iron Log - Service Worker（オフライン動作） */

/*
 * アプリを更新したら必ずこの名前を上げること。
 * 上げ忘れると、すでに開いたことのある利用者には古い版が配られ続ける。
 */
var CACHE = 'ironlog-v4';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/store.js',
  './js/calc.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/*
 * ネットワーク優先、失敗時にキャッシュ。
 *
 * 以前は cache-first にしていたが、その場合キャッシュ名を上げない限り
 * 修正が既存利用者に永久に届かない。アプリ本体は数十KBしかないため、
 * 通信できるときは取りに行き、圏外ではキャッシュで動かす方が実態に合う。
 * ジムの電波不良でもオフライン動作は保たれる。
 */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
