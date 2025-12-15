/**
 * Trend Keyword Clustering Module
 * Groups similar keywords from different sources using similarity-based clustering
 */

import prisma from "@/lib/prisma";
import { jaroWinklerSimilarity, normalizeKorean } from "@/lib/utils/string";
import { TrendSource } from "@prisma/client";

interface ClusterConfig {
  similarityThreshold: number; // Default: 0.7
  minClusterSize: number; // Default: 2
  maxClusterSize: number; // Default: 50
}

interface ClusterMember {
  keywordId: string;
  keyword: string;
  source: TrendSource;
  similarityScore: number;
}

interface ClusterResult {
  clusterId: string;
  representativeKeyword: string;
  members: ClusterMember[];
  combinedScore: number;
  sourceCount: number;
}

const DEFAULT_CONFIG: ClusterConfig = {
  similarityThreshold: parseFloat(process.env.CLUSTER_SIMILARITY_THRESHOLD || "0.7"),
  minClusterSize: 2,
  maxClusterSize: 50,
};

// Source weights for combined score calculation
const SOURCE_WEIGHTS: Record<TrendSource, number> = {
  GOOGLE_TRENDS: 1.2,
  NAVER_DATALAB: 1.1,
  ZUM: 1.0,
  DCINSIDE: 0.9,
  FMKOREA: 0.9,
  THEQOO: 0.9,
  DAUM: 0.8,
  MANUAL: 0.5,
};

/**
 * Calculate n-gram similarity between two texts
 * Better for longer texts like post titles
 */
