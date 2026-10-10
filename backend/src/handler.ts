// Lambda entry point: one function, a small internal route table (§5.2).

import { login, requireRole } from "./auth.ts";
import { HttpError, errorResponse, json, toReq, type Req, type Res } from "./http.ts";
import * as svc from "./service.ts";

type Handler = (req: Req) => Promise<Res>;

const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/health$/, async () => json(200, { ok: true })],

  ["POST", /^\/auth\/login$/, async (req) => json(200, login(req.body))],

  ["GET", /^\/items$/, async (req) => {
    requireRole(req, ["student", "worker", "manager"]);
    return json(200, await svc.listItems());
  }],

  ["POST", /^\/waste-records$/, async (req) => {
    const role = requireRole(req, ["worker", "manager"]);
    return json(201, await svc.createWasteRecord(req.body, role));
  }],

  ["GET", /^\/waste-records$/, async (req) => {
    requireRole(req, ["worker", "manager"]);
    return json(200, await svc.listWasteRecords(req.query));
  }],

  ["GET", /^\/analytics\/summary$/, async (req) => {
    requireRole(req, ["manager"]);
    return json(200, await svc.summary());
  }],

  ["POST", /^\/recommendations\/generate$/, async (req) => {
    requireRole(req, ["manager"]);
    return json(200, await svc.generateRecommendations());
  }],

  ["GET", /^\/recommendations$/, async (req) => {
    requireRole(req, ["manager"]);
    return json(200, await svc.listRecommendations(req.query.status));
  }],

  ["POST", /^\/recommendations\/(?<id>[^/]+)\/decision$/, async (req) => {
    const role = requireRole(req, ["manager"]);
    return json(200, await svc.recordDecision(req.params.id, req.body, role));
  }],

  ["GET", /^\/interventions$/, async (req) => {
    requireRole(req, ["manager", "student"]); // students see what changed (§11.1)
    return json(200, await svc.listInterventions());
  }],

  ["GET", /^\/interventions\/(?<id>[^/]+)\/impact$/, async (req) => {
    requireRole(req, ["manager", "student"]); // students see what changed (§11.1)
    return json(200, await svc.computeImpact(req.params.id));
  }],

  ["POST", /^\/admin\/seed$/, async (req) => {
    requireRole(req, ["manager"]);
    return json(200, await svc.seed(req.query.includeLatest !== "false"));
  }],
];

export async function handler(event: any): Promise<Res | void> {
  // Our own asynchronous self-invocation (service.startExplanation), not an HTTP request.
  if (event?.kind === "explain" && typeof event.SK === "string") return svc.explainLater(event.SK);
  try {
    const req = toReq(event);
    // The catch-all route also receives browser CORS preflights; API Gateway adds the
    // CORS headers itself, so all we owe it is a success status.
    if (req.method === "OPTIONS") return { statusCode: 204, headers: {}, body: "" };
    for (const [method, pattern, fn] of routes) {
      const m = req.path.match(pattern);
      if (m && req.method === method) {
        req.params = (m.groups as Record<string, string>) ?? {};
        return await fn(req);
      }
    }
    throw new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}.`);
  } catch (e: any) {
    if (e instanceof HttpError) return errorResponse(e);
    console.error(JSON.stringify({ event: "unhandled", name: e?.name, message: e?.message }));
    return errorResponse(new HttpError(500, "INTERNAL", "Something went wrong."));
  }
}
