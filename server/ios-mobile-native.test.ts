import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  api: vi.fn(),
  pushListeners: new Map<string, (...args: any[]) => unknown>(),
  nativeListeners: new Map<string, (...args: any[]) => unknown>(),
  appStateHandler: null as null | ((state: { isActive: boolean }) => void),
  localSchedule: vi.fn(),
  pushRegister: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
    isNativePlatform: () => true,
  },
  registerPlugin: () => ({
    getCapabilities: vi.fn().mockResolvedValue({
      firebaseConfigured: true,
      apnsAvailable: true,
      voipAvailable: true,
    }),
    getBackgroundCallSupport: vi.fn().mockResolvedValue({
      manufacturer: "Apple",
      harmonyCompatible: false,
      batteryOptimizationIgnored: true,
    }),
    requestBackgroundCallExemption: vi.fn().mockResolvedValue({
      manufacturer: "Apple",
      harmonyCompatible: false,
      batteryOptimizationIgnored: true,
    }),
    openBackgroundCallSettings: vi.fn().mockResolvedValue({ opened: true }),
    requestPermissions: vi
      .fn()
      .mockResolvedValue({ camera: true, microphone: true }),
    playAlertSound: vi.fn().mockResolvedValue({ playing: true }),
    stopAlertSound: vi.fn().mockResolvedValue(undefined),
    setCallAudioRoute: vi
      .fn()
      .mockResolvedValue({ speaker: false, applied: true }),
    endCallAudioSession: vi.fn().mockResolvedValue(undefined),
    startCallListener: vi.fn().mockResolvedValue({ running: true }),
    stopCallListener: vi.fn().mockResolvedValue(undefined),
    clearCallListenerAlert: vi.fn().mockResolvedValue(undefined),
    getPendingCall: vi.fn().mockResolvedValue({ available: false }),
    getVoipToken: vi
      .fn()
      .mockResolvedValue({ token: "v".repeat(64), available: true }),
    addListener: vi.fn(
      async (name: string, listener: (...args: any[]) => unknown) => {
        fakes.nativeListeners.set(name, listener);
        return { remove: vi.fn() };
      }
    ),
  }),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    getState: vi.fn().mockResolvedValue({ isActive: true }),
    addListener: vi.fn(
      async (
        _name: string,
        listener: (state: { isActive: boolean }) => void
      ) => {
        fakes.appStateHandler = listener;
        return { remove: vi.fn() };
      }
    ),
  },
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: vi.fn(
      async (name: string, listener: (...args: any[]) => unknown) => {
        fakes.pushListeners.set(name, listener);
        return { remove: vi.fn() };
      }
    ),
    checkPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(),
    register: fakes.pushRegister,
    unregister: vi.fn(),
  },
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    addListener: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(),
    schedule: fakes.localSchedule,
  },
}));

vi.mock("../client/src/lib/echat-api", () => ({
  api: fakes.api,
  getDeviceId: () => "ios-test-device",
}));

import {
  getNativePushState,
  notifyIncomingEvent,
  registerNativePush,
} from "../client/src/lib/mobile-native";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

class TestCustomEvent<T> extends Event {
  readonly detail: T;
  constructor(type: string, init: { detail: T }) {
    super(type);
    this.detail = init.detail;
  }
}

describe("iOS native push and CallKit bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.pushListeners.clear();
    fakes.appStateHandler = null;
    fakes.pushRegister.mockResolvedValue(undefined);
    fakes.api.mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (path === "/api/push/status")
          return {
            enabled: true,
            provider: "Apple Push Notification service",
            androidEnabled: false,
            iosEnabled: true,
          };
        if (path === "/api/push/devices")
          return JSON.parse(String(options?.body || "{}"));
        throw new Error(`Unexpected API path: ${path}`);
      }
    );
    Object.assign(globalThis, {
      window: new EventTarget(),
      localStorage: new MemoryStorage(),
      CustomEvent: TestCustomEvent,
    });
  });

  it("uploads both PushKit and APNs tokens with distinct iOS platforms", async () => {
    await expect(registerNativePush()).resolves.toBe("registering");
    expect(fakes.pushRegister).toHaveBeenCalledOnce();

    const registration = fakes.pushListeners.get("registration");
    expect(registration).toBeTypeOf("function");
    await registration?.({ value: "a".repeat(64) });

    const registrations = fakes.api.mock.calls
      .filter(([path]) => path === "/api/push/devices")
      .map(([, options]) => JSON.parse(String(options.body)));
    expect(registrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: "ios", token: "a".repeat(64) }),
        expect.objectContaining({
          platform: "ios-voip",
          token: "v".repeat(64),
        }),
      ])
    );
    expect(getNativePushState()).toBe("registered");
  });

  it("forwards a CallKit answer request and never schedules Android local notifications", async () => {
    await registerNativePush();
    let detail: unknown;
    window.addEventListener("echat-native-call", event => {
      detail = (event as TestCustomEvent<unknown>).detail;
    });

    fakes.nativeListeners.get("callListenerIncoming")?.({
      conversationId: "conversation-one",
      callId: "1a8ef958-0aad-4b4d-a37d-d79693e5a14f",
      mode: "audio",
      callerId: "caller-one",
      callerName: "测试好友",
      callerAvatarUrl: "",
      answerRequested: true,
    });

    expect(detail).toEqual(
      expect.objectContaining({
        callId: "1a8ef958-0aad-4b4d-a37d-d79693e5a14f",
        answerRequested: true,
      })
    );

    fakes.appStateHandler?.({ isActive: false });
    await expect(
      notifyIncomingEvent({
        kind: "message",
        eventId: "ios-background-message",
        title: "测试好友",
        body: "发来一条消息",
        target: { type: "message", conversationId: "conversation-one" },
      })
    ).resolves.toBe(true);
    expect(fakes.localSchedule).not.toHaveBeenCalled();
  });
});
