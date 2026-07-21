"use server";

import { revalidatePath } from "next/cache";
import { apiAdminUpdateOrder } from "@/lib/api/client";
import type { RedemptionOrder } from "@/lib/api/client";

export async function updateOrder(id: string, fields: { status?: RedemptionOrder["status"]; trackingNumber?: string }) {
  await apiAdminUpdateOrder(id, fields);
  revalidatePath("/admin/orders");
}
