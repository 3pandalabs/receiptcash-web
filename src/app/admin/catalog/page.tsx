"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Gift = {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  stock_level: number | null;
  image_emoji: string | null;
  is_active: boolean;
};

const emptyForm = {
  name: "",
  description: "",
  points_cost: "",
  stock_level: "",
  image_emoji: "🎁",
};

export default function CatalogPage() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadGifts() {
    const supabase = createClient();
    const { data } = await supabase.from("gifts").select("*").order("points_cost");
    setGifts(data ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.from("gifts").select("*").order("points_cost");
      setGifts(data ?? []);
      setIsLoading(false);
    }
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("gifts").insert({
      name: form.name,
      description: form.description || null,
      points_cost: Number(form.points_cost),
      stock_level: form.stock_level ? Number(form.stock_level) : null,
      image_emoji: form.image_emoji || null,
    });
    setIsSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm(emptyForm);
    await loadGifts();
  }

  async function updateGift(id: string, fields: Partial<Gift>) {
    const supabase = createClient();
    await supabase.from("gifts").update(fields).eq("id", id);
    await loadGifts();
  }

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading...</p>;
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
            value={form.points_cost}
            onChange={(e) => setForm({ ...form, points_cost: e.target.value })}
            className="input w-28"
          />
        </Field>
        <Field label="Stock (blank = unlimited)">
          <input
            type="number"
            min={0}
            value={form.stock_level}
            onChange={(e) => setForm({ ...form, stock_level: e.target.value })}
            className="input w-32"
          />
        </Field>
        <Field label="Icon">
          <input
            value={form.image_emoji}
            onChange={(e) => setForm({ ...form, image_emoji: e.target.value })}
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
            {gifts.map((gift) => (
              <tr key={gift.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="p-3">{gift.image_emoji ?? "🎁"}</td>
                <td className="p-3">
                  <div className="font-medium">{gift.name}</div>
                  {gift.description && (
                    <div className="text-xs text-zinc-500">{gift.description}</div>
                  )}
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    defaultValue={gift.points_cost}
                    onBlur={(e) => updateGift(gift.id, { points_cost: Number(e.target.value) })}
                    className="input w-20"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    defaultValue={gift.stock_level ?? ""}
                    placeholder="∞"
                    onBlur={(e) =>
                      updateGift(gift.id, {
                        stock_level: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="input w-20"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={gift.is_active}
                    onChange={(e) => updateGift(gift.id, { is_active: e.target.checked })}
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
