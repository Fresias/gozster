import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { metadata } from "@/app/layout";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import * as pushNotifications from "@/lib/push-notifications";

const ROOT_DIR = path.resolve(__dirname, "../..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

function createSwSandbox(fetchMock: ReturnType<typeof vi.fn>) {
  const listeners = new Map<string, (event: any) => void>();
  const cacheStores = new Map<string, Map<string, Response>>();

  const getOrCreateStore = (name: string) => {
    let store = cacheStores.get(name);
    if (!store) {
      store = new Map<string, Response>();
      cacheStores.set(name, store);
    }
    return {
      add: vi.fn(async (url: string) => {
        const res = await fetchMock(url);
        if (!res || !res.ok) throw new Error(`Failed to fetch ${url}`);
        store!.set(url, res);
      }),
      match: vi.fn(async (req: Request | string) => {
        const key = typeof req === "string" ? req : new URL(req.url).pathname;
        return store!.get(key);
      }),
      put: vi.fn(async (req: Request | string, res: Response) => {
        const key = typeof req === "string" ? req : new URL(req.url).pathname;
        store!.set(key, res);
      }),
    };
  };

  const cachesMock = {
    open: vi.fn(async (name: string) => getOrCreateStore(name)),
    keys: vi.fn(async () => Array.from(cacheStores.keys())),
    delete: vi.fn(async (name: string) => cacheStores.delete(name)),
  };

  const selfMock: Record<string, any> = {
    location: { origin: "https://gozster.app" },
    skipWaiting: vi.fn(async () => undefined),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => []),
      openWindow: vi.fn(async () => undefined),
    },
    registration: {
      showNotification: vi.fn(async () => undefined),
    },
    addEventListener: (type: string, handler: (event: any) => void) => {
      listeners.set(type, handler);
    },
  };

  const swCode = fs.readFileSync(path.join(PUBLIC_DIR, "sw.js"), "utf-8");
  const context = vm.createContext({
    self: selfMock,
    caches: cachesMock,
    clients: selfMock.clients,
    fetch: fetchMock,
    URL,
    Response,
    Request,
    Promise,
  });
  vm.runInContext(swCode, context);

  return { listeners, cacheStores, cachesMock, selfMock };
}

