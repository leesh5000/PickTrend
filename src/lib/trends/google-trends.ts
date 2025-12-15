/**
 * Google Trends Client
 * Uses google-trends-api npm package (unofficial)
 * Documentation: https://github.com/pat310/google-trends-api
 */

import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";

// Note: google-trends-api package needs to be installed
// npm install google-trends-api

/**
 * Check if Google Trends is enabled
 */
function isGoogleTrendsEnabled(): boolean {
  return process.env.GOOGLE_TRENDS_ENABLED === "true";
}

interface GoogleTrendsResult {
  keyword: string;
  value: number; // 0-100 relative interest
  date: string;
}

/**
 * Fetch interest over time for keywords from Google Trends
 * This is a wrapper function - actual implementation depends on the package
 */
export async function fetchGoogleTrends(
  keywords: string[],
  options: {
    geo?: string;
    startTime?: Date;
    endTime?: Date;
  } = {}
): Promise<GoogleTrendsResult[]> {
  if (!isGoogleTrendsEnabled()) {
    throw new Error("Google Trends is not enabled");
  }

  const { geo = "KR", startTime, endTime } = options;

  try {
    // Dynamic import to avoid errors if package not installed
    const googleTrends = await import("google-trends-api");

    const results: GoogleTrendsResult[] = [];

    // Google Trends API allows max 5 keywords per request
    const batches: string[][] = [];
    for (let i = 0; i < keywords.length; i += 5) {
      batches.push(keywords.slice(i, i + 5));
    }

    for (const batch of batches) {
      try {
        const response = await googleTrends.interestOverTime({
          keyword: batch,
          geo,
          startTime: startTime || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endTime: endTime || new Date(),
        });

        const data = JSON.parse(response);

        if (data.default?.timelineData) {
          const latestData = data.default.timelineData[data.default.timelineData.length - 1];

          if (latestData) {
            batch.forEach((keyword, index) => {
              results.push({
                keyword,
                value: latestData.value[index] || 0,
                date: latestData.formattedTime,
              });
            });
          }
        }

        // Rate limiting: sleep 60 seconds between batches (Google is strict)
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 60000));
        }
      } catch (error) {
        console.error(`Google Trends batch error:`, error);
        // Continue with next batch on error
      }
    }

    return results;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot find module")) {
      throw new Error("google-trends-api package not installed. Run: npm install google-trends-api");
    }
    throw error;
  }
}

/**
 * Get daily trending searches (hot searches) from Google
 */
export async function getGoogleDailyTrends(geo: string = "KR"): Promise<string[]> {
  if (!isGoogleTrendsEnabled()) {
    return [];
  }

  try {
    const googleTrends = await import("google-trends-api");

    const response = await googleTrends.dailyTrends({
      geo,
    });

    const data = JSON.parse(response);
    const trends: string[] = [];

    if (data.default?.trendingSearchesDays) {
      for (const day of data.default.trendingSearchesDays) {
        for (const search of day.trendingSearches || []) {
          if (search.title?.query) {
            trends.push(search.title.query);
          }
        }
      }
    }

    return trends.slice(0, 20); // Return top 20
  } catch (error) {
    console.error("Google daily trends error:", error);
    return [];
  }
}

/**
 * Get real-time trending searches
 * Note: This may not work for Korea (KR)
 */
export async function getGoogleRealtimeTrends(
  geo: string = "KR",
  category: string = "all"
): Promise<string[]> {
  if (!isGoogleTrendsEnabled()) {
    return [];
  }

  try {
    const googleTrends = await import("google-trends-api");

    const response = await googleTrends.realTimeTrends({
      geo,
      category,
    });

    const data = JSON.parse(response);
    const trends: string[] = [];

    if (data.storySummaries?.trendingStories) {
      for (const story of data.storySummaries.trendingStories) {
        if (story.entityNames) {
          trends.push(...story.entityNames);
        }
      }
    }

    return Array.from(new Set(trends)).slice(0, 20);
  } catch (error) {
    console.error("Google realtime trends error:", error);
    return [];
  }
}

