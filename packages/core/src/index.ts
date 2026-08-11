export * from "./execution-store.js";
export * from "./goal-store.js";
export * from "./coordinator.js";
export * from "./policy.js";
export * from "./action-connector.js";
export * from "./effect-observer.js";
export * from "./deterministic-capabilities.js";

export interface PandaDaemonConfig {
  readonly daemonHost: string;
  readonly daemonPort: number;
}

export function defaultPandaConfig(): PandaDaemonConfig {
  return {
    daemonHost: process.env.PANDA_HOST || "127.0.0.1",
    daemonPort: Number(process.env.PANDA_PORT || 4317),
  };
}
