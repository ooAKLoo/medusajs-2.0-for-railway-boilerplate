import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules, PaymentCollectionStatus } from "@medusajs/framework/utils";
import {
  IOrderModuleService,
  IRegionModuleService,
  IPaymentModuleService,
  RemoteLink,
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
    // Note: Medusa stores prices in cents, but for direct order creation we use dollar values
    const orderItems = body.items.map((item, index) => ({
      title: item.title,
      subtitle: item.product_title || item.title,
      quantity: item.quantity,
      unit_price: item.unit_price, // Already in dollars from frontend
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

    // Get payment module service
    const paymentModuleService: IPaymentModuleService = req.scope.resolve(
      Modules.PAYMENT
    );

    // Use dollar values directly
    const totalAmount = body.total;

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
          amount: body.shipping_total,
        },
      ],
      region_id: region.id,
      metadata: {
        payment_intent_id: body.payment_intent_id,
        merchant_order_id: body.merchant_order_id,
        display_id: displayId,
        payment_provider: "airwallex",
      },
    });

    console.log(`Order created: ${order.id}, display_id: ${displayId}`);

    // Create payment collection and link to order
    try {
      // Get remote link service
      const remoteLink: RemoteLink = req.scope.resolve(
        ContainerRegistrationKeys.REMOTE_LINK
      );

      // Create payment collection
      const paymentCollection = await paymentModuleService.createPaymentCollections({
        currency_code: body.currency_code.toLowerCase(),
        amount: totalAmount,
        region_id: region.id,
        status: PaymentCollectionStatus.COMPLETED,
        metadata: {
          order_id: order.id,
        },
      });

      // Create a captured payment
      await paymentModuleService.createPayments({
        amount: totalAmount,
        currency_code: body.currency_code.toLowerCase(),
        provider_id: "pp_system_default",
        payment_collection_id: paymentCollection.id,
        data: {
          payment_intent_id: body.payment_intent_id,
          provider: "airwallex",
        },
        captured_at: new Date(),
        metadata: {
          payment_intent_id: body.payment_intent_id,
          merchant_order_id: body.merchant_order_id,
        },
      });

      // Link payment collection to order using Remote Link
      await remoteLink.create({
        [Modules.ORDER]: {
          order_id: order.id,
        },
        [Modules.PAYMENT]: {
          payment_collection_id: paymentCollection.id,
        },
      });

      // Update order metadata
      await orderModuleService.updateOrders(order.id, {
        metadata: {
          ...order.metadata,
          payment_collection_id: paymentCollection.id,
          payment_status: "captured",
        },
      });

      console.log(`Payment collection created and linked to order: ${paymentCollection.id}`);
    } catch (paymentError) {
      // Log but don't fail - order is still created
      console.error("Failed to create payment collection:", paymentError);
    }

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