export function calculateNgramSimilarity(text1: string, text2: string, n: number = 2): number {
  const getNgrams = (text: string, n: number): Set<string> => {
    const ngrams = new Set<string>();
    const normalized = normalizeKorean(text);
    for (let i = 0; i <= normalized.length - n; i++) {
      ngrams.add(normalized.substring(i, i + n));
    }
    return ngrams;
  };

  const ngrams1 = getNgrams(text1, n);
  const ngrams2 = getNgrams(text2, n);

  if (ngrams1.size === 0 || ngrams2.size === 0) return 0;

  let intersection = 0;
  ngrams1.forEach((ngram) => {
    if (ngrams2.has(ngram)) intersection++;
  });

  const union = ngrams1.size + ngrams2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate combined similarity using both Jaro-Winkler and N-gram
 */
export function calculateSimilarity(keyword1: string, keyword2: string): number {
  const normalized1 = normalizeKorean(keyword1);
  const normalized2 = normalizeKorean(keyword2);

  // Exact match check
  if (normalized1 === normalized2) return 1;

  // Calculate Jaro-Winkler similarity
  const jaroWinkler = jaroWinklerSimilarity(normalized1, normalized2);

  // Calculate n-gram similarity (better for longer texts)
  const ngramSim = calculateNgramSimilarity(keyword1, keyword2, 2);

  // Weighted combination: prioritize Jaro-Winkler for short texts, n-gram for longer
  const avgLength = (normalized1.length + normalized2.length) / 2;
  const ngramWeight = Math.min(avgLength / 20, 0.5); // Max 50% weight for n-gram

  return jaroWinkler * (1 - ngramWeight) + ngramSim * ngramWeight;
}

/**
 * Find or create a cluster for a keyword
 */
export async function assignToExistingCluster(
  keywordId: string,
  config: ClusterConfig = DEFAULT_CONFIG
): Promise<string | null> {
  const keyword = await prisma.trendKeyword.findUnique({
    where: { id: keywordId },
    include: { clusterMembers: true },
  });

  if (!keyword) return null;

  // Already in a cluster
  if (keyword.clusterMembers.length > 0) {
    return keyword.clusterMembers[0].clusterId;
  }

  // Find existing clusters to compare
  const clusters = await prisma.trendKeywordCluster.findMany({
    where: { isActive: true },
    include: {
      members: {
        include: { keyword: true },
        take: 5, // Get top 5 members for comparison
        orderBy: { similarityScore: "desc" },
      },
    },
  });

  let bestCluster: { id: string; score: number } | null = null;

  for (const cluster of clusters) {
    // Calculate average similarity to cluster members
    let totalSimilarity = 0;
    let count = 0;

    for (const member of cluster.members) {
      const similarity = calculateSimilarity(keyword.keyword, member.keyword.keyword);
      totalSimilarity += similarity;
      count++;
    }

    const avgSimilarity = count > 0 ? totalSimilarity / count : 0;

    if (avgSimilarity >= config.similarityThreshold) {
      if (!bestCluster || avgSimilarity > bestCluster.score) {
        bestCluster = { id: cluster.id, score: avgSimilarity };
      }
    }
  }

  if (bestCluster) {
    // Add to existing cluster
    await prisma.trendKeywordClusterMember.create({
      data: {
        clusterId: bestCluster.id,
        keywordId: keyword.id,
        similarityScore: bestCluster.score,
      },
    });
    return bestCluster.id;
  }

  return null;
}

/**
 * Cluster all unclustered keywords
 */
export async function clusterKeywords(
  config: ClusterConfig = DEFAULT_CONFIG
): Promise<{
  clustersCreated: number;
  keywordsAssigned: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let clustersCreated = 0;
  let keywordsAssigned = 0;

  try {
    // Get all active keywords that are not yet in a cluster
    const unclusteredKeywords = await prisma.trendKeyword.findMany({
      where: {
        isActive: true,
        clusterMembers: { none: {} },
      },
      include: {
        metrics: {
          orderBy: { collectedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1000, // Process in batches
    });

    if (unclusteredKeywords.length === 0) {
      return { clustersCreated: 0, keywordsAssigned: 0, errors: [] };
    }

    // Group keywords by similarity
    const processed = new Set<string>();
    const newClusters: Array<{
      representative: typeof unclusteredKeywords[0];
      members: Array<{ keyword: typeof unclusteredKeywords[0]; similarity: number }>;
    }> = [];

    for (const keyword of unclusteredKeywords) {
      if (processed.has(keyword.id)) continue;

      // Try to assign to existing cluster first
      const existingClusterId = await assignToExistingCluster(keyword.id, config);
      if (existingClusterId) {
        processed.add(keyword.id);
        keywordsAssigned++;
        continue;
      }

      // Find similar keywords for a new cluster
      const similarKeywords: Array<{ keyword: typeof keyword; similarity: number }> = [];

      for (const other of unclusteredKeywords) {
        if (other.id === keyword.id || processed.has(other.id)) continue;

        const similarity = calculateSimilarity(keyword.keyword, other.keyword);
        if (similarity >= config.similarityThreshold) {
          similarKeywords.push({ keyword: other, similarity });
        }
      }

      if (similarKeywords.length > 0) {
        // Create new cluster
        newClusters.push({
          representative: keyword,
          members: similarKeywords,
        });

        processed.add(keyword.id);
        for (const similar of similarKeywords) {
          processed.add(similar.keyword.id);
        }
      }
    }

    // Save new clusters to database
    for (const clusterData of newClusters) {
      try {
        const normalizedName = normalizeKorean(clusterData.representative.keyword);

        // Check if cluster with same normalized name exists
        const existing = await prisma.trendKeywordCluster.findUnique({
          where: { normalizedName },
        });

        if (existing) {
          // Add members to existing cluster
          for (const member of clusterData.members) {
            await prisma.trendKeywordClusterMember.upsert({
              where: {
                clusterId_keywordId: {
                  clusterId: existing.id,
                  keywordId: member.keyword.id,
                },
              },
              update: { similarityScore: member.similarity },
              create: {
                clusterId: existing.id,
                keywordId: member.keyword.id,
                similarityScore: member.similarity,
              },
            });
            keywordsAssigned++;
          }
        } else {
          // Create new cluster
          const cluster = await prisma.trendKeywordCluster.create({
            data: {
              name: clusterData.representative.keyword,
              normalizedName,
              isActive: true,
            },
          });

          clustersCreated++;

          // Add representative as member
          await prisma.trendKeywordClusterMember.create({
            data: {
              clusterId: cluster.id,
              keywordId: clusterData.representative.id,
              similarityScore: 1.0,
            },
          });
          keywordsAssigned++;

          // Add similar keywords as members
          for (const member of clusterData.members.slice(0, config.maxClusterSize - 1)) {
            await prisma.trendKeywordClusterMember.create({
              data: {
                clusterId: cluster.id,
                keywordId: member.keyword.id,
                similarityScore: member.similarity,
              },
            });
            keywordsAssigned++;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Failed to create cluster for "${clusterData.representative.keyword}": ${message}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(message);
  }

  return { clustersCreated, keywordsAssigned, errors };
}

/**
 * Calculate combined score for a cluster
 */
export async function calculateClusterScore(clusterId: string): Promise<number> {
  const cluster = await prisma.trendKeywordCluster.findUnique({
    where: { id: clusterId },
    include: {
      members: {
        include: {
          keyword: {
            include: {
              metrics: {
                orderBy: { collectedAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!cluster || cluster.members.length === 0) return 0;

  let totalWeightedScore = 0;
  let totalWeight = 0;
  const sources = new Set<TrendSource>();

  for (const member of cluster.members) {
    const latestMetric = member.keyword.metrics[0];
    if (!latestMetric) continue;

    const sourceWeight = SOURCE_WEIGHTS[member.keyword.source] || 1.0;
    const memberScore = latestMetric.searchVolume * sourceWeight * member.similarityScore;

    totalWeightedScore += memberScore;
    totalWeight += sourceWeight * member.similarityScore;
    sources.add(member.keyword.source);
  }

  // Base score
  const baseScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

  // Cross-source bonus: +5 points per additional source
  const crossSourceBonus = Math.max(0, (sources.size - 1) * 5);

  return Math.min(baseScore + crossSourceBonus, 125); // Cap at 125
}

/**
 * Get cluster details with calculated score
 */
export async function getClusterDetails(clusterId: string): Promise<ClusterResult | null> {
  const cluster = await prisma.trendKeywordCluster.findUnique({
    where: { id: clusterId },
    include: {
      members: {
        include: {
          keyword: {
            include: {
              metrics: {
                orderBy: { collectedAt: "desc" },
                take: 1,
              },
            },
          },
        },
        orderBy: { similarityScore: "desc" },
      },
    },
  });

  if (!cluster) return null;

  const sources = new Set<TrendSource>();
  const members: ClusterMember[] = cluster.members.map((m) => {
    sources.add(m.keyword.source);
    return {
      keywordId: m.keyword.id,
      keyword: m.keyword.keyword,
      source: m.keyword.source,
      similarityScore: m.similarityScore,
    };
  });

  const combinedScore = await calculateClusterScore(clusterId);

  return {
    clusterId: cluster.id,
    representativeKeyword: cluster.name,
    members,
    combinedScore,
    sourceCount: sources.size,
  };
}

/**
 * Recalculate all clusters (clean up and rebuild)
 */
export async function recalculateAllClusters(
  config: ClusterConfig = DEFAULT_CONFIG
): Promise<{
  clustersCreated: number;
  keywordsAssigned: number;
  clustersRemoved: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    // Remove all existing cluster memberships
    const deleteResult = await prisma.trendKeywordClusterMember.deleteMany({});

    // Deactivate empty clusters
    const clustersRemoved = await prisma.trendKeywordCluster.updateMany({
      where: {
        members: { none: {} },
      },
      data: { isActive: false },
    });

    // Re-cluster all keywords
    const clusterResult = await clusterKeywords(config);

    return {
      clustersCreated: clusterResult.clustersCreated,
      keywordsAssigned: clusterResult.keywordsAssigned,
      clustersRemoved: clustersRemoved.count,
      errors: [...errors, ...clusterResult.errors],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(message);
    return {
      clustersCreated: 0,
      keywordsAssigned: 0,
      clustersRemoved: 0,
      errors,
    };
  }
}
