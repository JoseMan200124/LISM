import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";

const patchSchema = z.object({
  moduleKey: z.string().min(1).max(40),
  version: z.number().int().min(1),
});

type TutorialState = Record<string, { completedAt: string; version: number }>;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ data: {}, mode: "demo" });

  const sql = getSql();
  const rows = await sql`SELECT tutorial_state FROM users WHERE id = ${session.userId} LIMIT 1`;
  const row = rows[0] as { tutorial_state?: TutorialState } | undefined;
  return NextResponse.json({ data: row?.tutorial_state ?? {}, mode: "database" });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Solicitud inválida.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { ok: true }, mode: "demo" });

  const sql = getSql();
  const { moduleKey, version } = parsed.data;
  // jsonb_set solo toca la clave del módulo indicado — nunca sobreescribe
  // el progreso de otros módulos ya guardado para este mismo usuario.
  await sql`
    UPDATE users
    SET tutorial_state = jsonb_set(
      tutorial_state,
      ARRAY[${moduleKey}]::text[],
      ${JSON.stringify({ completedAt: new Date().toISOString(), version })}::jsonb,
      true
    )
    WHERE id = ${session.userId}
  `;

  return NextResponse.json({ data: { ok: true }, mode: "database" });
}
