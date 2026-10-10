import type { App } from "@/lib/catalog";
import { appDownloadUrl } from "@/lib/download";
import { isThirdParty } from "@/lib/trust";
import InstallButton from "./InstallButton";

/**
 * The one download control — operator-directed 2026-10-10.
 *
 * A website cannot install an Android app, so the details page offers Download and Share and nothing
 * else. There used to be two controls (`InstallButton` for first-party apps, simulating an install,
 * and a separate `ThirdPartyDownloadButton` for third-party links); they are now one `InstallButton`,
 * with `lib/download.ts` choosing the right URL:
 *
 *   - first-party (Zealot): this store's own `/api/apps/<slug>/download` door, so the browser's
 *     download shows this store's domain and supports resume;
 *   - third-party (Aptoide): the app's own source URL.
 *
 * `appDownloadUrl` returns `""` when there is nothing honest to link to (no release attached, a
 * pulled release, or a third-party entry with no usable https source), and `InstallButton` renders
 * the disabled control for it.
 */
export default function DownloadControl({ app }: { app: Pick<App, "slug" | "name" | "apk" | "version_status" | "origin"> }) {
  const downloadUrl = appDownloadUrl({ ...app, third_party: isThirdParty(app) });
  return <InstallButton appSlug={app.slug} appName={app.name} downloadUrl={downloadUrl} />;
}
