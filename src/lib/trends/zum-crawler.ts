/**
 * Zum 실시간 검색어 크롤러
 * Zum 홈페이지의 AI 이슈트렌드 데이터를 수집합니다.
 */

import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";

const ZUM_URL = "https://zum.com";

interface ZumTrendResult {
  rank: number;
  keyword: string;
}

/**
 * Check if Zum crawling is enabled
 */
function isZumCrawlingEnabled(): boolean {
  return process.env.ZUM_CRAWLING_ENABLED === "true";
}

/**
 * Fetch trending keywords from Zum homepage
 * Extracts data from window.__INITIAL_STATE__ JavaScript object
 */
export async function fetchZumTrends(): Promise<ZumTrendResult[]> {
  if (!isZumCrawlingEnabled()) {
    throw new Error("Zum crawling is not enabled");
  }

  try {
    const response = await fetch(ZUM_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Zum: ${response.status}`);
    }

    const html = await response.text();
    const trends: ZumTrendResult[] = [];

    // Try to extract __INITIAL_STATE__ from the HTML
    const stateMatch = html.match(
      /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|window\.)/
    );

    if (stateMatch && stateMatch[1]) {
      try {
        // Clean up the JSON string (remove trailing semicolons, etc.)
        let jsonStr = stateMatch[1].trim();
        if (jsonStr.endsWith(";")) {
          jsonStr = jsonStr.slice(0, -1);
        }

        const state = JSON.parse(jsonStr);

        // Try to find issueRankingList or similar data structure
        const issueList =
          state.issueRankingList ||
          state.issueTrend?.list ||
          state.trendingKeywords ||
          state.hotKeywords;

        if (Array.isArray(issueList)) {
          issueList.forEach((item: any, index: number) => {
            const keyword =
              item.keyword ||
              item.title ||
              item.query ||
              item.name ||
              (typeof item === "string" ? item : null);

            if (keyword && typeof keyword === "string" && keyword.length > 0) {
              trends.push({
                rank: item.rank || index + 1,
                keyword: keyword.trim(),
              });
            }
          });
        }

        // Also try nested structures
        if (trends.length === 0 && state.home?.issueRanking) {
          const homeIssues = state.home.issueRanking;
          if (Array.isArray(homeIssues)) {
            homeIssues.forEach((item: any, index: number) => {
              const keyword = item.keyword || item.title || item.query;
              if (keyword) {
                trends.push({
                  rank: index + 1,
                  keyword: keyword.trim(),
                });
              }
            });
          }
        }
      } catch (parseError) {
        console.error("Failed to parse Zum __INITIAL_STATE__:", parseError);
      }
    }

    // Fallback: Try to extract from HTML using regex patterns
    if (trends.length === 0) {
      // Look for trend-related data in script tags
      const scriptMatches = html.match(
        /"(?:keyword|title|query)":\s*"([^"]+)"/g
      );
      if (scriptMatches) {
        const seen = new Set<string>();
        scriptMatches.forEach((match, index) => {
          const valueMatch = match.match(/"(?:keyword|title|query)":\s*"([^"]+)"/);
          if (valueMatch && valueMatch[1]) {
            const keyword = valueMatch[1].trim();
            // Filter out non-Korean or too long strings
            if (
              keyword.length > 1 &&
              keyword.length < 30 &&
              /[가-힣]/.test(keyword) &&
              !seen.has(keyword)
            ) {
              seen.add(keyword);
              trends.push({
                rank: trends.length + 1,
                keyword,
              });
            }
          }
        });
      }
    }

    // Fallback: Try HTML parsing with cheerio
    if (trends.length === 0) {
      try {
        const cheerio = await import("cheerio");
        const $ = cheerio.load(html);

        // Try common selectors for trending keywords
        $(
          '.issue_keyword a, .trend_keyword a, .hot_keyword a, [class*="trend"] a, [class*="issue"] a'
        ).each((index, element) => {
          const keyword = $(element).text().trim();
          if (
            keyword &&
            keyword.length > 1 &&
            keyword.length < 30 &&
            /[가-힣]/.test(keyword)
          ) {
            trends.push({
              rank: index + 1,
              keyword,
            });
          }
        });
      } catch (cheerioError) {
        console.error("Cheerio parsing failed:", cheerioError);
      }
    }

    return trends.slice(0, 20); // Return top 20
  } catch (error) {
    console.error("Zum trends fetch error:", error);
    throw error;
  }
}

/**
 * Collect Zum trends and save to database
 */
export async function collectZumTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
}> {
  if (!isZumCrawlingEnabled()) {
    return { collected: 0, imported: 0, errors: ["Zum crawling is not enabled"] };
  }

  const errors: string[] = [];
  let collected = 0;
  let imported = 0;

  try {
    const trends = await fetchZumTrends();

    if (trends.length === 0) {
      return {
        collected: 0,
        imported: 0,
        errors: ["No trends found from Zum"],
      };
    }

    const now = new Date();

    for (const trend of trends) {
      try {
        const normalizedKeyword = normalizeKorean(trend.keyword);

        // Find or create keyword
        let keyword = await prisma.trendKeyword.findUnique({
          where: { normalizedKeyword },
        });

        if (!keyword) {
          keyword = await prisma.trendKeyword.create({
            data: {
              keyword: trend.keyword,
              normalizedKeyword,
              source: "ZUM",
              isActive: true,
            },
          });
          imported++;
        }

        // Save metric
        await prisma.trendMetric.upsert({
          where: {
            keywordId_collectedAt_source: {
              keywordId: keyword.id,
              collectedAt: now,
              source: "ZUM",
            },
          },
          update: {
            searchVolume: 100 - (trend.rank - 1) * 5, // Convert rank to score
            rank: trend.rank,
          },
          create: {
            keywordId: keyword.id,
            collectedAt: now,
            source: "ZUM",
            searchVolume: 100 - (trend.rank - 1) * 5,
            rank: trend.rank,
          },
        });

        collected++;
      } catch (itemError) {
        const message =
          itemError instanceof Error ? itemError.message : "Unknown error";
        errors.push(`Failed to save "${trend.keyword}": ${message}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(message);
  }

  return { collected, imported, errors };
}

/**
 * Batch collect all Zum trends with job tracking
 */
export async function collectAllZumTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
  jobId: string;
}> {
  // Create collection job
  const job = await prisma.trendCollectionJob.create({
    data: {
      source: "ZUM",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const result = await collectZumTrends();

    // Update job status
    await prisma.trendCollectionJob.update({
      where: { id: job.id },
      data: {
        status:
          result.errors.length > 0 && result.collected === 0
            ? "FAILED"
            : "COMPLETED",
        completedAt: new Date(),
        keywordsFound: result.collected + result.imported,
        keywordsAdded: result.imported,
        errorLog:
          result.errors.length > 0 ? result.errors.join("; ") : null,
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
