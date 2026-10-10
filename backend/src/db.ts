// DynamoDB single table "messloop" (§6). At MVP scale we query by PK and filter in code.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { HttpError } from "./http.ts";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = () => {
  const t = process.env.TABLE_NAME;
  if (!t) throw new Error("TABLE_NAME is not set");
  return t;
};

export const HOSTEL_ID = process.env.HOSTEL_ID ?? "demo-hostel";
export const HPK = `H#${HOSTEL_ID}`;

export async function put<T extends Record<string, unknown>>(item: T): Promise<T> {
  await doc.send(new PutCommand({ TableName: TABLE(), Item: item }));
  return item;
}

/** Put that fails with 409 if the key is already taken. */
export async function putNew<T extends Record<string, unknown>>(item: T, conflictMessage: string): Promise<T> {
  try {
    await doc.send(new PutCommand({ TableName: TABLE(), Item: item, ConditionExpression: "attribute_not_exists(PK)" }));
    return item;
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") throw new HttpError(409, "CONFLICT", conflictMessage);
    throw e;
  }
}

export async function get<T = any>(PK: string, SK: string): Promise<T | null> {
  const r = await doc.send(new GetCommand({ TableName: TABLE(), Key: { PK, SK }, ConsistentRead: true }));
  return (r.Item as T) ?? null;
}

export async function query<T = any>(PK: string, skPrefix = ""): Promise<T[]> {
  const out: T[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await doc.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: skPrefix ? "PK = :pk AND begins_with(SK, :p)" : "PK = :pk",
      ExpressionAttributeValues: skPrefix ? { ":pk": PK, ":p": skPrefix } : { ":pk": PK },
      ConsistentRead: true,
      ExclusiveStartKey,
    }));
    out.push(...((r.Items as T[]) ?? []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

export async function remove(PK: string, SK: string): Promise<void> {
  await doc.send(new DeleteCommand({ TableName: TABLE(), Key: { PK, SK } }));
}

async function batch(requests: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < requests.length; i += 25) {
    let pending: any = { [TABLE()]: requests.slice(i, i + 25) };
    for (let attempt = 0; attempt < 5 && pending && Object.keys(pending).length; attempt++) {
      const r = await doc.send(new BatchWriteCommand({ RequestItems: pending }));
      pending = r.UnprocessedItems && Object.keys(r.UnprocessedItems).length ? r.UnprocessedItems : null;
      if (pending) await new Promise((res) => setTimeout(res, 100 * 2 ** attempt));
    }
  }
}

export async function putMany(items: Record<string, unknown>[]): Promise<void> {
  await batch(items.map((Item) => ({ PutRequest: { Item } })));
}

export async function deleteAllUnder(PK: string): Promise<number> {
  const items = await query<{ PK: string; SK: string }>(PK);
  await batch(items.map(({ PK: p, SK }) => ({ DeleteRequest: { Key: { PK: p, SK } } })));
  return items.length;
}
