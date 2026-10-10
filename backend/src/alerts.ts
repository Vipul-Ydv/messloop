// Alerts the agent sends by itself: a suggestion waiting for the manager, a trial's
// result, and a daily reminder when no meal has been logged. Each one is stored (the
// dashboard shows them) and, if an email is subscribed, sent through Amazon SNS.

import { randomUUID } from "node:crypto";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { HPK, put, query } from "./db.ts";

const sns = new SNSClient({});

export type AlertKind = "suggestion" | "outcome" | "reminder";

export interface Alert {
  alertId: string;
  kind: AlertKind;
  title: string;
  body: string;
  link?: string;
  createdAt: string;
  day: string;
  emailed: boolean;
}

/** Today's date in India, where the mess is — not the Lambda's UTC date. */
export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function notify(a: { kind: AlertKind; title: string; body: string; link?: string }): Promise<Alert> {
  const createdAt = new Date().toISOString();
  let emailed = false;
  const topic = process.env.ALERT_TOPIC_ARN;
  // Only claim "emailed" when someone is actually subscribed to the topic.
  if (topic && process.env.ALERT_EMAIL_ON === "true") {
    const url = process.env.APP_URL ? `${process.env.APP_URL}${a.link ?? ""}` : "";
    try {
      await sns.send(new PublishCommand({
        TopicArn: topic,
        Subject: `MessLoop: ${a.title}`.replace(/[^\x20-\x7E]/g, "").slice(0, 99),
        Message: `${a.body}${url ? `\n\nOpen MessLoop: ${url}` : ""}\n\n(Sent by the MessLoop agent.)`,
      }));
      emailed = true;
    } catch (e: any) {
      console.error(JSON.stringify({ event: "alert_email_failed", name: e?.name }));
    }
  }
  const alert: Alert = { alertId: randomUUID(), ...a, createdAt, day: todayIST(), emailed };
  await put({ PK: HPK, SK: `ALERT#${createdAt}`, ...alert });
  console.log(JSON.stringify({ event: "alert", kind: a.kind, emailed }));
  return alert;
}

export async function listAlerts(limit = 8) {
  const rows = await query(HPK, "ALERT#");
  return rows
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
    .slice(0, limit)
    .map(({ PK, SK, ...rest }) => rest);
}

/**
 * The daily check (EventBridge Scheduler, 3 pm in India): if nothing was logged today,
 * remind the committee — once a day, unless someone runs the check by hand.
 */
export async function dailyCheck(opts: { manual?: boolean } = {}) {
  const day = todayIST();
  const loggedToday = (await query(HPK, `WASTE#${day}`)).some((r) => !r.isSimulated);
  if (loggedToday) return { day, loggedToday, alerted: false, message: "Today's meal is already logged. No reminder needed." };
  if (!opts.manual) {
    const already = (await query(HPK, "ALERT#")).some((r) => r.kind === "reminder" && r.day === day);
    if (already) return { day, loggedToday, alerted: false, message: "A reminder was already sent today." };
  }
  const alert = await notify({
    kind: "reminder",
    title: "Today's meal isn't logged yet",
    body: "Nobody has logged today's meal. Mess staff can open MessLoop, tap 'Bol ke batao' and answer five questions in Hindi, or type it in.",
    link: "#/entry",
  });
  return { day, loggedToday, alerted: true, emailed: alert.emailed, message: alert.emailed ? "Reminder stored and emailed." : "Reminder stored (no email subscribed yet)." };
}
