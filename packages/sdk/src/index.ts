import type { PandaRunInput, PandaRunResult, PandaSession } from "@panda/shared";

export type {
  PandaAction,
  PandaActionResult,
  PandaObservation,
  ObservationPriority,
  PandaStateName,
} from "@panda/shared";

export interface PandaClientOptions {
  baseUrl?: string;
}

export class PandaClient {
  private readonly baseUrl: string;

  constructor(options: PandaClientOptions = {}) {
    this.baseUrl = options.baseUrl || "http://127.0.0.1:4317";
  }

  async health() {
    return this.request<{ ok: boolean; name: string; version: string }>("/health");
  }

  async listSessions() {
    return this.request<PandaSession[]>("/sessions");
  }

  async getSession(id: string) {
    return this.request<PandaSession>(`/sessions/${id}`);
  }

  async run(input: PandaRunInput) {
    return this.request<PandaRunResult>("/runs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        "content-type": "application/json",
        ...init.headers,
      },
      ...init,
    });

    if (!response.ok) {
      throw new Error(`PANDA request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}
