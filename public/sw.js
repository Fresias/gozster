// GOZSter Service Worker (PWA Push Notifications & Offline-First)
const CACHE_NAME = 'gozs-shell-v1';
const PRECACHE_URLS = ['/manifest.json', '/icon-192.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .finally(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('gozs-shell-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isExcludedPath(pathname) {
  return (
    pathname.startsWith('/api/') ||
    pathname === '/api' ||
    pathname.startsWith('/auth/') ||
    pathname === '/auth' ||
    pathname.startsWith('/rest/') ||
    pathname === '/rest' ||
    pathname.includes('supabase')
  );
}

function isStaticAssetPath(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.png') ||
    pathname === '/manifest.json'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isExcludedPath(url.pathname)) return;

  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response && response.ok && response.type === 'basic') {
              cache.put(request, response.clone());
            }
            return response;
          });
          if (cached) {
            networkFetch.catch(() => {});
            return cached;
          }
          return networkFetch;
        })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === 'basic' && !response.redirected) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(async () => {
            const cached = await cache.match(request);
            if (cached) return cached;
            if (url.pathname.startsWith('/athlete')) {
              const shell = await cache.match('/athlete');
              if (shell) return shell;
            }
            return Response.error();
          })
      )
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'GOZSter Coach';
  const options = {
    body: data.body || 'Nuevo mensaje de tu entrenador.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge.png',
    data: {
      url: data.url || '/athlete',
    },
    tag: data.tag || 'gozs-chat-notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/athlete';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/athlete') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
