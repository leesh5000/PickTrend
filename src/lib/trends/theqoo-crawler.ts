/**
 * TheQoo (더쿠) 실시간 베스트 크롤러
 * TheQoo의 HOT 게시글을 수집합니다.
 */

import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";

const THEQOO_HOT_URL = "https://theqoo.net/hot";

interface TheQooTrendResult {
  rank: number;
  keyword: string; // Full post title
  postId?: string;
  category?: string;
  viewCount?: number;
  commentCount?: number;
}

/**
 * Check if TheQoo crawling is enabled
 */
function isTheQooCrawlingEnabled(): boolean {
  return process.env.THEQOO_CRAWLING_ENABLED === "true";
}

/**
 * Clean post title by removing common noise patterns
 */
function cleanPostTitle(title: string): string {
  return title
    .replace(/\[\d+\]\s*$/, "") // Remove comment count at end like [163]
    .replace(/\[.*?\]/g, "") // Remove brackets content
    .replace(/^\s*\d+\s*/, "") // Remove leading numbers
    .replace(/\.{2,}/g, "") // Remove multiple dots
    .trim();
}

/**
 * Fetch trending posts from TheQoo hot
 */
export async function fetchTheQooTrends(): Promise<TheQooTrendResult[]> {
  if (!isTheQooCrawlingEnabled()) {
    throw new Error("TheQoo crawling is not enabled");
  }

  try {
    const response = await fetch(THEQOO_HOT_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        Referer: "https://theqoo.net/",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch TheQoo: ${response.status}`);
    }

    const html = await response.text();
    const trends: TheQooTrendResult[] = [];

    // Use cheerio for HTML parsing
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    // Parse post list - TheQoo uses table structure with tbody > tr
    $("table.bd_lst tbody tr, .bd_lst_wrp li").each((index, element) => {
      if (index >= 50) return false; // Limit to top 50

      const $item = $(element);

      // Get post title
      let $titleLink = $item.find("td.title a, .title a").first();
      let title = $titleLink.text().trim();

      // Remove comment count suffix if present
      title = title.replace(/\s*\[\d+\]$/, "").trim();

      if (!title) return;

      // Clean the title
      title = cleanPostTitle(title);
      if (!title || title.length < 2) return;

      // Get post ID from link
      const href = $titleLink.attr("href") || "";
      const postIdMatch = href.match(/\/hot\/(\d+)/) || href.match(/document_srl=(\d+)/);
      const postId = postIdMatch ? postIdMatch[1] : undefined;

      // Get category
      const category = $item.find(".cate, .category").text().trim() || undefined;

      // Get view count
      const viewText = $item.find("td.m_no, .readed_count").eq(0).text().trim();
      const viewCount = parseInt(viewText.replace(/,/g, "")) || undefined;

      // Get comment count
      const $commentSpan = $titleLink.find(".reply_count, .cmt");
      let commentCount: number | undefined;
      if ($commentSpan.length) {
        const commentText = $commentSpan.text().replace(/[[\]]/g, "");
        commentCount = parseInt(commentText) || undefined;
      }

      trends.push({
        rank: trends.length + 1,
        keyword: title,
        postId,
        category,
        viewCount,
        commentCount,
      });
    });

    // Fallback: Try alternative selector
    if (trends.length === 0) {
      $(".bd_lst .title a, .hot_list a").each((index, element) => {
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
    console.error("TheQoo trends fetch error:", error);
    throw error;
  }
}

/**
 * Collect TheQoo trends and save to database
 */
export async function collectTheQooTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
}> {
  if (!isTheQooCrawlingEnabled()) {
    return { collected: 0, imported: 0, errors: ["TheQoo crawling is not enabled"] };
  }

  const errors: string[] = [];
  let collected = 0;
  let imported = 0;

  try {
    const trends = await fetchTheQooTrends();

    if (trends.length === 0) {
      return {
        collected: 0,
        imported: 0,
        errors: ["No trends found from TheQoo"],
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
              source: "THEQOO",
              isActive: true,
            },
          });
          imported++;
        }

        // Calculate search volume based on rank and engagement
        let searchVolume = Math.max(100 - (trend.rank - 1) * 2, 10);
        if (trend.viewCount && trend.viewCount > 5000) {
          searchVolume = Math.min(searchVolume + 10, 100);
        }
        if (trend.commentCount && trend.commentCount > 100) {
          searchVolume = Math.min(searchVolume + 5, 100);
        }

        // Save metric
        await prisma.trendMetric.upsert({
          where: {
            keywordId_collectedAt_source: {
              keywordId: keyword.id,
              collectedAt: now,
              source: "THEQOO",
            },
          },
          update: {
            searchVolume,
            rank: trend.rank,
          },
          create: {
            keywordId: keyword.id,
            collectedAt: now,
            source: "THEQOO",
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
 * Batch collect all TheQoo trends with job tracking
 */
export async function collectAllTheQooTrends(): Promise<{
  collected: number;
  imported: number;
  errors: string[];
  jobId: string;
}> {
  // Create collection job
  const job = await prisma.trendCollectionJob.create({
    data: {
      source: "THEQOO",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const result = await collectTheQooTrends();

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
