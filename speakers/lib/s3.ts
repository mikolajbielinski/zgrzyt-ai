import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  AWS_REGION,
  S3_PREFIX_LABELED,
  S3_PREFIX_RAW,
  requireEnv,
} from "@/lib/env";
import { logInfo, since } from "@/lib/log";

let client: S3Client | undefined;

function s3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
      },
    });
    logInfo("s3", `client created region=${AWS_REGION} bucket=${bucket()}`);
    logInfo("s3", `raw=${S3_PREFIX_RAW} labeled=${S3_PREFIX_LABELED}`);
  }
  return client;
}

function bucket(): string {
  return requireEnv("S3_BUCKET");
}

async function listIds(prefix: string): Promise<string[]> {
  const startedAt = Date.now();
  const ids: string[] = [];
  let token: string | undefined;
  let pages = 0;

  do {
    const response = await s3Client().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    pages++;

    for (const object of response.Contents ?? []) {
      const key = object.Key ?? "";
      if (!key.endsWith(".json")) continue;
      const id = key.slice(prefix.length).replace(/\.json$/, "");
      if (id.length > 0 && !id.includes("/")) ids.push(id);
    }

    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);

  logInfo("s3", `list ${prefix} → ${ids.length} ids, ${pages} page(s), ${since(startedAt)}`);
  return ids;
}

export async function listPending(): Promise<string[]> {
  const [raw, labeled] = await Promise.all([
    listIds(S3_PREFIX_RAW),
    listIds(S3_PREFIX_LABELED),
  ]);
  const done = new Set(labeled);
  const pending = raw.filter((id) => !done.has(id));
  logInfo("s3", `pending = raw(${raw.length}) - labeled(${labeled.length}) = ${pending.length}`);
  return pending;
}

export async function getProgress(): Promise<{
  done: number;
  pending: number;
  total: number;
}> {
  const [raw, labeled] = await Promise.all([
    listIds(S3_PREFIX_RAW),
    listIds(S3_PREFIX_LABELED),
  ]);
  const done = new Set(labeled);
  return {
    done: labeled.length,
    pending: raw.filter((id) => !done.has(id)).length,
    total: raw.length,
  };
}

export async function getRawTranscript(id: string): Promise<unknown[]> {
  const startedAt = Date.now();
  const key = `${S3_PREFIX_RAW}${id}.json`;

  const response = await s3Client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  const body = await response.Body?.transformToString("utf-8");
  if (!body) throw new Error(`Empty object: ${key}`);

  const parsed = JSON.parse(body);
  logInfo(
    "s3",
    `get ${key} → ${Math.round(body.length / 1024)} KB, ${Array.isArray(parsed) ? parsed.length : "?"} utterances, ${since(startedAt)}`,
  );
  return parsed;
}

export async function putLabeled(id: string, data: unknown[]): Promise<void> {
  const startedAt = Date.now();
  const key = `${S3_PREFIX_LABELED}${id}.json`;
  const body = JSON.stringify(data, null, 2);

  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );

  logInfo("s3", `put ${key} → ${Math.round(body.length / 1024)} KB, ${since(startedAt)}`);
}
