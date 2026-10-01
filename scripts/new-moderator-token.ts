/**
 * Moderator token generator — leaf `3.c.vi.zo`.
 *
 *   npx tsx scripts/new-moderator-token.ts <id>
 *       Generates a token locally, prints it ONCE, and prints the
 *       { "id", "sha256" } entry to add to the MODERATOR_TOKENS JSON array.
 *       Give the token to the moderator privately; it is not stored anywhere
 *       and cannot be shown again. Only its SHA-256 goes in Vercel.
 *
 *   npx tsx scripts/new-moderator-token.ts --check
 *       Reads MODERATOR_TOKENS from the environment and says whether it is
 *       valid, listing the moderator ids (never digests).
 *
 * The id is validated by the same code the gate uses, and the digest comes
 * from the same function, so the two cannot drift.
 */
import { randomBytes } from "node:crypto";
import { MODERATOR_TOKENS_ENV, moderatorTokenDigest, readModeratorConfig } from "../lib/moderator-auth";

async function main(): Promise<number> {
  const arg = process.argv[2];

  if (arg === "--check") {
    const config = readModeratorConfig(process.env);
    if (config.status === "ok") {
      console.log(`${MODERATOR_TOKENS_ENV} is valid: ${config.moderators.length} moderator(s): ${config.moderators.map((m) => m.id).join(", ")}`);
      return 0;
    }
    console.error(config.status === "unconfigured" ? `${MODERATOR_TOKENS_ENV} is unset or empty: moderation answers 503.` : `${MODERATOR_TOKENS_ENV} is invalid (moderation answers 503): ${config.reason}`);
    return 1;
  }

  if (!arg || arg.startsWith("-")) {
    console.error("Usage: npx tsx scripts/new-moderator-token.ts <id>   |   --check");
    console.error("An id is 2 to 32 characters: lowercase letters, digits, '.', '_' or '-', starting with a letter or digit.");
    return 2;
  }

  // 24 random bytes in base64 is exactly 32 characters: the gate's minimum, no padding.
  const token = randomBytes(24).toString("base64");
  const entry = { id: arg, sha256: await moderatorTokenDigest(token) };

  // Same validation the gate applies to the whole config.
  const check = readModeratorConfig({ [MODERATOR_TOKENS_ENV]: JSON.stringify([entry]) });
  if (check.status !== "ok") {
    console.error("Refused: that is not a valid id. An id is 2 to 32 characters: lowercase letters, digits, '.', '_' or '-', starting with a letter or digit.");
    return 2;
  }

  console.log("Token (shown once; give it to the moderator privately, never commit it):");
  console.log(`  ${token}`);
  console.log("");
  console.log(`Add this entry to the ${MODERATOR_TOKENS_ENV} JSON array in Vercel (then redeploy):`);
  console.log(`  ${JSON.stringify(entry)}`);
  console.log("");
  console.log("The moderator signs in with the id as the username and the token as the password.");
  return 0;
}

main().then((code) => process.exit(code));
