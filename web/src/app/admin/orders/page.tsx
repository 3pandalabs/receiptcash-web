import { apiAdminListAllOrders } from "@/lib/api/client";
import OrdersClient from "./OrdersClient";

// apiAdminListAllOrders calls GET /admin/redemption-orders, which does not
// exist in api/ yet - see the NOTE above that function in lib/api/client.ts.
export default async function OrdersPage() {
  const orders = await apiAdminListAllOrders();
  return <OrdersClient initialOrders={orders} />;
}
