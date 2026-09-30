import React from "react";
import type { App } from "../lib/mock-data";
import { diffPermissions } from "../lib/version-history";
import styles from "./VersionHistory.module.css";

export default function PermissionDiffNotice({ app }: { app: App }) {
  if (!app.version_history || app.version_history.length < 2) return null;
  
  const newest = app.version_history[0];
  const previous = app.version_history[1];
  
  const added = diffPermissions(newest.permissions, previous.permissions);
  
  if (added.length === 0) return null;
  
  return (
    <div className={styles.wrapper}>
      <h3 className={styles.label}>New Permissions Added</h3>
      <ul className={styles.list}>
        {added.map(p => <li key={p} className={styles.item}>{p}</li>)}
      </ul>
    </div>
  );
}
