type Scope = "s3" | "progress" | "files/next" | "files/[id]" | "startup";

function stamp(): string {
  return new Date().toISOString();
}

export function logInfo(scope: Scope, message: string): void {
  console.log(`${stamp()} [${scope}] ${message}`);
}

export function logWarn(scope: Scope, message: string): void {
  console.warn(`${stamp()} [${scope}] WARN ${message}`);
}

export function logError(scope: Scope, message: string, err: unknown): void {
  const parts: string[] = [];

  if (err instanceof Error) {
    parts.push(`${err.name}: ${err.message}`);
  } else {
    parts.push(String(err));
  }

  const meta = (err as { $metadata?: { httpStatusCode?: number; requestId?: string } }).$metadata;
  if (meta?.httpStatusCode) parts.push(`http=${meta.httpStatusCode}`);
  if (meta?.requestId) parts.push(`requestId=${meta.requestId}`);

  console.error(`${stamp()} [${scope}] ERROR ${message} — ${parts.join(" ")}`);

  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

export function since(startedAt: number): string {
  return `${Date.now() - startedAt}ms`;
}
