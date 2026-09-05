import { assertRequiredEnv } from "@/lib/env";
import { logError, logInfo } from "@/lib/log";

export function register() {
  try {
    assertRequiredEnv();
    logInfo("startup", "all required environment variables present");
  } catch (error) {
    logError("startup", "refusing to start", error);
    throw error;
  }
}
