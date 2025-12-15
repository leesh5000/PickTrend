/**
 * Naver DataLab API Client
 * Documentation: https://developers.naver.com/docs/datalab/search/
 */

import prisma from "@/lib/prisma";
import { normalizeKorean } from "@/lib/utils/string";

const NAVER_API_URL = "https://openapi.naver.com/v1/datalab/search";

interface NaverKeywordGroup {
  groupName: string;
  keywords: string[];
}

interface NaverDataLabRequest {
  startDate: string; // "2024-01-01"
  endDate: string; // "2024-12-15"
  timeUnit: "date" | "week" | "month";
  keywordGroups: NaverKeywordGroup[];
  device?: "" | "pc" | "mo";
  ages?: string[];
  gender?: "" | "m" | "f";
}

interface NaverDataLabResult {
  title: string;
  keywords: string[];
  data: Array<{
    period: string;
    ratio: number;
  }>;
}

interface NaverDataLabResponse {
  startDate: string;
  endDate: string;
  timeUnit: string;
  results: NaverDataLabResult[];
}

/**
 * Get Naver API credentials from environment
 */
function getNaverCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Naver DataLab API credentials not configured");
  }

  return { clientId, clientSecret };
}

/**
 * Format date as YYYY-MM-DD for Naver API
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Call Naver DataLab API
 */
export async function fetchNaverTrends(
  keywordGroups: NaverKeywordGroup[],
  options: {
    startDate?: Date;
    endDate?: Date;
    timeUnit?: "date" | "week" | "month";
    device?: "" | "pc" | "mo";
  } = {}
): Promise<NaverDataLabResponse> {
  const { clientId, clientSecret } = getNaverCredentials();

  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate = new Date(),
    timeUnit = "date",
    device = "",
  } = options;

  // Naver API allows max 5 keyword groups
  if (keywordGroups.length > 5) {
    throw new Error("Naver DataLab API allows maximum 5 keyword groups");
  }

  const requestBody: NaverDataLabRequest = {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    timeUnit,
    keywordGroups,
    device,
  };

  const response = await fetch(NAVER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Naver DataLab API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Collect trend data for existing keywords from Naver DataLab
 */
export async function collectNaverTrendsForKeywords(
  keywordIds: string[]
): Promise<{
  collected: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let collected = 0;

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

  // Process in batches of 5 (Naver API limit)
  const batches: typeof keywords[] = [];
  for (let i = 0; i < keywords.length; i += 5) {
    batches.push(keywords.slice(i, i + 5));
  }

  for (const batch of batches) {
    try {
      // Prepare keyword groups for Naver API
      const keywordGroups: NaverKeywordGroup[] = batch.map((kw) => ({
        groupName: kw.keyword,
        keywords: [kw.keyword],
      }));

      const response = await fetchNaverTrends(keywordGroups, {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        endDate: new Date(),
        timeUnit: "date",
      });

      // Process results and save metrics
      const now = new Date();
      for (const result of response.results) {
        const keyword = batch.find((kw) => kw.keyword === result.title);
        if (!keyword) continue;

        // Get latest ratio (most recent day)
        const latestData = result.data[result.data.length - 1];
        if (!latestData) continue;

        // Save metric
        await prisma.trendMetric.upsert({
          where: {
            keywordId_collectedAt_source: {
              keywordId: keyword.id,
              collectedAt: now,
              source: "NAVER_DATALAB",
            },
          },
          update: {
            searchVolume: Math.round(latestData.ratio),
          },
          create: {
            keywordId: keyword.id,
            collectedAt: now,
            source: "NAVER_DATALAB",
            searchVolume: Math.round(latestData.ratio),
          },
        });

        collected++;
      }

      // Rate limiting: sleep 1 second between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Batch error: ${message}`);
    }
  }

  return { collected, errors };
}

/**
 * Search for trending keywords from Naver (requires different API)
 * Note: This is a placeholder - Naver doesn't have a public "trending keywords" API
 * You would need to use Shopping Insight API or manually input keywords
 */
export async function getNaverTrendingKeywords(): Promise<string[]> {
  // Naver doesn't provide a public API for trending/hot keywords
  // The DataLab API only provides search volume for keywords you specify
  //
  // Options:
  // 1. Use Naver Shopping Insight API (requires separate registration)
  // 2. Use predefined keyword lists
  // 3. Use web scraping (not recommended - ToS violation)

  console.warn(
    "Naver DataLab API does not provide trending keywords. " +
    "Keywords must be manually added or imported from other sources."
  );

  return [];
}

/**
 * Batch collect trends for all active keywords
 */
export async function collectAllNaverTrends(): Promise<{
  collected: number;
  errors: string[];
  jobId: string;
}> {
  // Create collection job
  const job = await prisma.trendCollectionJob.create({
    data: {
      source: "NAVER_DATALAB",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    // Get all active keywords with NAVER source or MANUAL
    const keywords = await prisma.trendKeyword.findMany({
      where: {
        isActive: true,
        source: { in: ["NAVER_DATALAB", "MANUAL"] },
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
          errorLog: "No active keywords to collect",
        },
      });

      return { collected: 0, errors: ["No active keywords"], jobId: job.id };
    }

    const result = await collectNaverTrendsForKeywords(
      keywords.map((k) => k.id)
    );

    // Update job status
    await prisma.trendCollectionJob.update({
      where: { id: job.id },
      data: {
        status: result.errors.length > 0 ? "COMPLETED" : "COMPLETED",
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
