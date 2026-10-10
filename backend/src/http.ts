// Tiny HTTP helpers for an API Gateway HTTP API (payload v2) event.

export interface Req {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  params: Record<string, string>;
}

export interface Res {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string) {
    super(message);
  }
}

export function json(statusCode: number, body: unknown): Res {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function errorResponse(e: HttpError): Res {
  return json(e.status, { error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } });
}

export function toReq(event: any): Req {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) headers[k.toLowerCase()] = String(v);
  let body: unknown = undefined;
  if (event.body) {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "VALIDATION_ERROR", "Body must be valid JSON.", "body");
    }
  }
  return {
    method: event.requestContext?.http?.method ?? "GET",
    path: event.rawPath ?? "/",
    query: event.queryStringParameters ?? {},
    headers,
    body,
    params: {},
  };
}
