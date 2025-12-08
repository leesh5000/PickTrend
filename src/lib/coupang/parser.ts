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

export interface ParseResult {
  pageType: CoupangPageType;
  products: CoupangProduct[];
  /** Total lazy containers found (both loaded and hidden) */
  totalContainers: number;
  /** Number of hidden/unloaded containers */
  hiddenContainers: number;
  /** Warning message if some products were not loaded */
  warning?: string;
}

export type CoupangPageType = "goldbox" | "best" | "unknown";

/**
 * Detect the type of Coupang page from HTML
 */
export function detectPageType(html: string): CoupangPageType {
  if (html.includes("discount-products") || html.includes("discount-product-unit")) {
    return "goldbox";
  }
  // New goldbox structure (partners page)
  if (html.includes("product-item") && html.includes("product-description")) {
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
 * Parse new Goldbox HTML structure (product-item)
 * Used by Coupang Partners page
 */
export function parseNewGoldboxHtml(html: string): CoupangProduct[] {
  const products: CoupangProduct[] = [];
  const seen = new Set<string>();

  // Match product-item blocks
  const itemRegex = /<div[^>]+class="product-item"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

  let itemMatch;
  while ((itemMatch = itemRegex.exec(html)) !== null) {
    const itemContent = itemMatch[1];

    // Extract product name from LinesEllipsis
    const nameMatch = itemContent.match(/<div[^>]+class="LinesEllipsis[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    let name = "";
    if (nameMatch) {
      name = nameMatch[1]
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/\s+/g, " ")
        .trim();
    }

    if (!name || seen.has(name)) continue;
    seen.add(name);

    // Extract image URL
    const imgMatch = itemContent.match(/<img[^>]+src="([^"]*coupangcdn[^"]*)"/i);
    const imageUrl = imgMatch ? normalizeImageUrl(imgMatch[1]) : "";

    // Extract sale price
    const priceMatch = itemContent.match(/<div[^>]+class="sale-price"[^>]*>[\s\S]*?<span[^>]+class="currency-label"[^>]*>([\s\S]*?)<\/span>/i);
    let price: number | undefined;
    if (priceMatch) {
      const priceNumbers = priceMatch[1].match(/([0-9,]+)/);
      if (priceNumbers) {
        price = parsePrice(priceNumbers[1]);
      }
    }

    // Extract original price and discount from discount div
    const discountMatch = itemContent.match(/<div[^>]+class="discount"[^>]*>([\s\S]*?)<\/div>/i);
    let originalPrice: number | undefined;
    let discountRate: number | undefined;
    if (discountMatch) {
      const rateMatch = discountMatch[1].match(/(\d+)%/);
      if (rateMatch) {
        discountRate = parseInt(rateMatch[1], 10);
      }
      const origPriceMatch = discountMatch[1].match(/([0-9,]+)<span>원/);
      if (origPriceMatch) {
        originalPrice = parsePrice(origPriceMatch[1]);
      }
    }

    if (name) {
      products.push({
        name,
        imageUrl,
        productUrl: "", // New structure doesn't have URLs
        price,
        originalPrice,
        discountRate,
      });
    }
  }

  return products;
}

/**
 * Parse Coupang Goldbox HTML (legacy)
 * Extracts products from discount-product-unit elements
 */
export function parseGoldboxHtml(html: string): CoupangProduct[] {
  const products: CoupangProduct[] = [];
  const seen = new Set<string>();

  // Decode HTML entities
  const decodedHtml = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

  // Strategy: Find all anchor tags with coupang product URLs
  // Match both /vp/products/ and /np/products/ URLs
  const anchorRegex = /<a[^>]+href="(https?:\/\/www\.coupang\.com\/[vn]p\/products\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let anchorMatch;
  while ((anchorMatch = anchorRegex.exec(decodedHtml)) !== null) {
    const productUrl = anchorMatch[1];
    const anchorContent = anchorMatch[2];

    // Skip if not a discount product unit
    if (!anchorContent.includes("discount-product-unit")) {
      continue;
    }

    // Skip duplicates
    if (seen.has(productUrl)) {
      continue;
    }
    seen.add(productUrl);

    // Extract image URL - look for thumbnail.coupangcdn.com
    const imgMatch = anchorContent.match(/<img[^>]+src="([^"]*(?:thumbnail\.coupangcdn\.com|coupangcdn\.com)[^"]*)"/i);
    const imageUrl = imgMatch ? normalizeImageUrl(imgMatch[1]) : "";

    // Extract product name from info_section__title
    const nameMatch = anchorContent.match(/<span[^>]+class="[^"]*info_section__title[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    let name = "";
    if (nameMatch) {
      // Clean up: remove HTML comments, tags, and extra whitespace
      name = nameMatch[1]
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Extract discount price
    const priceMatch = anchorContent.match(/<span[^>]+class="[^"]*price_info__discount[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    let price: number | undefined;
    if (priceMatch) {
      const priceNumbers = priceMatch[1].match(/([0-9,]+)/);
      if (priceNumbers) {
        price = parsePrice(priceNumbers[1]);
      }
    }

    // Extract original price
    const originalPriceMatch = anchorContent.match(/<span[^>]+class="[^"]*price_info__base[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    let originalPrice: number | undefined;
    if (originalPriceMatch) {
      const priceNumbers = originalPriceMatch[1].match(/([0-9,]+)/);
      if (priceNumbers) {
        originalPrice = parsePrice(priceNumbers[1]);
      }
    }

    // Extract discount rate
    const discountMatch = anchorContent.match(/<span[^>]+class="[^"]*sale_point_badge__content[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    let discountRate: number | undefined;
    if (discountMatch) {
      const rateNumbers = discountMatch[1].match(/([0-9]+)/);
      if (rateNumbers) {
        discountRate = parseInt(rateNumbers[1], 10);
      }
    }

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
 * Count lazy loading containers to detect unloaded products
 */
function countLazyContainers(html: string): { total: number; hidden: number } {
  // Count all lazy-container elements
  const allContainers = (html.match(/class="[^"]*lazy-container[^"]*"/g) || []).length;

  // Count lazy-hidden (unloaded) containers
  const hiddenContainers = (html.match(/class="[^"]*lazy-container\s+lazy-hidden[^"]*"/g) || []).length;

  return { total: allContainers, hidden: hiddenContainers };
}

/**
 * Parse JSON input from console script
 */
function parseJsonInput(jsonStr: string): CoupangProduct[] {
  try {
    const data = JSON.parse(jsonStr);
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: Record<string, unknown>) => item && item.name) // URL is optional now
      .map((item: Record<string, unknown>) => ({
        name: String(item.name || "").trim(),
        productUrl: item.url ? String(item.url) : "",
        imageUrl: item.image ? normalizeImageUrl(String(item.image)) : "",
        price: item.price ? parseInt(String(item.price).replace(/[^0-9]/g, ""), 10) : undefined,
        originalPrice: item.originalPrice
          ? parseInt(String(item.originalPrice).replace(/[^0-9]/g, ""), 10)
          : undefined,
        discountRate: item.discount ? parseInt(String(item.discount), 10) : undefined,
      }));
  } catch {
    return [];
  }
}

/**
 * Detect if input is JSON
 */
function isJsonInput(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]");
}

/**
 * Main parser function - detects page type and parses accordingly
 */
export function parseCoupangHtml(input: string): ParseResult {
  // Try JSON first
  if (isJsonInput(input)) {
    const products = parseJsonInput(input);
    if (products.length > 0) {
      return {
        pageType: "goldbox",
        products,
        totalContainers: products.length,
        hiddenContainers: 0,
        warning: undefined,
      };
    }
  }

  // Fall back to HTML parsing
  const pageType = detectPageType(input);
  const { total: totalContainers, hidden: hiddenContainers } = countLazyContainers(input);

  let products: CoupangProduct[] = [];

  switch (pageType) {
    case "goldbox":
      // Try new structure first, then legacy
      if (input.includes("product-item") && input.includes("product-description")) {
        products = parseNewGoldboxHtml(input);
      }
      // Fall back to legacy parser
      if (products.length === 0) {
        products = parseGoldboxHtml(input);
      }
      break;
    // Add more cases for other page types
    default:
      // Try both parsers as fallback
      products = parseNewGoldboxHtml(input);
      if (products.length === 0) {
        products = parseGoldboxHtml(input);
      }
  }

  // Generate warning if there are hidden containers
  let warning: string | undefined;
  if (hiddenContainers > 0) {
    const loadedContainers = totalContainers - hiddenContainers;
    warning = `쿠팡은 가상 스크롤을 사용하여 화면에 보이는 상품만 로드합니다. ` +
      `Console 스크립트를 사용하여 JSON으로 추출해주세요. ` +
      `(현재 로드됨: ${loadedContainers}개 / 전체: ${totalContainers}개)`;
  }

  return { pageType, products, totalContainers, hiddenContainers, warning };
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
