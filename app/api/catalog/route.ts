import { handleCatalog } from "@/lib/catalog-api";

/**
 * Read-only, cursor-paged catalog for Storeapp — leaf `7.b.i.zi`. Public, no token (see `lib/catalog-api.ts`
 * for what it serves, what it does not promise, and every status). `GET` is the only method exported.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleCatalog(request);
}
