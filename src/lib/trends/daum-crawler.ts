/**
 * Daum Real-time Search Keywords Crawler
 *
 * Note: Daum officially discontinued real-time search in 2020,
 * but some trending data may still be available through web scraping.
 *
 * WARNING: Web scraping may violate terms of service.
 * Use at your own risk and respect robots.txt.
 */

import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";

// Daum search trend page URL (may change)
const DAUM_TREND_URL = "https://www.daum.net/";

interface DaumTrendResult {
  rank: number;
  keyword: string;
}

/**
 * Check if Daum crawling is enabled
 */
function isDaumCrawlingEnabled(): boolean {
  return process.env.DAUM_CRAWLING_ENABLED === "true";
}

/**
 * Fetch trending keywords from Daum
 * This requires cheerio for HTML parsing
 */
export async function fetchDaumTrends(): Promise<DaumTrendResult[]> {
  if (!isDaumCrawlingEnabled()) {
    throw new Error("Daum crawling is not enabled");
  }

  try {
    // Dynamic import cheerio
    const cheerio = await import("cheerio");

    const response = await fetch(DAUM_TREND_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      throw new Error(`Daum fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const trends: DaumTrendResult[] = [];

    // Daum's trending search selector (may change)
    // This is a placeholder - actual selectors need to be determined
    // by inspecting the current Daum website structure
    $(".realtime_part .rank_result li, .issue_keyword li, .hot_keyword li").each(
      (index, element) => {
        const keyword = $(element).find("a, span.txt").first().text().trim();
        if (keyword && keyword.length > 0) {
          trends.push({
            rank: index + 1,
            keyword,
          });
        }
      }
    );

    // Alternative: Try to find any trending/popular keyword sections
    if (trends.length === 0) {
      // Look for common keyword list patterns
      $('a[href*="search"], span.keyword, .trend_keyword').each(
        (index, element) => {
          const text = $(element).text().trim();
          // Filter out navigation and non-keyword text
          if (
            text &&
            text.length > 1 &&
            text.length < 50 &&
            !text.includes("검색") &&
            !text.includes("더보기")
          ) {
            const exists = trends.some((t) => t.keyword === text);
            if (!exists) {
              trends.push({
                rank: trends.length + 1,
                keyword: text,
              });
            }
          }
        }
      );
    }

    return trends.slice(0, 20); // Return top 20
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Cannot find module")
    ) {
      throw new Error("cheerio package not installed. Run: npm install cheerio");
    }
    throw error;
  }
}

/**
 * Collect trending keywords from Daum and add to database
 */
export async function collectDaumTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
}> {
  if (!isDaumCrawlingEnabled()) {
    return { collected: 0, imported: 0, errors: ["Daum crawling is not enabled"] };
  }

  const errors: string[] = [];
  let collected = 0;
  let imported = 0;

  try {
    const trends = await fetchDaumTrends();

    if (trends.length === 0) {
      return { collected: 0, imported: 0, errors: ["No trends found from Daum"] };
    }

    const now = new Date();

    for (const trend of trends) {
      const normalizedKeyword = normalizeKorean(trend.keyword);

      // Find or create keyword
      let keyword = await prisma.trendKeyword.findUnique({
        where: { normalizedKeyword },
      });

      if (!keyword) {
        // Create new keyword
        try {
          keyword = await prisma.trendKeyword.create({
            data: {
              keyword: trend.keyword,
              normalizedKeyword,
              source: "DAUM",
              isActive: true,
            },
          });
          imported++;
        } catch (error) {
          // Skip duplicate error
          keyword = await prisma.trendKeyword.findUnique({
            where: { normalizedKeyword },
          });
          if (!keyword) {
            errors.push(`Failed to import: ${trend.keyword}`);
            continue;
          }
        }
      }

      // Save metric with rank
      try {
        await prisma.trendMetric.upsert({
          where: {
            keywordId_collectedAt_source: {
              keywordId: keyword.id,
              collectedAt: now,
              source: "DAUM",
            },
          },
          update: {
            searchVolume: 100 - (trend.rank - 1) * 5, // Convert rank to score (1st = 100, 20th = 5)
            rank: trend.rank,
          },
          create: {
            keywordId: keyword.id,
            collectedAt: now,
            source: "DAUM",
            searchVolume: 100 - (trend.rank - 1) * 5,
            rank: trend.rank,
          },
        });
        collected++;
      } catch (error) {
        errors.push(`Failed to save metric for: ${trend.keyword}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(message);
  }

  return { collected, imported, errors };
}

/**
 * Full Daum collection with job tracking
 */
export async function collectAllDaumTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
  jobId: string;
}> {
  if (!isDaumCrawlingEnabled()) {
    return {
      collected: 0,
      imported: 0,
      errors: ["Daum crawling is not enabled"],
      jobId: "",
    };
  }

  // Create collection job
  const job = await prisma.trendCollectionJob.create({
    data: {
      source: "DAUM",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const result = await collectDaumTrends();

    await prisma.trendCollectionJob.update({
      where: { id: job.id },
      data: {
        status: result.errors.length > 0 && result.collected === 0 ? "FAILED" : "COMPLETED",
        completedAt: new Date(),
        keywordsFound: result.collected + result.imported,
        keywordsAdded: result.imported,
        errorLog: result.errors.length > 0 ? result.errors.join("; ") : null,
      },
    });

    return { ...result, jobId: job.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await prisma.trendCollectionJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorLog: message,
      },
    });

    return { collected: 0, imported: 0, errors: [message], jobId: job.id };
  }
}
