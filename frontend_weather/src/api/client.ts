// @packages
import axios, { type AxiosRequestConfig } from "axios";
import type { z } from "zod";

// @scripts
import { apiErrorSchema } from "./schemas";

const TIMEOUT_MS = 60_000;

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: TIMEOUT_MS,
  headers: { Accept: "application/json" },
});

export class ApiError extends Error {
  status: number | null;
  fieldErrors: Record<string, string>;
  retryable: boolean;

  constructor(
    message: string,
    status: number | null,
    fieldErrors: Record<string, string> = {},
    retryable = true,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.retryable = retryable;
  }
}

type RequestOptions = Pick<
  AxiosRequestConfig,
  "method" | "params" | "data" | "signal"
>;

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  let body: unknown;
  let status: number;
  try {
    const response = await http.request<unknown>({ url: path, ...options });
    body = response.data;
    status = response.status;
  } catch (error) {
    // Cancelled by the caller (TanStack Query): let it through untouched.
    if (axios.isCancel(error)) throw error;
    if (!axios.isAxiosError(error)) throw error;

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new ApiError(
        "The server took too long to answer. Please try again.",
        null,
      );
    }
    if (!error.response) {
      throw new ApiError(
        "Could not reach the server. Check your connection and try again.",
        null,
      );
    }

    const parsed = apiErrorSchema.safeParse(error.response.data);
    throw new ApiError(
      parsed.success
        ? parsed.data.detail
        : `The server returned an error (${error.response.status}).`,
      error.response.status,
      parsed.success ? parsed.data.field_errors : undefined,
      parsed.success ? parsed.data.retryable : undefined,
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("Unexpected response shape from", path, parsed.error);
    throw new ApiError(
      "The server sent a response this app does not understand.",
      status,
    );
  }
  return parsed.data;
}
