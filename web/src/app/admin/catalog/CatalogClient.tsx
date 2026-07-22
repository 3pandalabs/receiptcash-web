"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Gift } from "@/lib/api/client";
import { createGift, updateGift } from "./actions";

const emptyForm = {
  name: "",
  description: "",
  pointsCost: "",
  stockLevel: "",
  imageEmoji: "🎁",
};

export default function CatalogClient({ initialGifts }: { initialGifts: Gift[] }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await createGift({
        name: form.name,
        description: form.description || null,
        pointsCost: Number(form.pointsCost),
        stockLevel: form.stockLevel ? Number(form.stockLevel) : null,
        imageEmoji: form.imageEmoji || null,
      });
      setForm(emptyForm);
      router.refresh();
    } catch {
      setError("Could not save this gift.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate(id: string, fields: Partial<Gift>) {
    await updateGift(id, fields);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <Field label="Name">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Description">
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Points cost">
          <input
            required
            type="number"
            min={1}
            value={form.pointsCost}
            onChange={(e) => setForm({ ...form, pointsCost: e.target.value })}
            className="input w-28"
          />
        </Field>
        <Field label="Stock (blank = unlimited)">
          <input
            type="number"
            min={0}
            value={form.stockLevel}
            onChange={(e) => setForm({ ...form, stockLevel: e.target.value })}
            className="input w-32"
          />
        </Field>
        <Field label="Icon">
          <input
            value={form.imageEmoji}
            onChange={(e) => setForm({ ...form, imageEmoji: e.target.value })}
            className="input w-16"
          />
        </Field>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          Add gift
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
              <th className="p-3">Icon</th>
              <th className="p-3">Name</th>
              <th className="p-3">Points</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {initialGifts.map((gift) => (
              <tr key={gift.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="p-3">{gift.imageEmoji ?? "🎁"}</td>
                <td className="p-3">
                  <div className="font-medium">{gift.name}</div>
                  {gift.description && (
                    <div className="text-xs text-zinc-500">{gift.description}</div>
                  )}
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    defaultValue={gift.pointsCost}
                    onBlur={(e) => handleUpdate(gift.id, { pointsCost: Number(e.target.value) })}
                    className="input w-20"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    defaultValue={gift.stockLevel ?? ""}
                    placeholder="∞"
                    onBlur={(e) =>
                      handleUpdate(gift.id, {
                        stockLevel: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="input w-20"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="checkbox"
                    defaultChecked={gift.isActive}
                    onChange={(e) => handleUpdate(gift.id, { isActive: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx global>{`
        .input {
          border-radius: 0.5rem;
          border: 1px solid rgb(212 212 216);
          padding: 0.4rem 0.6rem;
          font-size: 0.875rem;
          background: transparent;
        }
        :global(.dark) .input {
          border-color: rgb(63 63 70);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
      {label}
      {children}
    </label>
  );
}
