import { apiAdminListGifts } from "@/lib/api/client";
import CatalogClient from "./CatalogClient";

export default async function CatalogPage() {
  const gifts = await apiAdminListGifts();
  return <CatalogClient initialGifts={[...gifts].sort((a, b) => a.pointsCost - b.pointsCost)} />;
}
