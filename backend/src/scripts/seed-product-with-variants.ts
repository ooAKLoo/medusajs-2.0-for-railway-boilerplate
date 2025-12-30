/**
 * 31 North - Seed Product with Color Variants
 * 
 * This script demonstrates how to create products with multiple color variants,
 * where each variant has its own image, hover image, and color hex code stored in metadata.
 * 
 * Run with: npx medusa exec ./src/scripts/seed-product-with-variants.ts
 */

import { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";

export default async function seedProductWithVariants({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);

  logger.info("Seeding product with color variants...");

  // Get existing sales channel
  const salesChannels = await salesChannelModuleService.listSalesChannels({
    name: "31 North Store",
  });
  
  if (!salesChannels.length) {
    logger.error("Sales channel '31 North Store' not found. Run the main seed first.");
    return;
  }

  // Get existing shipping profile
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  
  if (!shippingProfiles.length) {
    logger.error("Default shipping profile not found. Run the main seed first.");
    return;
  }

  // Get silk-embroidery category
  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
    filters: { handle: "silk-embroidery" },
  });

  const silkCategory = categories[0];
  if (!silkCategory) {
    logger.error("Silk Embroidery category not found. Run the main seed first.");
    return;
  }

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Hand-Embroidered Silk Scarf",
          handle: "embroidered-silk-scarf",
          category_ids: [silkCategory.id],
          description: "A luxurious pure silk scarf with hand-embroidered floral motifs along the border. Available in multiple elegant colors.",
          weight: 120,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfiles[0].id,
          thumbnail: "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800" },
            { url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800" },
          ],
          metadata: {
            featured: "true",
            materials: "100% mulberry silk, Hand-embroidered silk threads, Hand-rolled edges",
            dimensions: "180cm x 55cm",
            weight: "120g",
            care_instructions: "Dry clean recommended. If hand washing, use cold water and silk-safe detergent. Do not wring.",
            artisan_id: "artisan-1",
            long_description: "This exquisite scarf combines the lustrous beauty of pure mulberry silk with delicate hand embroidery. Each scarf features a border of plum blossoms and magnolias, taking over 40 hours to complete. The silk is woven to a perfect weight—substantial enough to drape beautifully, yet light enough for year-round wear.",
          },
          // Define color option
          options: [{ title: "Color", values: ["Vermillion Red", "Ink Black", "Imperial Purple", "Jade Green"] }],
          // Each variant has its own metadata with image, hover_image, and color_hex
          variants: [
            {
              title: "Vermillion Red",
              sku: "ACC-SC-001-RED",
              options: { Color: "Vermillion Red" },
              prices: [
                { amount: 38000, currency_code: "usd" },
                { amount: 35000, currency_code: "eur" },
              ],
              metadata: {
                image: "/images/products/accessories/scarf-red-cover.webp",
                hover_image: "/images/products/accessories/scarf-red-model.webp",
                color_hex: "#C41E3A",
                compare_at_price: "45000", // Original price in cents
              },
            },
            {
              title: "Ink Black",
              sku: "ACC-SC-001-BLK",
              options: { Color: "Ink Black" },
              prices: [
                { amount: 38000, currency_code: "usd" },
                { amount: 35000, currency_code: "eur" },
              ],
              metadata: {
                image: "/images/products/accessories/scarf-black-cover.webp",
                hover_image: "/images/products/accessories/scarf-black-model.webp",
                color_hex: "#1C1C1C",
              },
            },
            {
              title: "Imperial Purple",
              sku: "ACC-SC-001-PUR",
              options: { Color: "Imperial Purple" },
              prices: [
                { amount: 38000, currency_code: "usd" },
                { amount: 35000, currency_code: "eur" },
              ],
              metadata: {
                image: "/images/products/accessories/scarf-purple-cover.webp",
                hover_image: "/images/products/accessories/scarf-purple-model.webp",
                color_hex: "#4B0082",
              },
            },
            {
              title: "Jade Green",
              sku: "ACC-SC-001-GRN",
              options: { Color: "Jade Green" },
              prices: [
                { amount: 38000, currency_code: "usd" },
                { amount: 35000, currency_code: "eur" },
              ],
              metadata: {
                image: "/images/products/accessories/scarf-green-cover.webp",
                hover_image: "/images/products/accessories/scarf-green-model.webp",
                color_hex: "#00A86B",
              },
            },
          ],
          sales_channels: [{ id: salesChannels[0].id }],
        },
        {
          title: "Embroidered Silk Evening Clutch",
          handle: "embroidered-silk-clutch",
          category_ids: [silkCategory.id],
          description: "An elegant evening clutch featuring hand-embroidered peony and butterfly motifs on pure silk, with gold-tone hardware.",
          weight: 350,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfiles[0].id,
          thumbnail: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800",
          images: [
            { url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800" },
          ],
          metadata: {
            featured: "true",
            materials: "Silk exterior with hand embroidery, Premium leather body, Gold-tone hardware, Silk lining",
            dimensions: "W: 25cm, H: 15cm, D: 5cm",
            weight: "350g",
            care_instructions: "Store in provided dust bag. Avoid contact with water and perfume. Professional cleaning only.",
            artisan_id: "artisan-2",
            long_description: "This stunning evening clutch transforms traditional embroidery art into a wearable statement piece. The exterior features a lavish peony bouquet with fluttering butterflies, rendered in over 50 shades of silk thread.",
          },
          options: [{ title: "Color", values: ["Champagne Gold", "Rose Pink", "Midnight Blue"] }],
          variants: [
            {
              title: "Champagne Gold",
              sku: "ACC-CL-001-GLD",
              options: { Color: "Champagne Gold" },
              prices: [
                { amount: 58000, currency_code: "usd" },
                { amount: 54000, currency_code: "eur" },
              ],
              metadata: {
                image: "/images/products/accessories/clutch-gold-cover.webp",
                hover_image: "/images/products/accessories/clutch-gold-model.webp",
                color_hex: "#F7E7CE",
              },
            },
            {
              title: "Rose Pink",
              sku: "ACC-CL-001-PNK",
              options: { Color: "Rose Pink" },
              prices: [
                { amount: 58000, currency_code: "usd" },
                { amount: 54000, currency_code: "eur" },
              ],
              metadata: {
                image: "/images/products/accessories/clutch-pink-cover.webp",
                hover_image: "/images/products/accessories/clutch-pink-model.webp",
                color_hex: "#E8B4B8",
              },
            },
            {
              title: "Midnight Blue",
              sku: "ACC-CL-001-BLU",
              options: { Color: "Midnight Blue" },
              prices: [
                { amount: 58000, currency_code: "usd" },
                { amount: 54000, currency_code: "eur" },
              ],
              metadata: {
                image: "/images/products/accessories/clutch-blue-cover.webp",
                hover_image: "/images/products/accessories/clutch-blue-model.webp",
                color_hex: "#191970",
              },
            },
          ],
          sales_channels: [{ id: salesChannels[0].id }],
        },
      ],
    },
  });

  logger.info("===========================================");
  logger.info("Products with color variants seeded successfully!");
  logger.info("");
  logger.info("Variant metadata fields:");
  logger.info("  - image: Product image for this variant");
  logger.info("  - hover_image: Image shown on hover (e.g., model wearing)");
  logger.info("  - color_hex: Color swatch hex code");
  logger.info("  - compare_at_price: Original price in cents (for sale items)");
  logger.info("===========================================");
}
