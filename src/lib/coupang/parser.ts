/**
 * Coupang HTML Parser
 * Parses product information from various Coupang page types
 */

export interface CoupangProduct {
  name: string;
  imageUrl: string;
  productUrl: string;
  price?: number;
  originalPrice?: number;
  discountRate?: number;
}

export type CoupangPageType = "goldbox" | "best" | "unknown";

/**
 * Detect the type of Coupang page from HTML
 */
export function detectPageType(html: string): CoupangPageType {
  if (html.includes("discount-products") || html.includes("discount-product-unit")) {
    return "goldbox";
  }
  // Add more page types as needed
  return "unknown";
}

/**
 * Parse price string to number (e.g., "11,900" -> 11900)
 */
function parsePrice(priceStr: string): number | undefined {
  const cleaned = priceStr.replace(/[^0-9]/g, "");
  const price = parseInt(cleaned, 10);
  return isNaN(price) ? undefined : price;
}

/**
 * Normalize image URL (add protocol if missing)
 */
function normalizeImageUrl(url: string): string {
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  return url;
}

/**
 * Parse Coupang Goldbox HTML
 * Extracts products from discount-product-unit elements
 */
export function parseGoldboxHtml(html: string): CoupangProduct[] {
  const products: CoupangProduct[] = [];

  // Match each product unit
  // Pattern: <a href="...coupang.com/vp/products/...">...<div class="discount-product-unit...">...</div></a>
  const productRegex = /<a[^>]+href="([^"]*coupang\.com\/vp\/products[^"]*)"[^>]*>[\s\S]*?<div[^>]+class="[^"]*discount-product-unit[^"]*"[\s\S]*?<\/a>/gi;

  let match;
  while ((match = productRegex.exec(html)) !== null) {
    const productHtml = match[0];
    const productUrl = match[1];

    // Extract image URL
    const imgMatch = productHtml.match(/<img[^>]+src="([^"]+thumbnail\.coupangcdn\.com[^"]+)"/i);
    const imageUrl = imgMatch ? normalizeImageUrl(imgMatch[1]) : "";

    // Extract product name
    const nameMatch = productHtml.match(/<span[^>]+class="[^"]*info_section__title[^"]*"[^>]*>([^<]*(?:<!--[^>]*-->)?[^<]*)<\/span>/i);
    let name = nameMatch ? nameMatch[1].trim() : "";
    // Clean up HTML comments and extra whitespace
    name = name.replace(/<!--[^>]*-->/g, "").replace(/\s+/g, " ").trim();

    // Extract discount price
    const priceMatch = productHtml.match(/<span[^>]+class="[^"]*price_info__discount[^"]*"[^>]*>[\s\S]*?([0-9,]+)[\s\S]*?<\/span>/i);
    const price = priceMatch ? parsePrice(priceMatch[1]) : undefined;

    // Extract original price
    const originalPriceMatch = productHtml.match(/<span[^>]+class="[^"]*price_info__base[^"]*"[^>]*>\s*([0-9,]+)/i);
    const originalPrice = originalPriceMatch ? parsePrice(originalPriceMatch[1]) : undefined;

    // Extract discount rate
    const discountMatch = productHtml.match(/<span[^>]+class="[^"]*sale_point_badge__content[^"]*"[^>]*>\s*([0-9]+)/i);
    const discountRate = discountMatch ? parseInt(discountMatch[1], 10) : undefined;

    // Only add if we have at least name and URL
    if (name && productUrl) {
      products.push({
        name,
        imageUrl,
        productUrl,
        price,
        originalPrice,
        discountRate,
      });
    }
  }

  return products;
}

/**
 * Main parser function - detects page type and parses accordingly
 */
export function parseCoupangHtml(html: string): {
  pageType: CoupangPageType;
  products: CoupangProduct[];
} {
  const pageType = detectPageType(html);

  let products: CoupangProduct[] = [];

  switch (pageType) {
    case "goldbox":
      products = parseGoldboxHtml(html);
      break;
    // Add more cases for other page types
    default:
      // Try goldbox parser as fallback
      products = parseGoldboxHtml(html);
  }

  return { pageType, products };
}

/**
 * Generate affiliate URL from product URL
 * Note: This is a placeholder - actual affiliate URL generation
 * depends on your Coupang Partners setup
 */
export function generateAffiliateUrl(productUrl: string, partnerId?: string): string {
  // For now, just return the original URL
  // You can implement proper affiliate URL generation here
  return productUrl;
}
