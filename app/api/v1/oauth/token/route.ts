import { NextResponse } from "next/server";
import { authenticateClientCredentials, issueAccessToken } from "@/lib/integration-auth";

// OAuth2 client_credentials (RFC 6749 §4.4).
//
// Existe porque las plataformas corporativas —SAP BTP, Azure API Management,
// MuleSoft— suelen prohibir guardar un secreto permanente en el cliente y
// esperan pedir un token de vida corta. No concede nada distinto de la clave
// directa: es la misma credencial presentada de otra forma.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function oauthError(error: string, description: string, status: number) {
  return NextResponse.json({ error, error_description: description }, { status });
}

/** Lee las credenciales del cuerpo o de la cabecera Basic, ambas del estándar. */
async function readCredentials(request: Request): Promise<{ clientId: string; clientSecret: string; grantType: string } | null> {
  const contentType = request.headers.get("content-type") ?? "";
  let clientId = "";
  let clientSecret = "";
  let grantType = "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    clientId = String(body.client_id ?? "");
    clientSecret = String(body.client_secret ?? "");
    grantType = String(body.grant_type ?? "");
  } else {
    // application/x-www-form-urlencoded es lo que manda el estándar y lo que
    // envían por defecto la mayoría de los clientes OAuth2.
    const form = new URLSearchParams(await request.text());
    clientId = form.get("client_id") ?? "";
    clientSecret = form.get("client_secret") ?? "";
    grantType = form.get("grant_type") ?? "";
  }

  const authorization = request.headers.get("authorization");
  if ((!clientId || !clientSecret) && authorization?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator > 0) {
      clientId = decoded.slice(0, separator);
      clientSecret = decoded.slice(separator + 1);
    }
  }

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, grantType };
}

export async function POST(request: Request) {
  const credentials = await readCredentials(request);
  if (!credentials) {
    return oauthError("invalid_request", "Faltan client_id o client_secret.", 400);
  }
  if (credentials.grantType && credentials.grantType !== "client_credentials") {
    return oauthError("unsupported_grant_type", "Solo se admite grant_type=client_credentials.", 400);
  }

  const authenticated = await authenticateClientCredentials(credentials.clientId, credentials.clientSecret);
  if ("failure" in authenticated) {
    const status = authenticated.failure.error === "unconfigured" ? 503 : 401;
    return oauthError("invalid_client", authenticated.failure.message, status);
  }

  const { accessToken, expiresIn } = await issueAccessToken(authenticated.client);
  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: authenticated.client.scopes.join(" "),
    },
    // Un token nunca debe quedar en una caché intermedia.
    { headers: { "cache-control": "no-store", pragma: "no-cache" } },
  );
}
