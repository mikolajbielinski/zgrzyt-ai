const REQUIRED_ENV = [
  "BASIC_AUTH_USER",
  "BASIC_AUTH_PASS",
  "APP_USER",
  "APP_PASS",
  "APP_SECRET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "S3_BUCKET",
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV)[number];

export function requireEnv(name: RequiredEnvVar): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function assertRequiredEnv(): void {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Refusing to start with insecure defaults — check the SOPS secret " +
        "mounted into this deployment.",
    );
  }
}

export const AWS_REGION = process.env.AWS_REGION ?? "eu-central-1";

export const S3_PREFIX = process.env.S3_PREFIX ?? "transcripts";
