import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "eu-central-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET!;
const PREFIX = process.env.S3_PREFIX ?? "transcripts";

export async function listTranscriptFiles(): Promise<string[]> {
  const prefix = PREFIX.endsWith("/") ? PREFIX : PREFIX + "/";
  const command = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
  });
  const response = await s3.send(command);
  const files = (response.Contents ?? [])
    .map((obj) => obj.Key ?? "")
    .filter((key) => key.endsWith(".json"))
    .map((key) => key.slice(prefix.length).replace(/\.json$/, ""))
    .filter((id) => id.length > 0);
  return files;
}

export async function getTranscriptFile(id: string): Promise<unknown[]> {
  const prefix = PREFIX.endsWith("/") ? PREFIX : PREFIX + "/";
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: `${prefix}${id}.json`,
  });
  const response = await s3.send(command);
  const body = await response.Body?.transformToString("utf-8");
  if (!body) throw new Error("Empty file");
  return JSON.parse(body);
}

export async function putTranscriptFile(id: string, data: unknown[]): Promise<void> {
  const prefix = PREFIX.endsWith("/") ? PREFIX : PREFIX + "/";
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: `${prefix}${id}.json`,
    Body: JSON.stringify(data, null, 2),
    ContentType: "application/json",
  });
  await s3.send(command);
}
