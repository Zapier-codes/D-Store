/**
 * Vercel live check — leaf `5.h.xii.zo`.
 *
 * Fetches the `/sitemap.xml` of the live Vercel deployment and counts the
 * number of app URLs. If the count is higher than the previous snapshot,
 * the larger crawl has successfully deployed and is being served.
 *
 * The sandbox cannot reach Vercel, so the operator must run this script
 * from a machine with internet access.
 *
 * Usage:
 *   npx tsx scripts/check-vercel-aptoide.ts
 *   npx tsx scripts/check-vercel-aptoide.ts --url https://your-vercel-url.app --min-apps 50
 */

// A module, not a global script: several scripts here define `main`.
export {};


interface Args {
  url: string;
  minApps: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    url: "https://d-store-nu.vercel.app/sitemap.xml",
    minApps: 13, // The original dummy catalog had 13 apps (mostly Aptoide)
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      case "--url": {
        const value = argv[++i];
        if (!value) throw new Error("--url needs a URL.");
        args.url = value.endsWith("/sitemap.xml") ? value : `${value.replace(/\/$/, "")}/sitemap.xml`;
        break;
      }
      case "--min-apps": {
        const value = Number(argv[++i]);
        if (!Number.isSafeInteger(value) || value < 1) throw new Error("--min-apps needs a whole number >= 1.");
        args.minApps = value;
        break;
      }
      default:
        throw new Error(`Unknown argument "${flag}".`);
    }
  }
  return args;
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }

  console.log(`Fetching sitemap from ${args.url}...`);
  
  try {
    const res = await fetch(args.url, {
      headers: { "User-Agent": "d-store-vercel-check/0.1" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`Failed to fetch sitemap: HTTP ${res.status}`);
      return 1;
    }

    const xml = await res.text();
    
    // Count occurrences of <loc>.../app/...</loc>
    const matches = xml.match(/<loc>.*?\/app\/[^<]+<\/loc>/g) || [];
    const appCount = matches.length;

    console.log(`Found ${appCount} app URLs in the live sitemap.`);
    console.log(`Required minimum: ${args.minApps}`);

    if (appCount >= args.minApps) {
      console.log("✅ Success: Live deployment is serving the larger snapshot.");
      return 0;
    } else {
      console.error("❌ Failure: Live deployment is serving fewer apps than expected. The larger snapshot may not have deployed yet.");
      return 1;
    }
  } catch (error) {
    console.error("Failed to fetch or parse sitemap:", error instanceof Error ? error.message : error);
    return 1;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error("check failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
