import type {
  PandaApiErrorDetail,
  PandaApiErrorResponse,
  PandaExecutionCreateInput,
  PandaExecutionView,
  PandaRunInput,
  PandaSession,
  StoredPandaTraceRecord,
} from "@panda/shared";

export type {
  Assessment,
  Goal,
  Outcome,
  PandaAction,
  PandaActionResult,
  PandaApiErrorDetail,
  PandaApiErrorResponse,
  PandaExecution,
  PandaExecutionCreateInput,
  PandaExecutionView,
  PandaObservation,
  ObservationPriority,
  PandaStateName,
  StoredPandaTraceRecord,
} from "@panda/shared";

export interface PandaClientOptions {
  baseUrl?: string;
}

export class PandaRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail: PandaApiErrorDetail,
  ) {
    super(detail.message);
    this.name = "PandaRequestError";
  }
}

export class PandaClient {
  private readonly baseUrl: string;

  constructor(options: PandaClientOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://127.0.0.1:4317").replace(
      /\/$/,
      "",
    );
  }

  async health() {
    return this.request<{ ok: boolean; name: string; version: string }>("/health");
  }

  async listExecutions() {
    return this.request<PandaExecutionView[]>("/executions");
  }

  async createExecution(input: PandaExecutionCreateInput) {
    return this.request<PandaExecutionView>("/executions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getExecution(id: string) {
    return this.request<PandaExecutionView>(
      `/executions/${encodeURIComponent(id)}`,
    );
  }

  async getExecutionTrace(id: string) {
    return this.request<StoredPandaTraceRecord[]>(
      `/executions/${encodeURIComponent(id)}/trace`,
    );
  }

  async listSessions() {
    return this.request<PandaSession[]>("/sessions");
  }

  async getSession(id: string) {
    return this.request<PandaSession>(`/sessions/${encodeURIComponent(id)}`);
  }

  /** @deprecated Use createExecution. */
  async run(input: PandaRunInput | PandaExecutionCreateInput) {
    return this.request<PandaExecutionView>("/runs", {
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
      const body = await readError(response);
      throw new PandaRequestError(response.status, body.error);
    }

    return (await response.json()) as T;
  }
}

async function readError(response: Response): Promise<PandaApiErrorResponse> {
  try {
    const body = (await response.json()) as Partial<PandaApiErrorResponse>;
    if (
      body.error !== undefined &&
      typeof body.error.code === "string" &&
      typeof body.error.message === "string"
    ) {
      return body as PandaApiErrorResponse;
    }
  } catch {
    // Fall through to a stable client-side representation.
  }
  return {
    error: {
      code: "PANDA_REQUEST_FAILED",
      message: `PANDA request failed: ${response.status} ${response.statusText}`,
    },
  };
}
