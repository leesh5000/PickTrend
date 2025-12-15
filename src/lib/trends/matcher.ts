/**
 * Trend keyword to product matching algorithm
 */

import prisma from "@/lib/prisma";
import { jaroWinklerSimilarity, normalizeKorean } from "@/lib/utils/string";

export interface MatchResult {
  productId: string;
  matchScore: number;
  matchType: "exact" | "similarity" | "partial" | "brand" | "category";
  confidence: "high" | "medium" | "low";
}

// Brand dictionary for matching
const BRAND_KEYWORDS: Record<string, string[]> = {
  electronics: [
    "삼성", "samsung", "애플", "apple", "아이폰", "iphone", "갤럭시", "galaxy",
    "LG", "lg", "소니", "sony", "샤오미", "xiaomi", "화웨이", "huawei",
    "레노버", "lenovo", "에이수스", "asus", "델", "dell", "HP", "hp",
    "MSI", "msi", "구글", "google", "픽셀", "pixel", "원플러스", "oneplus",
    "다이슨", "dyson", "보스", "bose", "젠하이저", "sennheiser",
  ],
  beauty: [
    "설화수", "라네즈", "이니스프리", "에뛰드", "미샤", "더페이스샵",
    "에스티로더", "랑콤", "샤넬", "디올", "맥", "나스", "로레알",
    "아모레퍼시픽", "올리브영", "클리오", "페리페라", "롬앤",
  ],
  appliances: [
    "다이슨", "dyson", "삼성", "samsung", "LG", "lg", "필립스", "philips",
    "보쉬", "bosch", "일렉트로룩스", "electrolux", "밀레", "miele",
    "쿠첸", "쿠쿠", "cuckoo", "위니아", "대우", "신일",
  ],
  food: [
    "농심", "오뚜기", "삼양", "CJ", "풀무원", "동원", "해태",
    "롯데", "오리온", "빙그레", "남양", "매일", "서울우유",
  ],
};

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_]+/)
    .filter((token) => token.length > 1);
}

/**
 * Calculate token overlap ratio
 */
function calculateTokenOverlap(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let matches = 0;
  tokens1.forEach((token) => {
    if (set1.has(token) && set2.has(token)) {
      matches++;
    }
  });

  // Calculate Jaccard similarity
  const union = new Set(tokens1.concat(tokens2)).size;
  return union > 0 ? matches / union : 0;
}

/**
 * Check if text contains a brand from category
 */
function findBrandMatch(text: string, category?: string | null): string | null {
  const textLower = text.toLowerCase();

  // Check specific category first
  if (category && BRAND_KEYWORDS[category]) {
    for (const brand of BRAND_KEYWORDS[category]) {
      if (textLower.includes(brand.toLowerCase())) {
        return brand;
      }
    }
  }

  // Check all categories
  for (const brands of Object.values(BRAND_KEYWORDS)) {
    for (const brand of brands) {
      if (textLower.includes(brand.toLowerCase())) {
        return brand;
      }
    }
  }

  return null;
}

/**
 * Calculate match score between keyword and product
 */
export function calculateMatchScore(
  keyword: string,
  product: {
    name: string;
    normalizedName: string;
    category: string | null;
  }
): MatchResult | null {
  const normalizedKeyword = normalizeKorean(keyword);

  // 1. Exact match (score: 100)
  if (normalizedKeyword === product.normalizedName) {
    return {
      productId: "",
      matchScore: 100,
      matchType: "exact",
      confidence: "high",
    };
  }

  // 2. Jaro-Winkler similarity (score: 60-95)
  const similarity = jaroWinklerSimilarity(normalizedKeyword, product.normalizedName);
  if (similarity >= 0.85) {
    const score = 60 + (similarity - 0.85) * 233.33; // 60 at 0.85, 95 at 1.0
    return {
      productId: "",
      matchScore: Math.min(95, Math.round(score * 100) / 100),
      matchType: "similarity",
      confidence: similarity >= 0.92 ? "high" : "medium",
    };
  }

  // 3. Partial containment (score: 50-80)
  const keywordLower = keyword.toLowerCase();
  const productNameLower = product.name.toLowerCase();

  if (productNameLower.includes(keywordLower)) {
    // Product name contains keyword
    const ratio = keywordLower.length / productNameLower.length;
    const score = 50 + ratio * 30;
    return {
      productId: "",
      matchScore: Math.round(score * 100) / 100,
      matchType: "partial",
      confidence: ratio >= 0.5 ? "high" : "medium",
    };
  }

  if (keywordLower.includes(productNameLower)) {
    // Keyword contains product name
    const ratio = productNameLower.length / keywordLower.length;
    const score = 45 + ratio * 25;
    return {
      productId: "",
      matchScore: Math.round(score * 100) / 100,
      matchType: "partial",
      confidence: ratio >= 0.6 ? "medium" : "low",
    };
  }

  // 4. Brand match (score: 30-50)
  const keywordBrand = findBrandMatch(keyword, product.category);
  const productBrand = findBrandMatch(product.name, product.category);

  if (keywordBrand && productBrand && keywordBrand.toLowerCase() === productBrand.toLowerCase()) {
    // Same brand - check for additional token overlap
    const keywordTokens = tokenize(keyword);
    const productTokens = tokenize(product.name);
    const overlap = calculateTokenOverlap(keywordTokens, productTokens);

    const score = 30 + overlap * 20;
    return {
      productId: "",
      matchScore: Math.round(score * 100) / 100,
      matchType: "brand",
      confidence: overlap >= 0.3 ? "medium" : "low",
    };
  }

  // 5. Token overlap (score: 20-40)
  const keywordTokens = tokenize(keyword);
  const productTokens = tokenize(product.name);
  const overlap = calculateTokenOverlap(keywordTokens, productTokens);

  if (overlap >= 0.2) {
    const score = 20 + overlap * 20;
    return {
      productId: "",
      matchScore: Math.round(score * 100) / 100,
      matchType: "category",
      confidence: "low",
    };
  }

  return null;
}

