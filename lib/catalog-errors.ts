/**
 * The error a catalog LOOKUP throws when the catalog could not be read — leaf `5.l.xviii.zi`.
 *
 * Why an error and not `null` / `false` / `[]`: a lookup that answers "no such app" for an outage gets a
 * 404 cached and crawled for an app that exists. A caller that must tell "absent" from "unreadable"
 * (`getAppBySlug`, `catalogHasSlug`, `getDeveloperBySlug`, `getSimilarApps`, `getAppsByDeveloper`,
 * `getDeveloperApps`, `getDispatchCatalog`) gets this error instead, and the nearest `error.tsx`
 * boundary (or the route's own `502`) answers.
 *
 * Counts, shelves and search do NOT throw this: a footer or a count must not take a page down, so
 * they degrade to the first-party result and log one fixed line.
 *
 * Carries no slug, query, URL, status code or upstream message, on purpose: it can reach logs and an
 * error boundary, and what failed is already one fixed line in the server log. No server-only imports,
 * so a page, a route or a test may import it freely.
 */
export class CatalogUnavailableError extends Error {
  readonly reason = "catalog_unavailable" as const;
  constructor() {
    super("the catalog could not be read");
    this.name = "CatalogUnavailableError";
  }
}
