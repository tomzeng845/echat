import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  api: vi.fn(),
  getCapabilities: vi.fn(),
  getBackgroundCallSupport: vi.fn(),
  requestBackgroundCallExemption: vi.fn(),
  openBackgroundCallSettings: vi.fn(),
  addListener: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  register: vi.fn(),
  playAlertSound: vi.fn(),
  stopAlertSound: vi.fn(),
  startCallListener: vi.fn(),
  stopCallListener: vi.fn(),
  clearCallListenerAlert: vi.fn(),
  getPendingCall: vi.fn(),
  nativeAddListener: vi.fn(),
  appGetState: vi.fn(),
  appAddListener: vi.fn(),
  localAddListener: vi.fn(),
  localCheckPermissions: vi.fn(),
  localRequestPermissions: vi.fn(),
  localCreateChannel: vi.fn(),
  localSchedule: vi.fn(),
  appStateHandler: null as null | ((state: { isActive: boolean }) => void),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "android",
    isNativePlatform: () => true,
  },
  registerPlugin: () => ({
    getCapabilities: fakes.getCapabilities,
    getBackgroundCallSupport: fakes.getBackgroundCallSupport,
    requestBackgroundCallExemption: fakes.requestBackgroundCallExemption,
    openBackgroundCallSettings: fakes.openBackgroundCallSettings,
    requestPermissions: vi.fn(),
    playAlertSound: fakes.playAlertSound,
    stopAlertSound: fakes.stopAlertSound,
    startCallListener: fakes.startCallListener,
    stopCallListener: fakes.stopCallListener,
    clearCallListenerAlert: fakes.clearCallListenerAlert,
    getPendingCall: fakes.getPendingCall,
    addListener: fakes.nativeAddListener,
  }),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    getState: fakes.appGetState,
    addListener: fakes.appAddListener,
  },
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: fakes.addListener,
    checkPermissions: fakes.checkPermissions,
    requestPermissions: fakes.requestPermissions,
    createChannel: fakes.createChannel,
    register: fakes.register,
  },
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    addListener: fakes.localAddListener,
    checkPermissions: fakes.localCheckPermissions,
    requestPermissions: fakes.localRequestPermissions,
    createChannel: fakes.localCreateChannel,
    schedule: fakes.localSchedule,
  },
}));

vi.mock("../client/src/lib/echat-api", () => ({
  api: fakes.api,
  getDeviceId: () => "test-device",
}));

import {
  getNativeCallListenerState,
  notifyIncomingEvent,
  playIncomingAlert,
  playOutgoingCallAlert,
  registerNativePush,
  stopIncomingCallAlert,
} from "../client/src/lib/mobile-native";

describe("Android push login guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.api.mockImplementation(async (path: string) =>
      path === "/api/calls/listener-token"
        ? {
            token: "restricted-call-listener-token",
            expiresAtUtc: "2099-01-01T00:00:00Z",
            userId: "receiver-user",
          }
        : { enabled: false, provider: "Firebase Cloud Messaging" }
    );
    fakes.appStateHandler = null;
    fakes.appGetState.mockResolvedValue({ isActive: true });
    fakes.appAddListener.mockImplementation(
      async (
        _name: string,
        handler: (state: { isActive: boolean }) => void
      ) => {
        fakes.appStateHandler = handler;
        return { remove: vi.fn() };
      }
    );
    fakes.localAddListener.mockResolvedValue({ remove: vi.fn() });
    fakes.localCheckPermissions.mockResolvedValue({ display: "granted" });
    fakes.localCreateChannel.mockResolvedValue(undefined);
    fakes.localSchedule.mockResolvedValue({ notifications: [{ id: 1 }] });
    fakes.nativeAddListener.mockResolvedValue({ remove: vi.fn() });
    fakes.startCallListener.mockResolvedValue({ running: true });
    fakes.getPendingCall.mockResolvedValue({ available: false });
    fakes.requestBackgroundCallExemption.mockResolvedValue({
      manufacturer: "HUAWEI",
      harmonyCompatible: true,
      batteryOptimizationIgnored: false,
    });
  });

  it("uses a local notification fallback when the server has no FCM credentials", async () => {
    await expect(registerNativePush()).resolves.toBe("local");
    expect(fakes.startCallListener).toHaveBeenCalledWith({
      hubUrl: "/hubs/chat",
      token: "restricted-call-listener-token",
      userId: "receiver-user",
    });
    expect(getNativeCallListenerState()).toBe(true);
    expect(fakes.requestBackgroundCallExemption).toHaveBeenCalledWith({
      force: false,
    });
    expect(fakes.api).toHaveBeenCalledWith("/api/push/status");
    expect(fakes.localCheckPermissions).toHaveBeenCalledOnce();
    expect(fakes.localCreateChannel).toHaveBeenCalledTimes(2);
    expect(fakes.getCapabilities).not.toHaveBeenCalled();
    expect(fakes.addListener).not.toHaveBeenCalled();
    expect(fakes.checkPermissions).not.toHaveBeenCalled();
    expect(fakes.requestPermissions).not.toHaveBeenCalled();
    expect(fakes.createChannel).not.toHaveBeenCalled();
    expect(fakes.register).not.toHaveBeenCalled();

    fakes.appStateHandler?.({ isActive: false });
    await expect(
      notifyIncomingEvent({
        kind: "message",
        eventId: "background-message",
        title: "好友",
        body: "收到一条加密消息",
        target: { type: "message", conversationId: "conversation-one" },
      })
    ).resolves.toBe(true);
    expect(fakes.localSchedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          title: "好友",
          body: "收到一条加密消息",
          channelId: "messages-v2",
          extra: {
            type: "message",
            conversationId: "conversation-one",
          },
        }),
      ],
    });
    await expect(
      notifyIncomingEvent({
        kind: "voice-call",
        eventId: "native-background-call",
        title: "来电",
        body: "邀请你进行语音通话",
        target: {
          type: "call",
          conversationId: "conversation-one",
          callId: "native-background-call",
        },
      })
    ).resolves.toBe(true);
    expect(fakes.localSchedule).toHaveBeenCalledTimes(1);
  });

  it("plays each foreground event once and stops the looping call alert", async () => {
    fakes.playAlertSound.mockResolvedValue({ playing: true });
    fakes.stopAlertSound.mockResolvedValue(undefined);

    await expect(playIncomingAlert("message", "message-one")).resolves.toBe(
      true
    );
    await expect(playIncomingAlert("message", "message-one")).resolves.toBe(
      false
    );
    await expect(playIncomingAlert("video-call", "call-one")).resolves.toBe(
      true
    );
    await expect(playOutgoingCallAlert("outgoing-one")).resolves.toBe(true);
    await stopIncomingCallAlert();

    expect(fakes.playAlertSound).toHaveBeenCalledTimes(3);
    expect(fakes.playAlertSound).toHaveBeenNthCalledWith(1, {
      kind: "message",
    });
    expect(fakes.playAlertSound).toHaveBeenNthCalledWith(2, {
      kind: "video-call",
    });
    expect(fakes.playAlertSound).toHaveBeenNthCalledWith(3, {
      kind: "outgoing-call",
    });
    expect(fakes.stopAlertSound).toHaveBeenCalledWith({ kind: "call" });
  });
});
