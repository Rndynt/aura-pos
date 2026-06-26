import { buildApiHeaders } from "@/lib/outlet";

async function fetchOrderFromOpenOrders(orderId: string) {
  const headers = buildApiHeaders();
  const response = await fetch(`/api/orders/open`, { headers, credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch order");
  const json = await response.json();
  const orders = json?.data?.orders ?? json?.orders ?? [];
  const order = orders.find((candidate: any) => candidate?.id === orderId);
  if (!order) throw new Error("Failed to fetch order");
  return {
    ...order,
    billSplits: Array.isArray(order.billSplits) ? order.billSplits : [],
    payments: Array.isArray(order.payments) ? order.payments : [],
  };
}

export async function fetchOrderForPOS(orderId: string) {
  const headers = buildApiHeaders();
  const response = await fetch(`/api/orders/${orderId}`, { headers, credentials: "include" });
  if (!response.ok) {
    if (response.status >= 500) {
      return fetchOrderFromOpenOrders(orderId);
    }
    throw new Error("Failed to fetch order");
  }
  const json = await response.json();
  return json.data;
}

export async function updatePOSOrderStatus(orderId: string, status: string) {
  const headers = buildApiHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status }),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to update order status");
  }
}

export async function recordPOSPartialPayment(orderId: string, amount: number, paymentMethod: string) {
  const headers = buildApiHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`/api/orders/${orderId}/payments`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ amount, payment_method: paymentMethod }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Gagal mencatat pembayaran DP");
  }

  return response.json();
}
