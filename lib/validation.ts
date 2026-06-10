import { z } from "zod";

/**
 * PostgreSQL UUID identifier validation.
 *
 * PostgreSQL accepts hexadecimal UUID values independently of the RFC version nibble.
 * The demo seed deliberately uses readable deterministic UUIDs, so the API validates
 * the canonical database shape instead of restricting IDs to generated UUID versions.
 */
export const databaseIdSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Identificador inválido.",
);
