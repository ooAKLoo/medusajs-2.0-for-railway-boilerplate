import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => {
      return {
        selector: { id: data.input.store_id },
        update: {
          supported_currencies: data.input.supported_currencies.map(
            (currency) => {
              return {
                currency_code: currency.currency_code,
                is_default: currency.is_default ?? false,
              };
            }
          ),
        },
      };
    });

    const stores = updateStoresStep(normalizedInput);

    return new WorkflowResponse(stores);
  }
);

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);

  // 31 North serves worldwide with focus on US/EU markets
  const countries = ["us", "gb", "de", "fr", "ca", "au", "jp", "cn", "sg"];

  logger.info("Seeding 31 North store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "31 North Store",
  });

  if (!defaultSalesChannel.length) {
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "31 North Store",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        {
          currency_code: "usd",
          is_default: true,
        },
        {
          currency_code: "eur",
        },
        {
          currency_code: "cny",
        },
      ],
    },
  });

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });
  logger.info("Seeding region data...");
  
  // Create US Region
  const { result: usRegionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "United States",
          currency_code: "usd",
          countries: ["us"],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const usRegion = usRegionResult[0];

  // Create International Region
  const { result: intlRegionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "International",
          currency_code: "usd",
          countries: ["gb", "de", "fr", "ca", "au", "jp", "cn", "sg"],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const intlRegion = intlRegionResult[0];
  
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    })),
  });
  logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "31 North Artisan Warehouse",
          address: {
            city: "Suzhou",
            country_code: "CN",
            address_1: "Jiangsu Province",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_location_id: stockLocation.id,
      },
    },
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  });

  logger.info("Seeding fulfillment data...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

  if (!shippingProfile) {
    const { result: shippingProfileResult } =
      await createShippingProfilesWorkflow(container).run({
        input: {
          data: [
            {
              name: "31 North Shipping",
              type: "default",
            },
          ],
        },
      });
    shippingProfile = shippingProfileResult[0];
  }

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Worldwide Artisan Delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Worldwide",
        geo_zones: countries.map(code => ({
          country_code: code,
          type: "country" as const,
        })),
      },
    ],
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard International",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Tracked shipping via postal service. 14-21 business days.",
          code: "standard",
        },
        prices: [
          { currency_code: "usd", amount: 2500 },
          { currency_code: "eur", amount: 2300 },
          { region_id: usRegion.id, amount: 2500 },
          { region_id: intlRegion.id, amount: 2500 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
      {
        name: "Express International",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Fast tracked shipping via DHL/FedEx. 5-7 business days.",
          code: "express",
        },
        prices: [
          { currency_code: "usd", amount: 6500 },
          { currency_code: "eur", amount: 6000 },
          { region_id: usRegion.id, amount: 6500 },
          { region_id: intlRegion.id, amount: 6500 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
      {
        name: "Premium White Glove",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Premium",
          description: "Insured shipping with signature. Ideal for high-value items. 7-10 business days.",
          code: "premium",
        },
        prices: [
          { currency_code: "usd", amount: 12000 },
          { currency_code: "eur", amount: 11000 },
          { region_id: usRegion.id, amount: 12000 },
          { region_id: intlRegion.id, amount: 12000 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  });
  logger.info("Finished seeding fulfillment data.");

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding publishable API key data...");
  const { result: publishableApiKeyResult } = await createApiKeysWorkflow(
    container
  ).run({
    input: {
      api_keys: [
        {
          title: "31 North Storefront",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });
  const publishableApiKey = publishableApiKeyResult[0];

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding 31 North product categories...");

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        {
          name: "Lacquerware",
          handle: "lacquerware",
          is_active: true,
        },
        {
          name: "Silk Embroidery",
          handle: "silk-embroidery",
          is_active: true,
        },
        {
          name: "Blue Calico",
          handle: "blue-calico",
          is_active: true,
        },
        {
          name: "Ceramics",
          handle: "ceramics",
          is_active: true,
        },
      ],
    },
  });

  logger.info("Seeding 31 North products...");

  await createProductsWorkflow(container).run({
    input: {
      products: [
        // ============================================
        // Lacquerware Products
        // ============================================
        {
          title: "Phoenix Rising Lacquer Vase",
          handle: "phoenix-rising-lacquer-vase",
          category_ids: [categoryResult.find((cat) => cat.name === "Lacquerware")!.id],
          description: "A stunning bodiless lacquerware vase featuring a phoenix motif in gold leaf inlay. Created using traditional Fuzhou techniques.",
          weight: 380,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          thumbnail: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800" },
          ],
          metadata: {
            featured: "true",
            materials: "Natural lacquer (urushi), Hemp cloth base, 24K gold leaf, Natural mineral pigments",
            dimensions: "H: 35cm, Diameter: 18cm",
            weight: "380g",
            care_instructions: "Dust with soft cloth. Avoid direct sunlight and extreme temperature changes.",
            artisan_id: "artisan-1",
            long_description: "This extraordinary vase represents the pinnacle of Fuzhou lacquerware craftsmanship. The 'bodiless' technique involves applying over 100 layers of lacquer to a clay form, which is then carefully removed, leaving a vessel of pure lacquer that is both incredibly light and remarkably durable.",
          },
          options: [{ title: "Size", values: ["Standard"] }],
          variants: [
            {
              title: "Standard",
              sku: "LAC-PHX-001",
              options: { Size: "Standard" },
              prices: [
                { amount: 280000, currency_code: "usd" },
                { amount: 260000, currency_code: "eur" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        {
          title: "Cherry Blossom Jewelry Box",
          handle: "cherry-blossom-lacquer-box",
          category_ids: [categoryResult.find((cat) => cat.name === "Lacquerware")!.id],
          description: "An elegant jewelry box with delicate cherry blossom design in mother-of-pearl inlay on deep vermillion lacquer.",
          weight: 450,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          thumbnail: "https://images.unsplash.com/photo-1513519245088-0e12902e35a6?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1513519245088-0e12902e35a6?w=800" },
          ],
          metadata: {
            featured: "true",
            materials: "Natural lacquer, Wooden core, Mother-of-pearl, Silk velvet lining",
            dimensions: "L: 20cm, W: 15cm, H: 8cm",
            artisan_id: "artisan-1",
          },
          options: [{ title: "Size", values: ["Standard"] }],
          variants: [
            {
              title: "Standard",
              sku: "LAC-BOX-002",
              options: { Size: "Standard" },
              prices: [
                { amount: 68000, currency_code: "usd" },
                { amount: 63000, currency_code: "eur" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },

        // ============================================
        // Silk Embroidery Products
        // ============================================
        {
          title: "Double-Sided Koi Embroidery Screen",
          handle: "double-sided-koi-embroidery",
          category_ids: [categoryResult.find((cat) => cat.name === "Silk Embroidery")!.id],
          description: "A masterpiece of Su embroidery: two different koi fish visible on each side of translucent silk, framed in rosewood.",
          weight: 2500,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          thumbnail: "https://images.unsplash.com/photo-1582562124811-c09040d0a901?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1582562124811-c09040d0a901?w=800" },
          ],
          metadata: {
            featured: "true",
            materials: "Mulberry silk threads, Transparent silk base, Rosewood frame, Natural dyes",
            dimensions: "Frame: 45cm x 35cm, Embroidery: 30cm x 25cm",
            artisan_id: "artisan-2",
            long_description: "This remarkable piece showcases the pinnacle of Suzhou embroidery: the double-sided technique where two completely different images appear on opposite sides of a single layer of translucent silk. Master Liu Xiaoming spent eight months creating this piece.",
          },
          options: [{ title: "Size", values: ["Standard"] }],
          variants: [
            {
              title: "Standard",
              sku: "EMB-KOI-001",
              options: { Size: "Standard" },
              prices: [
                { amount: 450000, currency_code: "usd" },
                { amount: 420000, currency_code: "eur" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        {
          title: "Cat Portrait Silk Embroidery",
          handle: "cat-portrait-embroidery",
          category_ids: [categoryResult.find((cat) => cat.name === "Silk Embroidery")!.id],
          description: "A hyper-realistic cat portrait using the famous 'cat fur' embroidery technique, with fur-like texture created stitch by stitch.",
          weight: 800,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          thumbnail: "https://images.unsplash.com/photo-1574158622682-e40e69881006?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1574158622682-e40e69881006?w=800" },
          ],
          metadata: {
            featured: "false",
            materials: "Mulberry silk threads, Silk satin base, Bamboo frame",
            dimensions: "Frame: 40cm x 30cm",
            artisan_id: "artisan-2",
          },
          options: [{ title: "Size", values: ["Standard"] }],
          variants: [
            {
              title: "Standard",
              sku: "EMB-CAT-001",
              options: { Size: "Standard" },
              prices: [
                { amount: 180000, currency_code: "usd" },
                { amount: 165000, currency_code: "eur" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },

        // ============================================
        // Blue Calico Products
        // ============================================
        {
          title: "Phoenix Tail Table Runner",
          handle: "phoenix-tail-table-runner",
          category_ids: [categoryResult.find((cat) => cat.name === "Blue Calico")!.id],
          description: "Hand-printed blue calico table runner featuring the traditional 'phoenix tail' pattern, naturally dyed with indigo.",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          thumbnail: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800" },
          ],
          metadata: {
            featured: "true",
            materials: "100% cotton, Natural indigo dye, Lime resist paste",
            dimensions: "L: 180cm, W: 35cm",
            care_instructions: "Hand wash in cold water. Dry flat away from direct sunlight.",
            artisan_id: "artisan-3",
          },
          options: [{ title: "Size", values: ["Standard"] }],
          variants: [
            {
              title: "Standard",
              sku: "CAL-RUN-001",
              options: { Size: "Standard" },
              prices: [
                { amount: 18000, currency_code: "usd" },
                { amount: 16500, currency_code: "eur" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        {
          title: "Fish & Lotus Silk Scarf",
          handle: "fish-and-lotus-scarf",
          category_ids: [categoryResult.find((cat) => cat.name === "Blue Calico")!.id],
          description: "Lightweight silk scarf with traditional fish and lotus pattern, representing abundance and purity.",
          weight: 80,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          thumbnail: "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800" },
          ],
          metadata: {
            featured: "false",
            materials: "100% mulberry silk, Natural indigo dye",
            dimensions: "180cm x 55cm",
            care_instructions: "Dry clean recommended.",
            artisan_id: "artisan-3",
          },
          options: [{ title: "Size", values: ["Standard"] }],
          variants: [
            {
              title: "Standard",
              sku: "CAL-SCF-001",
              options: { Size: "Standard" },
              prices: [
                { amount: 22000, currency_code: "usd" },
                { amount: 20000, currency_code: "eur" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        {
          title: "Prosperity Cushion Cover Set",
          handle: "prosperity-cushion-set",
          category_ids: [categoryResult.find((cat) => cat.name === "Blue Calico")!.id],
          description: "Set of two cushion covers featuring the 'continuous prosperity' pattern, a symbol of unending good fortune.",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          thumbnail: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800" },
          ],
          metadata: {
            featured: "false",
            materials: "100% cotton, Natural indigo dye, Hidden zipper",
            dimensions: "45cm x 45cm (set of 2)",
            care_instructions: "Machine wash cold, gentle cycle.",
            artisan_id: "artisan-3",
          },
          options: [{ title: "Size", values: ["Standard"] }],
          variants: [
            {
              title: "Standard",
              sku: "CAL-CSH-001",
              options: { Size: "Standard" },
              prices: [
                { amount: 14500, currency_code: "usd" },
                { amount: 13500, currency_code: "eur" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },

        // ============================================
        // Ceramics Products
        // ============================================
        {
          title: "Cloud Dragon Celadon Tea Set",
          handle: "cloud-dragon-tea-set",
          category_ids: [categoryResult.find((cat) => cat.name === "Ceramics")!.id],
          description: "Five-piece tea set in Longquan celadon with subtle cloud and dragon motifs revealed in the glaze.",
          weight: 1200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          thumbnail: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800" },
          ],
          metadata: {
            featured: "true",
            materials: "High-fire porcelain, Natural celadon glaze, Food-safe",
            dimensions: "Teapot: 200ml, Cups: 50ml each",
            care_instructions: "Dishwasher safe.",
            long_description: "This tea set represents the sublime art of Longquan celadon, prized for over a thousand years for its jade-like quality. The 'cloud dragon' motif is carved into the clay before glazing, becoming visible only when filled with tea.",
          },
          options: [{ title: "Size", values: ["Standard"] }],
          variants: [
            {
              title: "Standard",
              sku: "CER-TEA-001",
              options: { Size: "Standard" },
              prices: [
                { amount: 85000, currency_code: "usd" },
                { amount: 79000, currency_code: "eur" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
      ],
    },
  });
  logger.info("Finished seeding 31 North product data.");

  logger.info("Seeding inventory levels.");

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  const inventoryLevels: CreateInventoryLevelInput[] = [];
  for (const inventoryItem of inventoryItems) {
    const inventoryLevel = {
      location_id: stockLocation.id,
      stocked_quantity: 10, // Limited artisan quantities
      inventory_item_id: inventoryItem.id,
    };
    inventoryLevels.push(inventoryLevel);
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryLevels,
    },
  });

  logger.info("Finished seeding inventory levels data.");
  logger.info("===========================================");
  logger.info("31 North seed completed successfully!");
  logger.info("Publishable API Key: " + publishableApiKey.token);
  logger.info("===========================================");
}
