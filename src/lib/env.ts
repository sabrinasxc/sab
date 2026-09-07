import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  INTEGRATION_ENCRYPTION_KEY: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  GOOGLE_PUBSUB_TOPIC: z.string().min(1),
  GOOGLE_PUBSUB_VERIFICATION_TOKEN: z.string().min(1),
  GHL_CLIENT_ID: z.string().min(1),
  GHL_CLIENT_SECRET: z.string().min(1),
  GHL_REDIRECT_URI: z.string().url(),
  GHL_INSTALL_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  AI_ACTIVE: z.enum(["true", "false"]).default("false"),
  AUTO_SEND_ACTIVE: z.enum(["true", "false"]).default("false"),
});

export function getServerEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid server environment: ${parsed.error.message}`);
  return parsed.data;
}

export function getKillSwitches() {
  const env = getServerEnv();
  return { aiActive: env.AI_ACTIVE === "true", autoSendActive: env.AUTO_SEND_ACTIVE === "true" };
}
