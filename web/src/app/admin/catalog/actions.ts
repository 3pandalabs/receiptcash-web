"use server";

import { revalidatePath } from "next/cache";
import { apiAdminCreateGift, apiAdminUpdateGift, type Gift } from "@/lib/api/client";

export async function createGift(input: {
  name: string;
  description: string | null;
  pointsCost: number;
  stockLevel: number | null;
  imageEmoji: string | null;
}) {
  await apiAdminCreateGift(input);
  revalidatePath("/admin/catalog");
}

export async function updateGift(id: string, fields: Partial<Gift>) {
  await apiAdminUpdateGift(id, fields);
  revalidatePath("/admin/catalog");
}
