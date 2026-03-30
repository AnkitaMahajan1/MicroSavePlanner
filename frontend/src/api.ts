import type {
  FilterRequest,
  FilterResponse,
  ParseResponse,
  PerformanceResponse,
  ReturnsRequest,
  ReturnsResponse,
  TransactionInput,
  ValidateRequest,
  ValidateResponse,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:5477";

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = "Unexpected API error";
    try {
      const body = await response.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      detail = await response.text();
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export const api = {
  parseTransactions(transactions: TransactionInput[]) {
    return request<ParseResponse>("/microsave/challenge/v1/transactions:parse", {
      method: "POST",
      body: JSON.stringify(transactions),
    });
  },

  validateTransactions(payload: ValidateRequest) {
    return request<ValidateResponse>("/microsave/challenge/v1/transactions:validate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  filterTransactions(payload: FilterRequest) {
    return request<FilterResponse>("/microsave/challenge/v1/transactions:filter", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  calculateNpsReturns(payload: ReturnsRequest) {
    return request<ReturnsResponse>("/microsave/challenge/v1/returns:nps", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  calculateIndexReturns(payload: ReturnsRequest) {
    return request<ReturnsResponse>("/microsave/challenge/v1/returns:index", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getPerformance() {
    return request<PerformanceResponse>("/microsave/challenge/v1/performance", {
      method: "GET",
    });
  },
};

export { API_BASE_URL };
