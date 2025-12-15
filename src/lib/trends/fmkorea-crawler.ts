/**
 * FM Korea (에펜코리아) 실시간 베스트 크롤러
 * FM Korea의 인기 게시글을 수집합니다.
 */

import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";

const FMKOREA_BEST_URL = "https://www.fmkorea.com/best";

interface FMKoreaTrendResult {
  rank: number;
  keyword: string; // Full post title
  postId?: string;
  recommendCount?: number;
  commentCount?: number;
}

/**
 * Check if FM Korea crawling is enabled
 */
function isFMKoreaCrawlingEnabled(): boolean {
  return process.env.FMKOREA_CRAWLING_ENABLED === "true";
}

/**
 * Clean post title by removing common noise patterns
 */
function cleanPostTitle(title: string): string {
  return title
    .replace(/\[\d+\]\s*$/, "") // Remove comment count at end like [77]
    .replace(/\[.*?\]/g, "") // Remove brackets content
    .replace(/^\s*\d+\s*/, "") // Remove leading numbers
    .replace(/\.{2,}/g, "") // Remove multiple dots
    .trim();
}

/**
 * Fetch trending posts from FM Korea best
 */
export async function fetchFMKoreaTrends(): Promise<FMKoreaTrendResult[]> {
  if (!isFMKoreaCrawlingEnabled()) {
    throw new Error("FM Korea crawling is not enabled");
  }

  try {
    const response = await fetch(FMKOREA_BEST_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        Referer: "https://www.fmkorea.com/",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch FM Korea: ${response.status}`);
    }

    const html = await response.text();
    const trends: FMKoreaTrendResult[] = [];

    // Use cheerio for HTML parsing
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    // Parse post list - FM Korea uses li.li elements with h3 titles
    $("li.li").each((index, element) => {
      if (index >= 50) return false; // Limit to top 50

      const $item = $(element);

      // Get post title from h3 > a
      const $titleLink = $item.find("h3.title a").first();
      let title = $titleLink.text().trim();

      if (!title) {
        // Try alternative selector
        const $altTitle = $item.find(".title a").first();
        title = $altTitle.text().trim();
      }

      if (!title) return;

      // Clean the title
      title = cleanPostTitle(title);
      if (!title || title.length < 2) return;

      // Get post ID from link
      const href = $titleLink.attr("href") || "";
      const postIdMatch = href.match(/\/(\d+)(?:\?|$)/);
      const postId = postIdMatch ? postIdMatch[1] : undefined;

      // Get recommend count
      const recommendText = $item.find(".voted_count, .vote_count").text().trim();
      const recommendCount = parseInt(recommendText.replace(/,/g, "")) || undefined;

      // Get comment count from title (often appended as [123])
      const commentMatch = $titleLink.text().match(/\[(\d+)\]/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;

      trends.push({
        rank: trends.length + 1,
        keyword: title,
        postId,
        recommendCount,
        commentCount,
      });
    });

    // Fallback: Try alternative selectors
    if (trends.length === 0) {
      $(".bd_lst .title a, .fm_best_widget .title a").each((index, element) => {
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
    console.error("FM Korea trends fetch error:", error);
    throw error;
  }
}

/**
 * Collect FM Korea trends and save to database
 */
export async function collectFMKoreaTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
}> {
  if (!isFMKoreaCrawlingEnabled()) {
    return { collected: 0, imported: 0, errors: ["FM Korea crawling is not enabled"] };
  }

  const errors: string[] = [];
  let collected = 0;
  let imported = 0;

  try {
    const trends = await fetchFMKoreaTrends();

    if (trends.length === 0) {
      return {
        collected: 0,
        imported: 0,
        errors: ["No trends found from FM Korea"],
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
              source: "FMKOREA",
              isActive: true,
            },
          });
          imported++;
        }

        // Calculate search volume based on rank and engagement
        let searchVolume = Math.max(100 - (trend.rank - 1) * 2, 10);
        if (trend.recommendCount && trend.recommendCount > 100) {
          searchVolume = Math.min(searchVolume + 10, 100);
        }
        if (trend.commentCount && trend.commentCount > 50) {
          searchVolume = Math.min(searchVolume + 5, 100);
        }

        // Save metric
        await prisma.trendMetric.upsert({
          where: {
            keywordId_collectedAt_source: {
              keywordId: keyword.id,
              collectedAt: now,
              source: "FMKOREA",
            },
          },
          update: {
            searchVolume,
            rank: trend.rank,
          },
          create: {
            keywordId: keyword.id,
            collectedAt: now,
            source: "FMKOREA",
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
 * Batch collect all FM Korea trends with job tracking
 */
export async function collectAllFMKoreaTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
  jobId: string;
}> {
  // Create collection job
  const job = await prisma.trendCollectionJob.create({
    data: {
      source: "FMKOREA",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const result = await collectFMKoreaTrends();

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
