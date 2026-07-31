import { NextResponse } from "next/server";
import { authenticateIntegrationRequest } from "@/lib/integration-auth";
import { INTEGRATION_OPERATIONS } from "@/lib/integration-registry";

// Primera llamada de toda integración: confirma que la credencial funciona y
// dice exactamente qué alcanza. Existe para que quien conecta el ERP no tenga
// que descubrirlo probando endpoints hasta recibir un 403.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authenticated = await authenticateIntegrationRequest(request.headers);
  if ("failure" in authenticated) {
    const status = authenticated.failure.error === "unconfigured" ? 503
      : ["revoked", "expired", "no_actor", "actor_without_access"].includes(authenticated.failure.error) ? 403
        : 401;
    return NextResponse.json(
      { error: authenticated.failure.error, message: authenticated.failure.message },
      { status },
    );
  }

  const { client, session, scopes } = authenticated.principal;
  const operations = INTEGRATION_OPERATIONS
    .filter((operation) => scopes.includes(operation.scope))
    .map((operation) => ({
      operationId: operation.operationId,
      method: operation.method,
      path: `/api/v1${operation.path}`,
    }));

  return NextResponse.json({
    data: {
      client: { id: client.id, name: client.name, clientId: client.clientId, systemKind: client.systemKind },
      laboratory: { id: session.laboratoryId, name: session.laboratoryName, profileCode: session.profileCode },
      organizationId: session.organizationId,
      scopes,
      // Permisos que de verdad quedaron tras cruzar los scopes con lo que puede
      // el usuario responsable. Si aquí falta algo que se concedió, el problema
      // está en los permisos de esa persona, no en la credencial.
      effectivePermissions: session.permissions ?? [],
      rateLimitPerMinute: client.rateLimitPerMinute,
      availableOperations: operations,
    },
  });
}
