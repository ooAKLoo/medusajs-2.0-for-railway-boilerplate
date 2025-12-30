import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { IOrderModuleService } from "@medusajs/framework/types";

interface CreateOrderBody {
  email: string;
  currency_code: string;
  items: { title: string; quantity: number; unit_price: number; variant_sku?: string }[];
  shipping_address: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    province: string;
    postal_code: string;
    country_code: string;
    phone?: string;
  };
  shipping_method: string;
  shipping_total: number;
  total: number;
  payment_intent_id: string;
  merchant_order_id: string;
}

// 内存锁：防止同一 merchant_order_id 的并发请求
const processingOrders = new Set<string>();

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const body = req.body as CreateOrderBody;
    const orderService: IOrderModuleService = req.scope.resolve(Modules.ORDER);

    // 1. 内存锁检查 - 防止并发请求同时创建订单
    if (processingOrders.has(body.merchant_order_id)) {
      return res.status(409).json({
        success: false,
        error: "Order is being processed",
        duplicate: true
      });
    }
    processingOrders.add(body.merchant_order_id);

    try {
      // 2. 数据库幂等性检查 - 查询最近订单并过滤
      const [recentOrders] = await orderService.listAndCountOrders({}, { take: 100 });
      const existing = recentOrders.find(
        (o: any) => o.metadata?.merchant_order_id === body.merchant_order_id
      );

      if (existing) {
        return res.json({
          success: true,
          order: { id: existing.id, display_id: body.merchant_order_id },
          duplicate: true
        });
      }

      // 3. 创建订单
      const order = await orderService.createOrders({
        currency_code: body.currency_code.toLowerCase(),
        email: body.email,
        status: "completed",
        items: body.items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          fulfilled_quantity: 0,
          delivered_quantity: 0,
          shipped_quantity: 0,
          return_requested_quantity: 0,
          return_received_quantity: 0,
          return_dismissed_quantity: 0,
          written_off_quantity: 0,
        })),
        shipping_address: { ...body.shipping_address, address_2: body.shipping_address.address_2 || "" },
        billing_address: { ...body.shipping_address, address_2: body.shipping_address.address_2 || "" },
        shipping_methods: [{ name: body.shipping_method, amount: body.shipping_total }],
        metadata: {
          merchant_order_id: body.merchant_order_id,
          payment_intent_id: body.payment_intent_id,
          payment_status: "paid",
        },
      });

      res.status(201).json({ success: true, order: { id: order.id, display_id: body.merchant_order_id } });
    } finally {
      // 释放内存锁
      processingOrders.delete(body.merchant_order_id);
    }
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed" });
  }
};