/**
 * Find matching products for a trend keyword
 */
export async function findMatchingProducts(
  keyword: string,
  options: {
    category?: string | null;
    limit?: number;
    minScore?: number;
  } = {}
): Promise<MatchResult[]> {
  const { category, limit = 10, minScore = 30 } = options;

  // Get active products
  const where: any = { isActive: true };
  if (category) {
    where.category = category;
  }

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      normalizedName: true,
      category: true,
    },
  });

  // Calculate match scores
  const matches: MatchResult[] = [];

  for (const product of products) {
    const result = calculateMatchScore(keyword, product);
    if (result && result.matchScore >= minScore) {
      matches.push({
        ...result,
        productId: product.id,
      });
    }
  }

  // Sort by score descending and limit
  return matches
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

/**
 * Run product matching for a single keyword
 */
export async function matchKeywordToProducts(
  keywordId: string,
  options: {
    clearExisting?: boolean;
    preserveManual?: boolean;
  } = {}
): Promise<{
  matched: number;
  updated: number;
}> {
  const { clearExisting = false, preserveManual = true } = options;

  // Get keyword
  const keyword = await prisma.trendKeyword.findUnique({
    where: { id: keywordId },
  });

  if (!keyword) {
    throw new Error("Keyword not found");
  }

  // Find matching products
  const matches = await findMatchingProducts(keyword.keyword, {
    category: keyword.category,
    limit: 20,
    minScore: 30,
  });

  let matched = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    // Optionally clear existing non-manual matches
    if (clearExisting) {
      const deleteWhere: any = { keywordId };
      if (preserveManual) {
        deleteWhere.isManual = false;
      }
      await tx.trendProductMatch.deleteMany({
        where: deleteWhere,
      });
    }

    // Create or update matches
    for (const match of matches) {
      const existing = await tx.trendProductMatch.findUnique({
        where: {
          keywordId_productId: {
            keywordId,
            productId: match.productId,
          },
        },
      });

      if (existing) {
        // Skip manual matches if preserving
        if (preserveManual && existing.isManual) {
          continue;
        }

        // Update existing match
        await tx.trendProductMatch.update({
          where: { id: existing.id },
          data: {
            matchScore: match.matchScore,
            matchType: match.matchType,
          },
        });
        updated++;
      } else {
        // Create new match
        await tx.trendProductMatch.create({
          data: {
            keywordId,
            productId: match.productId,
            matchScore: match.matchScore,
            matchType: match.matchType,
            isManual: false,
          },
        });
        matched++;
      }
    }
  });

  return { matched, updated };
}

/**
 * Run product matching for all active keywords
 */
export async function matchAllKeywordsToProducts(options: {
  clearExisting?: boolean;
  preserveManual?: boolean;
} = {}): Promise<{
  keywordsProcessed: number;
  totalMatched: number;
  totalUpdated: number;
}> {
  // Get all active keywords
  const keywords = await prisma.trendKeyword.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let totalMatched = 0;
  let totalUpdated = 0;

  for (const keyword of keywords) {
    try {
      const { matched, updated } = await matchKeywordToProducts(keyword.id, options);
      totalMatched += matched;
      totalUpdated += updated;
    } catch (error) {
      console.error(`Error matching keyword ${keyword.id}:`, error);
    }
  }

  return {
    keywordsProcessed: keywords.length,
    totalMatched,
    totalUpdated,
  };
}
