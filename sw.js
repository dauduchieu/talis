// Bump this when the app shell changes; old shells are removed on activate.
const CACHE_NAME = "talis-shell-v2"
const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./swipe.js",
    "./manifest.json",
    "./assets/icon-512.png"
]

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    )
})

self.addEventListener("message", event => {
    if (event.data?.type === "SKIP_WAITING") self.skipWaiting()
})

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    )
})

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached && event.request.cache !== "reload") return cached
            return fetch(event.request).then(response => {
                if (response?.status === 200 && response.type === "basic") {
                    const copy = response.clone()
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))
                }
                return response
            }).catch(() => {
                if (cached) return cached
                if (event.request.mode === "navigate") return caches.match("./index.html")
                return Response.error()
            })
        })
    )
})
