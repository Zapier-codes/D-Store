/**
 * Trust config + verification primitives for Zealot's signed catalog index
 * — leaf `5.g.iv.zo`. Deliberately its own file, separate from
 * `lib/sources/zealot.ts` (the reader, `5.g.i.zi`): this is the part that
 * must NOT trust anything the index itself claims about its own signer.
 * Per this leaf's own spec — "the index is never its own trust anchor" —
 * the public key(s) below are pinned in this repo's own config, not
 * fetched from Zealot's `signing_key.pub` (which Zealot's publish step
 * does put alongside `index.json`/`index.json.sig`, per
 * `app/services/catalog_index/publish.rb` in the Zealot repo — but that
 * exists so a *human* operator can copy the key out-of-band once, not so
 * a reader can fetch-and-trust it automatically; this reader never
 * fetches that file).
 *
 * `dbfa9202d7894165` was confirmed directly by the operator against a
 * live `POST /ops/catalog_index_bootstrap` run on the deployed Zealot
 * service. That run's exact log lines ("key: already exists key_id=...",
 * "key: public_key=...") independently match the code path added in
 * Zealot's own commit `aa68f412` (`fix(task-27b-iv): always show the
 * signing key's public key...`), confirmed by reading that commit's diff
 * directly in this session — not taken on the operator's word alone.
 */

export interface PinnedKey {
  keyId: string;
  /**
   * Standard (non-URL-safe) base64 of the raw 32-byte Ed25519 public key —
   * the same encoding Zealot's `CatalogIndexSigningKey#public_key` column
   * and `signing_key.pub` file both use.
   */
  publicKeyBase64: string;
}

/**
 * Rotation window: this reader accepts a signature from ANY key in this
 * list, so a planned rotation is "add the new key here, leave the old one
 * in place until the rotation is confirmed done, then remove the old one
 * in a follow-up change" — never replace this array's only entry in one
 * step, which would make an in-flight rotation look like a rejected
 * signature instead.
 */
export const PINNED_KEYS: readonly PinnedKey[] = [
  { keyId: "dbfa9202d7894165", publicKeyBase64: "k0DusCjl424tYHMJ1XZi3jGQI/Ntl//qM+hAVweNIFY=" },
];

/** Matches Zealot's `CatalogIndex::Serializer::SCHEMA_VERSION` (confirmed by reading that file this session). An index at any other version is refused outright, not best-effort parsed. */
export const SUPPORTED_SCHEMA_VERSION = 2;

/**
 * Verifies `signatureBase64` (detached Ed25519, RFC 8032, no pre-hash —
 * Zealot's own documented format) over the *exact* bytes of
 * `indexJsonText` — never a re-serialized/re-parsed copy, since re-encoding
 * JSON is not guaranteed to reproduce the exact bytes that were signed.
 * Tries every pinned key, returns the first that matches, `null` if none
 * do. Node's `crypto.verify` needs a `KeyObject`; a raw Ed25519 public key
 * imports cleanly via the JWK `OKP`/`Ed25519` shape (`x` is the raw key,
 * base64url-encoded) — no hand-rolled SPKI DER prefix needed, confirmed
 * against Node 22's `crypto` this session.
 *
 * Dynamic `node:crypto` import for the same reason `lib/sources/
 * aptoide.ts` dynamically imports `node:fs`/`node:path`: this module must
 * still load in places Node builtins aren't available (e.g. `next
 * build`'s client/edge graph analysis), even though it only ever actually
 * runs server-side.
 */
export async function verifySignature(indexJsonText: string, signatureBase64: string): Promise<PinnedKey | null> {
  const crypto = await import("node:crypto");
  const message = Buffer.from(indexJsonText, "utf-8");

  let signature: Buffer;
  try {
    signature = Buffer.from(signatureBase64.trim(), "base64");
  } catch {
    return null;
  }

  for (const key of PINNED_KEYS) {
    try {
      const raw = Buffer.from(key.publicKeyBase64, "base64");
      if (raw.length !== 32) continue; // malformed pinned entry -- never a reason to throw, just never matches
      const publicKey = crypto.createPublicKey({
        key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") },
        format: "jwk",
      });
      if (crypto.verify(null, message, publicKey, signature)) return key;
    } catch {
      continue; // this pinned key didn't parse or didn't match -- try the next one, never throw
    }
  }
  return null;
}

/**
 * Anti-rollback state — the part of `5.g.iv.zo` that has to survive across
 * fetches. The reader (`lib/sources/zealot.ts`) persists this to
 * `storage/downloads/zealot-index-state.json`, the same directory
 * `lib/sources/aptoide.ts`'s ingest snapshot already lives in.
 *
 * ❓ open, flagged rather than silently decided: reading Zealot's own
 * `app/services/catalog_index/signer.rb` this session shows `Signer`
 * never passes a real `sequence` to `CatalogIndex::Serializer` — every
 * index published today carries `sequence: 0` (a gap Zealot's own task
 * 29b already flagged on its side, in its handover notes). So `sequence`
 * alone can't catch a replay yet; `generated_at` is the field that's
 * actually strictly increasing in production today
 * (`Signer.next_generated_at`'s whole job). `isRollback` below keys off
 * whichever field is informative: reject a lower `sequence` outright:
 * reject when `sequence` ties (true for every index today) and
 * `generated_at` hasn't strictly advanced.
 */
export interface IndexState {
  sequence: number;
  generatedAt: string; // ISO 8601
}

export function isRollback(candidate: { sequence: number; generatedAt: string }, last: IndexState | null): boolean {
  if (!last) return false;
  if (candidate.sequence < last.sequence) return true;
  if (candidate.sequence === last.sequence) {
    return new Date(candidate.generatedAt).getTime() <= new Date(last.generatedAt).getTime();
  }
  return false; // candidate.sequence > last.sequence -- always a genuine advance
}

export function isExpired(expiresAtIso: string, now: Date = new Date()): boolean {
  return new Date(expiresAtIso).getTime() <= now.getTime();
}
