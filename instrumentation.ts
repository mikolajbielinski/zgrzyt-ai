import { assertRequiredEnv } from "@/lib/env";

export function register() {
  try {
    assertRequiredEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
