import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import {
  IOrderModuleService,
  IRegionModuleService,
} from "@medusajs/framework/types";

interface OrderItem {
  title: string;
  product_title: string;
  quantity: number;
  unit_price: number;
  variant_sku?: string;
}

interface CreateOrderBody {
  email: string;
  currency_code: string;
  items: OrderItem[];
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
  subtotal: number;
  tax_total: number;
  total: number;
  payment_intent_id: string;
  merchant_order_id: string;
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const body = req.body as CreateOrderBody;

    // Validate required fields
    if (!body.email || !body.items?.length || !body.shipping_address) {
      return res.status(400).json({
        error: "Missing required fields: email, items, and shipping_address are required",
      });
    }

    const orderModuleService: IOrderModuleService = req.scope.resolve(
      Modules.ORDER
    );
    const regionModuleService: IRegionModuleService = req.scope.resolve(
      Modules.REGION
    );

    // Get default region (or find by country code)
    const regions = await regionModuleService.listRegions({});
    const regionList = Array.isArray(regions) ? regions : (regions as any).regions || [];
    const region = regionList.find(
      (r: any) =>
        r.countries?.some(
          (c: any) =>
            c.iso_2?.toLowerCase() ===
            body.shipping_address.country_code.toLowerCase()
        )
    ) || regionList[0];

    if (!region) {
      return res.status(400).json({
        error: "No region found for the specified country",
      });
    }

    // Generate display_id in format "31N-TIMESTAMP"
    const displayId = body.merchant_order_id || `31N-${Date.now()}`;

    // Create order items with required fields for Medusa v2
    const orderItems = body.items.map((item, index) => ({
      title: item.title,
      subtitle: item.product_title || item.title,
      quantity: item.quantity,
      unit_price: Math.round(item.unit_price * 100), // Convert to cents
      fulfilled_quantity: 0,
      delivered_quantity: 0,
      shipped_quantity: 0,
      return_requested_quantity: 0,
      return_received_quantity: 0,
      return_dismissed_quantity: 0,
      written_off_quantity: 0,
      metadata: {
        variant_sku: item.variant_sku || "",
        index: index,
      },
    }));

    // Create the order using Medusa v2 Order Module
    const order = await orderModuleService.createOrders({
      currency_code: body.currency_code.toLowerCase(),
      email: body.email,
      shipping_address: {
        first_name: body.shipping_address.first_name,
        last_name: body.shipping_address.last_name,
        address_1: body.shipping_address.address_1,
        address_2: body.shipping_address.address_2 || "",
        city: body.shipping_address.city,
        province: body.shipping_address.province,
        postal_code: body.shipping_address.postal_code,
        country_code: body.shipping_address.country_code.toLowerCase(),
        phone: body.shipping_address.phone || "",
      },
      billing_address: {
        first_name: body.shipping_address.first_name,
        last_name: body.shipping_address.last_name,
        address_1: body.shipping_address.address_1,
        address_2: body.shipping_address.address_2 || "",
        city: body.shipping_address.city,
        province: body.shipping_address.province,
        postal_code: body.shipping_address.postal_code,
        country_code: body.shipping_address.country_code.toLowerCase(),
        phone: body.shipping_address.phone || "",
      },
      items: orderItems,
      shipping_methods: [
        {
          name: body.shipping_method,
          amount: Math.round(body.shipping_total * 100),
        },
      ],
      region_id: region.id,
      metadata: {
        payment_intent_id: body.payment_intent_id,
        merchant_order_id: body.merchant_order_id,
        display_id: displayId,
        payment_provider: "airwallex",
        payment_status: "captured",
      },
    });

    console.log(`Order created: ${order.id}, display_id: ${displayId}`);

    res.status(201).json({
      success: true,
      order: {
        id: order.id,
        display_id: displayId,
        email: order.email,
        currency_code: order.currency_code,
        total: body.total,
        status: "pending",
        created_at: order.created_at,
      },
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create order",
    });
  }
};
