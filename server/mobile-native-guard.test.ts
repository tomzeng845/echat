import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  api: vi.fn(),
  getCapabilities: vi.fn(),
  addListener: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  register: vi.fn(),
  playAlertSound: vi.fn(),
  stopAlertSound: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "android",
    isNativePlatform: () => true,
  },
  registerPlugin: () => ({
    getCapabilities: fakes.getCapabilities,
    requestPermissions: vi.fn(),
    playAlertSound: fakes.playAlertSound,
    stopAlertSound: fakes.stopAlertSound,
  }),
}));

vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn() },
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

vi.mock("../client/src/lib/echat-api", () => ({
  api: fakes.api,
  getDeviceId: () => "test-device",
}));

import {
  playIncomingAlert,
  registerNativePush,
  stopIncomingCallAlert,
} from "../client/src/lib/mobile-native";

describe("Android push login guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.api.mockResolvedValue({
      enabled: false,
      provider: "Firebase Cloud Messaging",
    });
  });

  it("skips every native push call when the server has no FCM credentials", async () => {
    await expect(registerNativePush()).resolves.toBe("unavailable");
    expect(fakes.api).toHaveBeenCalledWith("/api/push/status");
    expect(fakes.getCapabilities).not.toHaveBeenCalled();
    expect(fakes.addListener).not.toHaveBeenCalled();
    expect(fakes.checkPermissions).not.toHaveBeenCalled();
    expect(fakes.requestPermissions).not.toHaveBeenCalled();
    expect(fakes.createChannel).not.toHaveBeenCalled();
    expect(fakes.register).not.toHaveBeenCalled();
  });

  it("plays each incoming event once and stops the looping call alert", async () => {
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
    await stopIncomingCallAlert();

    expect(fakes.playAlertSound).toHaveBeenCalledTimes(2);
    expect(fakes.playAlertSound).toHaveBeenNthCalledWith(1, {
      kind: "message",
    });
    expect(fakes.playAlertSound).toHaveBeenNthCalledWith(2, {
      kind: "video-call",
    });
    expect(fakes.stopAlertSound).toHaveBeenCalledWith({ kind: "call" });
  });
});
