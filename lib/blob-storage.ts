import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

// Wrapper delgado sobre Azure Blob Storage para avatares de usuario y logos
// institucionales. Usa el Storage Account ya aprovisionado en lism-infra
// (modules/storage/, contenedor `lism-files`) — no crea ningún recurso
// nuevo. Autenticación exclusivamente vía Managed Identity/Azure AD
// (el Storage Account tiene shared_access_key_enabled=false, ver
// lism-infra/modules/storage/main.tf), nunca con connection strings ni
// SAS tokens.
//
// Si AZURE_STORAGE_ACCOUNT_URL no está definida (desarrollo local sin
// Azure), hasBlobStorage() devuelve false y los endpoints que dependen de
// esto responden con un error claro y controlado — nunca un crash. Mismo
// patrón que hasDatabase() en lib/db.ts.

let cachedClient: BlobServiceClient | null = null;

export function hasBlobStorage(): boolean {
  return Boolean(process.env.AZURE_STORAGE_ACCOUNT_URL);
}

function getContainerName(): string {
  return process.env.AZURE_STORAGE_FILES_CONTAINER || "lism-files";
}

function getClient(): BlobServiceClient {
  if (cachedClient) return cachedClient;
  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
  if (!accountUrl) {
    throw new Error("AZURE_STORAGE_ACCOUNT_URL no está configurada.");
  }
  const clientId = process.env.AZURE_CLIENT_ID;
  const credential = new DefaultAzureCredential(
    clientId ? { managedIdentityClientId: clientId } : undefined,
  );
  cachedClient = new BlobServiceClient(accountUrl, credential);
  return cachedClient;
}

export async function uploadImage(
  storageKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const container = getClient().getContainerClient(getContainerName());
  const blockBlobClient = container.getBlockBlobClient(storageKey);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

export async function downloadImage(
  storageKey: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const container = getClient().getContainerClient(getContainerName());
  const blockBlobClient = container.getBlockBlobClient(storageKey);
  const exists = await blockBlobClient.exists();
  if (!exists) return null;
  const download = await blockBlobClient.download();
  const chunks: Buffer[] = [];
  const stream = download.readableStreamBody;
  if (!stream) return null;
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return {
    buffer: Buffer.concat(chunks),
    contentType: download.contentType ?? "application/octet-stream",
  };
}

export async function deleteImage(storageKey: string): Promise<void> {
  const container = getClient().getContainerClient(getContainerName());
  const blockBlobClient = container.getBlockBlobClient(storageKey);
  await blockBlobClient.deleteIfExists();
}
