"use server";

import { redirect } from "next/navigation";
import { apiLogout } from "@/lib/api/client";

export async function signOut() {
  await apiLogout();
  redirect("/");
}
