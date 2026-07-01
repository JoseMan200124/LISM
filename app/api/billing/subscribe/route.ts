import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { hasDatabase } from "@/lib/db";
import { canManageBilling } from "@/lib/billing-plans";
import { createSubscriptionCheckout } from "@/lib/billing-checkout";

const subscribeSchema = z.object({
  planId: z.string().uuid(),
});

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (!canManageBilling(session.role)) {
    return NextResponse.json(
      { message: "No tienes permisos para gestionar la facturación." },
      { status: 403 }
    );
  }

  // ── Demo mode guard ───────────────────────────────────────────────────────────
  if (session.sessionMode === "demo" || !hasDatabase()) {
    return NextResponse.json(
      {
        message:
          "El sistema de facturación no está disponible en modo demo.",
      },
      { status: 400 }
    );
  }

  // ── Parse + validate body ─────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "El cuerpo de la solicitud no es JSON válido." },
      { status: 400 }
    );
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Datos inválidos.",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const result = await createSubscriptionCheckout(session, parsed.data.planId, request);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    data: {
      checkoutUrl: result.checkoutUrl,
      checkoutId: result.checkoutId,
      isTrial: result.isTrial,
    },
  });
}
