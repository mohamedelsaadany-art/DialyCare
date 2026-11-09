// DialyCare Service Worker
// Provides offline resilience, precaching, network-first strategy, and push notifications

const CACHE_NAME = 'dialycare-v1';
const PRECACHE_ASSETS = [
  '/',
  '/en/patient',
  '/ar/patient',
  '/en',
  '/ar',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// 1. Install event: Precache core assets and skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Use Promise.allSettled so a single missing optional asset doesn't break installation
        await Promise.allSettled(
          PRECACHE_ASSETS.map((asset) =>
            cache.add(asset).catch((err) => {
              console.warn('[DialyCare SW] Precache failed for:', asset, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate event: Claim clients immediately and clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('[DialyCare SW] Removing legacy cache:', key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. Fetch event: Network-first strategy with cache fallback
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests with HTTP / HTTPS schemes
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) return;

  const url = new URL(request.url);

  // Avoid caching Firebase backend streaming, Firestore webchannels, and external APIs
  const isApiOrBackend =
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase');

  if (isApiOrBackend) {
    return; // Pass through to network directly without service worker caching
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Cache successful basic responses (status 200)
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseToCache);
            })
            .catch(() => {
              // Ignore cache put errors
            });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Network failed or offline: fallback to cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // For navigation requests, fallback to patient home or root shell
        if (request.mode === 'navigate') {
          const fallbackCandidates = [
            request.url,
            '/en/patient',
            '/ar/patient',
            '/en',
            '/',
          ];

          for (const candidate of fallbackCandidates) {
            const fallback = await caches.match(candidate);
            if (fallback) return fallback;
          }
        }

        return new Response('Offline - No connection', {
          status: 503,
          statusText: 'Service Unavailable (Offline)',
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
        });
      })
  );
});

// 4. Push event: Listen for web push notifications
self.addEventListener('push', (event) => {
  let data = {
    title: 'DialyCare Reminder',
    body: 'You have a new medication or fluid check reminder.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    url: '/en/patient',
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload && typeof payload === 'object') {
        data = { ...data, ...payload };
      } else if (typeof payload === 'string') {
        data.body = payload;
      }
    } catch {
      data.body = event.data.text();
    }
  }

  const title = data.title || 'DialyCare';
  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    data: {
      url: data.url || '/en/patient',
      ...data,
    },
    tag: data.tag || 'dialycare-reminder',
    renotify: true,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. Notificationclick event: Focus existing window or open target URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || '/en/patient';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. Check if a tab matching the target URL is already open
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }

      // 2. If any client is open within the same origin, navigate and focus
      for (const client of clientList) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(targetUrl).then((c) => c?.focus?.());
        }
      }

      // 3. Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
