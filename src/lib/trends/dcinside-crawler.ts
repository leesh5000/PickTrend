/**
 * DC Inside 실시간 베스트 크롤러
 * DC Inside 갤러리의 실시간 베스트 게시글을 수집합니다.
 */

import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";

const DCINSIDE_BEST_URL = "https://gall.dcinside.com/board/lists/?id=dcbest";

interface DCInsideTrendResult {
  rank: number;
  keyword: string; // Full post title
  postId?: string;
  viewCount?: number;
  recommendCount?: number;
}

/**
 * Check if DC Inside crawling is enabled
 */
function isDCInsideCrawlingEnabled(): boolean {
  return process.env.DCINSIDE_CRAWLING_ENABLED === "true";
}

/**
 * Clean post title by removing common noise patterns
 */
function cleanPostTitle(title: string): string {
  return title
    .replace(/\[.*?\]/g, "") // Remove brackets content like [디갤], [유머]
    .replace(/^\s*\d+\s*/, "") // Remove leading numbers
    .replace(/\.{2,}/g, "") // Remove multiple dots
    .trim();
}

/**
 * Fetch trending posts from DC Inside realtime best
 */
export async function fetchDCInsideTrends(): Promise<DCInsideTrendResult[]> {
  if (!isDCInsideCrawlingEnabled()) {
    throw new Error("DC Inside crawling is not enabled");
  }

  try {
    const response = await fetch(DCINSIDE_BEST_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        Referer: "https://gall.dcinside.com/",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch DC Inside: ${response.status}`);
    }

    const html = await response.text();
    const trends: DCInsideTrendResult[] = [];

    // Use cheerio for HTML parsing
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    // Parse post list - DC Inside uses table structure
    $("tr.ub-content").each((index, element) => {
      if (index >= 50) return false; // Limit to top 50

      const $row = $(element);

      // Get post title
      const $titleLink = $row.find("td.gall_tit a:not(.reply_numbox)").first();
      let title = $titleLink.text().trim();

      if (!title) return;

      // Clean the title
      title = cleanPostTitle(title);
      if (!title || title.length < 2) return;

      // Get post ID from link
      const href = $titleLink.attr("href") || "";
      const postIdMatch = href.match(/no=(\d+)/);
      const postId = postIdMatch ? postIdMatch[1] : undefined;

      // Get view count
      const viewText = $row.find("td.gall_count").text().trim();
      const viewCount = parseInt(viewText.replace(/,/g, "")) || undefined;

      // Get recommend count
      const recommendText = $row.find("td.gall_recommend").text().trim();
      const recommendCount = parseInt(recommendText.replace(/,/g, "")) || undefined;

      trends.push({
        rank: trends.length + 1,
        keyword: title,
        postId,
        viewCount,
        recommendCount,
      });
    });

    // Fallback: Try alternative selector if no results
    if (trends.length === 0) {
      $(".gall_list .gall_tit a").each((index, element) => {
        if (index >= 50) return false;

        let title = $(element).text().trim();
        title = cleanPostTitle(title);

        if (title && title.length >= 2 && /[가-힣]/.test(title)) {
          trends.push({
            rank: trends.length + 1,
            keyword: title,
          });
        }
      });
    }

    return trends;
  } catch (error) {
    console.error("DC Inside trends fetch error:", error);
    throw error;
  }
}

/**
 * Collect DC Inside trends and save to database
 */
export async function collectDCInsideTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
}> {
  if (!isDCInsideCrawlingEnabled()) {
    return { collected: 0, imported: 0, errors: ["DC Inside crawling is not enabled"] };
  }

  const errors: string[] = [];
  let collected = 0;
  let imported = 0;

  try {
    const trends = await fetchDCInsideTrends();

    if (trends.length === 0) {
      return {
        collected: 0,
        imported: 0,
        errors: ["No trends found from DC Inside"],
      };
    }

    const now = new Date();

    for (const trend of trends) {
      try {
        const normalizedKeyword = normalizeKorean(trend.keyword);

        // Skip if normalized keyword is too short
        if (normalizedKeyword.length < 2) continue;

        // Find or create keyword
        let keyword = await prisma.trendKeyword.findUnique({
          where: { normalizedKeyword },
        });

        if (!keyword) {
          keyword = await prisma.trendKeyword.create({
            data: {
              keyword: trend.keyword,
              normalizedKeyword,
              source: "DCINSIDE",
              isActive: true,
            },
          });
          imported++;
        }

        // Calculate search volume based on rank and engagement
        // Rank 1 = 100, decreasing by position
        // Add bonus for high view/recommend counts
        let searchVolume = Math.max(100 - (trend.rank - 1) * 2, 10);
        if (trend.viewCount && trend.viewCount > 10000) {
          searchVolume = Math.min(searchVolume + 10, 100);
        }
        if (trend.recommendCount && trend.recommendCount > 100) {
          searchVolume = Math.min(searchVolume + 5, 100);
        }

        // Save metric
        await prisma.trendMetric.upsert({
          where: {
            keywordId_collectedAt_source: {
              keywordId: keyword.id,
              collectedAt: now,
              source: "DCINSIDE",
            },
          },
          update: {
            searchVolume,
            rank: trend.rank,
          },
          create: {
            keywordId: keyword.id,
            collectedAt: now,
            source: "DCINSIDE",
            searchVolume,
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
 * Batch collect all DC Inside trends with job tracking
 */
export async function collectAllDCInsideTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
  jobId: string;
}> {
  // Create collection job
  const job = await prisma.trendCollectionJob.create({
    data: {
      source: "DCINSIDE",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const result = await collectDCInsideTrends();

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
