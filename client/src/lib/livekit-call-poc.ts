import { registerPlugin } from "@capacitor/core";

export type LiveKitCallPocState = {
  running: boolean;
  connected: boolean;
  url: string;
  speaker: boolean;
  interrupted: boolean;
  category: string;
  mode: string;
  outputs: string[];
  inputs: string[];
};

type LiveKitCallPocPlugin = {
  start(options: {
    url: string;
    token: string;
    speaker?: boolean;
  }): Promise<LiveKitCallPocState>;
  stop(): Promise<LiveKitCallPocState>;
  setSpeaker(options: { enabled: boolean }): Promise<LiveKitCallPocState>;
  getState(): Promise<LiveKitCallPocState>;
};

/**
 * Opt-in native iOS POC only. Do not call from CallManager until the real-device
 * CallKit/PushKit acceptance matrix passes.
 */
export const LiveKitCallPoc =
  registerPlugin<LiveKitCallPocPlugin>("LiveKitCallPoc");
