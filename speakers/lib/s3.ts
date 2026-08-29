import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { AWS_REGION, S3_PREFIX, requireEnv } from "@/lib/env";

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
  }
  return client;
}

function bucket(): string {
  return requireEnv("S3_BUCKET");
}

function normalisedPrefix(): string {
  return S3_PREFIX.endsWith("/") ? S3_PREFIX : S3_PREFIX + "/";
}

export async function listTranscriptFiles(): Promise<string[]> {
  const prefix = normalisedPrefix();
  const command = new ListObjectsV2Command({
    Bucket: bucket(),
    Prefix: prefix,
  });
  const response = await s3Client().send(command);
  const files = (response.Contents ?? [])
    .map((obj) => obj.Key ?? "")
    .filter((key) => key.endsWith(".json"))
    .map((key) => key.slice(prefix.length).replace(/\.json$/, ""))
    .filter((id) => id.length > 0);
  return files;
}

export async function getTranscriptFile(id: string): Promise<unknown[]> {
  const prefix = normalisedPrefix();
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: `${prefix}${id}.json`,
  });
  const response = await s3Client().send(command);
  const body = await response.Body?.transformToString("utf-8");
  if (!body) throw new Error("Empty file");
  return JSON.parse(body);
}

export async function putTranscriptFile(id: string, data: unknown[]): Promise<void> {
  const prefix = normalisedPrefix();
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: `${prefix}${id}.json`,
    Body: JSON.stringify(data, null, 2),
    ContentType: "application/json",
  });
  await s3Client().send(command);
}
