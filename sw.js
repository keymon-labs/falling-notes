/* Служебный скрипт офлайн-режима.

   Стратегия «сеть вперёд с тайм-аутом»: пока сеть отвечает быстро — свежая
   версия; молчит, тормозит или отдаёт ошибку — берём копию из кэша.
   Молчащий Wi-Fi (гостиница, портал с авторизацией) не должен превращаться
   в пустой экран на полминуты, поэтому ждём сеть ограниченное время.

   При обновлении приложения поднимите VERSION — старый кэш удалится сам. */
'use strict';

var VERSION = 'v3';
var PREFIX = 'falling-notes-';
var CACHE = PREFIX + VERSION;
var NET_TIMEOUT_MS = 2500;

var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

/* addAll — всё или ничего: одна недоступная иконка убила бы офлайн целиком.
   Кладём по одному и не падаем из-за второстепенных файлов. */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* Удаляем только свои прошлые версии: Cache Storage общий на весь домен,
   а на GitHub Pages рядом могут жить другие проекты того же аккаунта. */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return (k.indexOf(PREFIX) === 0 && k !== CACHE) ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Подставлять index.html вместо промаха можно только для переходов по страницам.
   Иначе на запрос иконки вернётся HTML со статусом 200 — и картинка «сломается»
   загадочно, вместо честной 404. */
function fromCache(request) {
  return caches.match(request).then(function (hit) {
    if (hit) return hit;
    if (request.mode === 'navigate') return caches.match('./index.html');
    return null;
  });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    new Promise(function (resolve) {
      var settled = false;
      function done(resp) {
        if (settled) return;
        settled = true;
        resolve(resp);
      }

      var timer = setTimeout(function () {
        fromCache(e.request).then(function (hit) { if (hit) done(hit); });
      }, NET_TIMEOUT_MS);

      /* GitHub Pages отдаёт статику с Cache-Control: max-age=600, и обычный
         fetch спокойно берёт страницу из кэша браузера — обновление не доезжает
         до устройства. Для переходов по страницам просим в обход кэша. */
      var req = e.request;
      if (req.mode === 'navigate') {
        try { req = new Request(e.request, { cache: 'reload' }); } catch (err) { req = e.request; }
      }

      fetch(req).then(function (resp) {
        clearTimeout(timer);
        // Ответ есть, но это ошибка (404 во время переразвёртывания Pages,
        // 500 и прочее) — рабочая копия из кэша полезнее страницы ошибки
        if (!resp || !resp.ok) {
          fromCache(e.request).then(function (hit) { done(hit || resp); });
          return;
        }
        if (resp.type === 'basic') {
          var copy = resp.clone();
          var write = caches.open(CACHE)
            .then(function (c) { return c.put(e.request, copy); })
            .catch(function () { /* нет места — не беда, отдадим и так */ });
          // Если ответ уже отдан по тайм-ауту, событие неактивно и waitUntil
          // бросает InvalidStateError. Запись всё равно идёт, шуметь не о чем.
          try { e.waitUntil(write); } catch (inactive) { /* ожидаемо */ }
        }
        done(resp);
      }).catch(function () {
        clearTimeout(timer);
        fromCache(e.request).then(function (hit) {
          done(hit || new Response('Нет сети и нет копии в памяти устройства.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          }));
        });
      });
    })
  );
});