describe("GOZS-613: PWA manifest, metadata appleWebApp, ServiceWorkerRegister y sw.js offline", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. public/manifest.json", () => {
    it("declara display standalone, id, scope y los 3 íconos apuntando a archivos existentes en public/", () => {
      const manifestPath = path.join(PUBLIC_DIR, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      expect(manifest.display).toBe("standalone");
      expect(manifest.id).toBe("/athlete");
      expect(manifest.scope).toBe("/");
      expect(manifest.start_url).toBe("/athlete");
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons).toHaveLength(3);

      expect(manifest.icons).toEqual(
        expect.arrayContaining([
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ]),
      );

      for (const icon of manifest.icons) {
        const filePath = path.join(PUBLIC_DIR, icon.src.replace(/^\//, ""));
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });
  });

  describe("2. src/app/layout.tsx & ServiceWorkerRegister", () => {
    it("exporta metadata.appleWebApp (capable: true), other.apple-mobile-web-app-capable, icons.apple (/apple-touch-icon.png) y monta ServiceWorkerRegister", () => {
      expect(metadata.manifest).toBe("/manifest.json");
      expect(metadata.appleWebApp).toEqual({
        capable: true,
        title: "GOZSter",
        statusBarStyle: "black-translucent",
      });
      expect(metadata.other?.["apple-mobile-web-app-capable"]).toBe("yes");

      const icons = metadata.icons as {
        icon?: Array<{ url: string; sizes?: string; type?: string }>;
        apple?: Array<{ url: string; sizes?: string; type?: string }>;
      };
      expect(icons?.apple).toEqual([
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ]);
      expect(icons?.icon).toEqual([
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ]);
      expect(fs.existsSync(path.join(PUBLIC_DIR, "apple-touch-icon.png"))).toBe(true);

      const layoutSource = fs.readFileSync(
        path.join(ROOT_DIR, "src/app/layout.tsx"),
        "utf-8",
      );
      expect(layoutSource).toContain("ServiceWorkerRegister");
      expect(layoutSource).toContain("<ServiceWorkerRegister />");
    });

    async function runServiceWorkerRegisterMount(nodeEnv: string) {
      vi.stubEnv("NODE_ENV", nodeEnv);
      const registerMock = vi.fn().mockResolvedValue({ scope: "/" });
      const requestPermissionMock = vi.fn();
      const registerSpy = vi.spyOn(pushNotifications, "registerServiceWorker");

      const originalWindow = (globalThis as any).window;
      const originalNavigator = globalThis.navigator;
      const originalNotification = (globalThis as any).Notification;

      (globalThis as any).window = {};
      Object.defineProperty(globalThis, "navigator", {
        value: { serviceWorker: { register: registerMock } },
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, "Notification", {
        value: { permission: "default", requestPermission: requestPermissionMock },
        configurable: true,
        writable: true,
      });

      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const prevDispatcher = internals.H;
      const pendingEffects: Array<() => void> = [];
      internals.H = {
        useEffect: (cb: () => void) => {
          pendingEffects.push(cb);
        },
      };

      try {
        const rendered = ServiceWorkerRegister();
        expect(rendered).toBeNull();
        for (const runEffect of pendingEffects) {
          runEffect();
        }
        await Promise.resolve();
        return { registerMock, requestPermissionMock, registerSpy };
      } finally {
        internals.H = prevDispatcher;
        vi.unstubAllEnvs();
        if (originalWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          (globalThis as any).window = originalWindow;
        }
        Object.defineProperty(globalThis, "navigator", {
          value: originalNavigator,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(globalThis, "Notification", {
          value: originalNotification,
          configurable: true,
          writable: true,
        });
      }
    }

    it("ServiceWorkerRegister invoca registerServiceWorker() al montarse en producción sin pedir permisos de notificación", async () => {
      const { registerMock, requestPermissionMock, registerSpy } =
        await runServiceWorkerRegisterMount("production");

      expect(registerSpy).toHaveBeenCalledTimes(1);
      expect(registerMock).toHaveBeenCalledWith("/sw.js", { scope: "/" });
      expect(requestPermissionMock).not.toHaveBeenCalled();
    });

    it("ServiceWorkerRegister NO invoca registerServiceWorker() cuando NODE_ENV !== 'production'", async () => {
      const { registerMock, registerSpy } =
        await runServiceWorkerRegisterMount("development");

      expect(registerSpy).not.toHaveBeenCalled();
      expect(registerMock).not.toHaveBeenCalled();
    });
  });

  describe("3. public/sw.js (push, notificationclick y estrategia offline segura)", () => {
    it("conserva listeners push y notificationclick y registra install, activate y fetch", () => {
      const fetchMock = vi.fn();
      const { listeners } = createSwSandbox(fetchMock);

      expect(listeners.has("install")).toBe(true);
      expect(listeners.has("activate")).toBe(true);
      expect(listeners.has("fetch")).toBe(true);
      expect(listeners.has("push")).toBe(true);
      expect(listeners.has("notificationclick")).toBe(true);
    });

    it("en install pre-cachea íconos esenciales sin fallar si un asset opcional falla", async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url === "/apple-touch-icon.png") {
          throw new Error("Transient error");
        }
        return new Response("ok", { status: 200 });
      });
      const { listeners, cacheStores, selfMock } = createSwSandbox(fetchMock);

      let waitPromise: Promise<unknown> | undefined;
      listeners.get("install")!({
        waitUntil: (p: Promise<unknown>) => {
          waitPromise = p;
        },
      });
      await waitPromise;

      const shellCache = cacheStores.get("gozs-shell-v1");
      expect(shellCache).toBeDefined();
      expect(shellCache!.has("/manifest.json")).toBe(true);
      expect(shellCache!.has("/icon-192.png")).toBe(true);
      expect(selfMock.skipWaiting).toHaveBeenCalledTimes(1);
    });

    it("en activate limpia caches viejos gozs-shell-* y llama clients.claim()", async () => {
      const fetchMock = vi.fn();
      const { listeners, cacheStores, selfMock } = createSwSandbox(fetchMock);

      cacheStores.set("gozs-shell-v0", new Map());
      cacheStores.set("gozs-shell-v1", new Map());
      cacheStores.set("unrelated-cache", new Map());

      let waitPromise: Promise<unknown> | undefined;
      listeners.get("activate")!({
        waitUntil: (p: Promise<unknown>) => {
          waitPromise = p;
        },
      });
      await waitPromise;

      expect(cacheStores.has("gozs-shell-v0")).toBe(false);
      expect(cacheStores.has("gozs-shell-v1")).toBe(true);
      expect(cacheStores.has("unrelated-cache")).toBe(true);
      expect(selfMock.clients.claim).toHaveBeenCalledTimes(1);
    });

    it("excluye del caché /api/, /auth/, /rest/, Supabase, POST y orígenes externos", () => {
      const fetchMock = vi.fn();
      const { listeners } = createSwSandbox(fetchMock);
      const onFetch = listeners.get("fetch")!;

      const excludedRequests = [
        { url: "https://gozster.app/api/health", method: "GET", mode: "cors" },
        { url: "https://gozster.app/auth/callback", method: "GET", mode: "navigate" },
        { url: "https://gozster.app/rest/v1/rutinas", method: "GET", mode: "cors" },
        { url: "https://gozster.app/supabase/storage", method: "GET", mode: "cors" },
        { url: "https://xyz.supabase.co/rest/v1/series", method: "GET", mode: "cors" },
        { url: "https://cdn.external.dev/icon-192.png", method: "GET", mode: "cors" },
        { url: "https://gozster.app/athlete", method: "POST", mode: "cors" },
      ];

      for (const req of excludedRequests) {
        const respondWith = vi.fn();
        onFetch({ request: req, respondWith });
        expect(respondWith).not.toHaveBeenCalled();
      }
    });

    it("sirve navegaciones a /athlete network-first y cae al shell cacheado en modo offline", async () => {
      let isOnline = true;
      const fetchMock = vi.fn(async () => {
        if (!isOnline) throw new Error("Network offline");
        return {
          ok: true,
          type: "basic",
          redirected: false,
          status: 200,
          text: async () => "<html>Athlete Shell</html>",
          clone() {
            return this;
          },
        } as unknown as Response;
      });
      const { listeners } = createSwSandbox(fetchMock);
      const onFetch = listeners.get("fetch")!;

      const navRequest = {
        url: "https://gozster.app/athlete",
        method: "GET",
        mode: "navigate",
      };

      let onlinePromise: Promise<Response> | undefined;
      onFetch({
        request: navRequest,
        respondWith: (p: Promise<Response>) => {
          onlinePromise = p;
        },
      });
      const onlineRes = await onlinePromise!;
      expect(await onlineRes.text()).toBe("<html>Athlete Shell</html>");

      // Sin señal: cae al shell cacheado
      isOnline = false;
      let offlinePromise: Promise<Response> | undefined;
      onFetch({
        request: navRequest,
        respondWith: (p: Promise<Response>) => {
          offlinePromise = p;
        },
      });
      const offlineRes = await offlinePromise!;
      expect(offlineRes.status).toBe(200);
      expect(await offlineRes.text()).toBe("<html>Athlete Shell</html>");
    });

    it("usa caché stale-while-revalidate para /_next/static/, .woff2 y PNGs", async () => {
      let fetchCalls = 0;
      const fetchMock = vi.fn(async (req: Request | string) => {
        fetchCalls += 1;
        const url = typeof req === "string" ? req : req.url;
        return {
          ok: true,
          type: "basic",
          status: 200,
          bodyText: `asset:${url}#${fetchCalls}`,
          clone() {
            return this;
          },
        } as unknown as Response;
      });
      const { listeners, cacheStores } = createSwSandbox(fetchMock);
      const onFetch = listeners.get("fetch")!;

      for (const assetPath of ["/_next/static/chunks/app.js", "/fonts/inter.woff2", "/icon-512.png"]) {
        let p1: Promise<Response> | undefined;
        onFetch({
          request: { url: `https://gozster.app${assetPath}`, method: "GET", mode: "no-cors" },
          respondWith: (p: Promise<Response>) => {
            p1 = p;
          },
        });
        await p1;
        expect(cacheStores.get("gozs-shell-v1")?.has(assetPath)).toBe(true);
      }
    });
  });
});
