// Lambda entry point: one function, a small internal route table (§5.2).

import { demoLogin, login, requireRole } from "./auth.ts";
import { HttpError, errorResponse, json, toReq, type Req, type Res } from "./http.ts";
import * as svc from "./service.ts";
import * as voice from "./voice.ts";
import { unmarshall } from "@aws-sdk/util-dynamodb";

type Handler = (req: Req) => Promise<Res>;

const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/health$/, async () => json(200, { ok: true })],

  ["POST", /^\/auth\/login$/, async (req) => json(200, login(req.body))],

  ["POST", /^\/auth\/demo$/, async (req) => json(200, demoLogin(req.body))],

  ["GET", /^\/auth\/config$/, async () => json(200, { demoMode: process.env.DEMO_MODE === "true" })],

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

  // Voice log: spoken questions, recorded answers, transcripts, extracted fields (never saved here).
  ["GET", /^\/voice\/prompts$/, async (req) => {
    requireRole(req, ["worker", "manager"]);
    return json(200, await voice.prompts());
  }],

  ["POST", /^\/voice\/sessions$/, async (req) => {
    requireRole(req, ["worker", "manager"]);
    return json(201, await voice.startSession(req.body));
  }],

  ["GET", /^\/voice\/sessions\/(?<id>[^/]+)$/, async (req) => {
    requireRole(req, ["worker", "manager"]);
    return json(200, await voice.getSession(req.params.id));
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
  // Not HTTP: a step of the agent workflow (Step Functions) or a batch of new meals (DynamoDB Streams).
  if (event?.agentStep) return agentStep(event);
  if (Array.isArray(event?.Records) && event.Records[0]?.eventSource === "aws:dynamodb") return mealsLogged(event.Records);
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

async function agentStep(event: any) {
  if (event.agentStep === "investigate") return svc.agentInvestigate(event.SK);
  if (event.agentStep === "await") return svc.agentAwaitDecision(event.SK, event.taskToken);
  if (event.agentStep === "impact") return svc.agentMeasureImpact(event.interventionId);
  throw new Error(`unknown agent step ${event.agentStep}`);
}

/** The stream's filter already keeps only newly logged (not seeded) waste records. */
async function mealsLogged(records: any[]) {
  for (const r of records) {
    const img = r.dynamodb?.NewImage;
    if (!img) continue;
    const rec = unmarshall(img) as any;
    try {
      await svc.onMealLogged(rec);
    } catch (e: any) {
      console.error(JSON.stringify({ event: "meal_trigger_failed", message: e?.message }));
    }
  }
}
