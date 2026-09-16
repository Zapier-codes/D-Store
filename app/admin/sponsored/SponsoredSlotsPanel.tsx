"use client";

import { useState } from "react";
import type { SponsoredSlot } from "@/lib/catalog";
import styles from "./page.module.css";

/**
 * Client half of the `3.c.i.zo` scheduling tool. Same optimistic
 * client-side pattern `FeaturingTable` (`3.c.i.zi`) established: local
 * state seeded from the server-fetched prop, mutated immediately on
 * submit/delete, with a plain error message (no rollback needed here
 * the way a toggle needs one — a failed create/edit/delete just
 * re-fetches nothing and leaves the list as it was before the action,
 * since unlike a toggle there's no "previous value" to optimistically
 * flip back to for a brand-new or just-edited row).
 *
 * Today's date (`todayStr`) is computed once on mount for the
 * "active today" indicator next to each row — a lightweight client-side
 * mirror of `getActiveSponsoredSlot`'s own day-granularity comparison
 * in `lib/catalog.ts`, so the admin can see at a glance which row (if
 * any) is the one currently live on the storefront, matching what
 * `SponsoredCard` would actually render right now without a second
 * round trip to ask the server which one that is.
 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isActive(slot: SponsoredSlot, today: string): boolean {
  return slot.start_date <= today && today <= slot.end_date;
}

const emptyForm = { name: "", summary: "", start_date: "", end_date: "" };

export default function SponsoredSlotsPanel({
  initialSlots,
}: {
  initialSlots: SponsoredSlot[];
}) {
  const [slots, setSlots] = useState(initialSlots);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const today = todayStr();

  function startEdit(slot: SponsoredSlot) {
    setEditingId(slot.id);
    setForm({
      name: slot.name,
      summary: slot.summary,
      start_date: slot.start_date,
      end_date: slot.end_date,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/admin/sponsored/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        setSlots((prev) => prev.map((s) => (s.id === editingId ? data.slot : s)));
        cancelEdit();
      } else {
        const res = await fetch(`/api/admin/sponsored`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Create failed");
        setSlots((prev) => [data.slot, ...prev]);
        setForm(emptyForm);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/sponsored/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Delete failed");
      }
      setSlots((prev) => prev.filter((s) => s.id !== id));
      if (editingId === id) cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className={styles.panel}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formRow}>
          <label className={styles.label}>
            Name
            <input
              className={styles.input}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className={styles.label}>
            Summary
            <input
              className={styles.input}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              required
            />
          </label>
        </div>
        <div className={styles.formRow}>
          <label className={styles.label}>
            Start date
            <input
              type="date"
              className={styles.input}
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              required
            />
          </label>
          <label className={styles.label}>
            End date
            <input
              type="date"
              className={styles.input}
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              required
            />
          </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {editingId ? "Save changes" : "Schedule slot"}
          </button>
          {editingId && (
            <button type="button" className={styles.secondaryButton} onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Summary</th>
            <th className={styles.th}>Window</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {slots.length === 0 && (
            <tr>
              <td className={styles.td} colSpan={5}>
                No slots scheduled yet — the storefront shows its default
                placeholder.
              </td>
            </tr>
          )}
          {slots.map((slot) => (
            <tr key={slot.id} className={styles.row}>
              <td className={styles.td}>{slot.name}</td>
              <td className={styles.td}>{slot.summary}</td>
              <td className={styles.td}>
                {slot.start_date} &ndash; {slot.end_date}
              </td>
              <td className={styles.td}>
                {isActive(slot, today) ? (
                  <span className={styles.statusActive}>Active today</span>
                ) : (
                  <span className={styles.statusInactive}>Not active</span>
                )}
              </td>
              <td className={styles.td}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => startEdit(slot)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => handleDelete(slot.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