/**
 * Collect trend data for existing keywords from Google Trends
 */
export async function collectGoogleTrendsForKeywords(
  keywordIds: string[]
): Promise<{
  collected: number;
  errors: string[];
}> {
  if (!isGoogleTrendsEnabled()) {
    return { collected: 0, errors: ["Google Trends is not enabled"] };
  }

  const errors: string[] = [];
  let collected = 0;

  try {
    // Get keywords from database
    const keywords = await prisma.trendKeyword.findMany({
      where: {
        id: { in: keywordIds },
        isActive: true,
      },
    });

    if (keywords.length === 0) {
      return { collected: 0, errors: ["No active keywords found"] };
    }

    // Fetch trends
    const results = await fetchGoogleTrends(
      keywords.map((k) => k.keyword),
      { geo: "KR" }
    );

    // Save metrics
    const now = new Date();
    for (const result of results) {
      const keyword = keywords.find((k) => k.keyword === result.keyword);
      if (!keyword) continue;

      try {
        await prisma.trendMetric.upsert({
          where: {
            keywordId_collectedAt_source: {
              keywordId: keyword.id,
              collectedAt: now,
              source: "GOOGLE_TRENDS",
            },
          },
          update: {
            searchVolume: result.value,
          },
          create: {
            keywordId: keyword.id,
            collectedAt: now,
            source: "GOOGLE_TRENDS",
            searchVolume: result.value,
          },
        });

        collected++;
      } catch (error) {
        errors.push(`Failed to save metric for ${keyword.keyword}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(message);
  }

  return { collected, errors };
}

/**
 * Import trending keywords from Google and add to database
 */
export async function importGoogleTrendingKeywords(): Promise<{
  imported: number;
  errors: string[];
}> {
  if (!isGoogleTrendsEnabled()) {
    return { imported: 0, errors: ["Google Trends is not enabled"] };
  }

  const errors: string[] = [];
  let imported = 0;

  try {
    // Get daily trends
    const trends = await getGoogleDailyTrends("KR");

    for (const keyword of trends) {
      const normalizedKeyword = normalizeKorean(keyword);

      // Check if already exists
      const existing = await prisma.trendKeyword.findUnique({
        where: { normalizedKeyword },
      });

      if (existing) continue;

      // Create new keyword
      try {
        await prisma.trendKeyword.create({
          data: {
            keyword,
            normalizedKeyword,
            source: "GOOGLE_TRENDS",
            isActive: true,
          },
        });
        imported++;
      } catch (error) {
        errors.push(`Failed to import: ${keyword}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(message);
  }

  return { imported, errors };
}

/**
 * Batch collect trends for all Google Trends keywords
 */
export async function collectAllGoogleTrends(): Promise<{
  collected: number;
  errors: string[];
  jobId: string;
}> {
  if (!isGoogleTrendsEnabled()) {
    return { collected: 0, errors: ["Google Trends is not enabled"], jobId: "" };
  }

  // Create collection job
  const job = await prisma.trendCollectionJob.create({
    data: {
      source: "GOOGLE_TRENDS",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    // Get keywords with GOOGLE source
    const keywords = await prisma.trendKeyword.findMany({
      where: {
        isActive: true,
        source: "GOOGLE_TRENDS",
      },
      select: { id: true },
    });

    if (keywords.length === 0) {
      await prisma.trendCollectionJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          keywordsFound: 0,
          keywordsAdded: 0,
        },
      });

      return { collected: 0, errors: [], jobId: job.id };
    }

    const result = await collectGoogleTrendsForKeywords(
      keywords.map((k) => k.id)
    );

    await prisma.trendCollectionJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        keywordsFound: keywords.length,
        keywordsAdded: result.collected,
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

    return { collected: 0, errors: [message], jobId: job.id };
  }
}
