import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  clusterKeywords,
  recalculateAllClusters,
  getClusterDetails,
  calculateClusterScore,
} from "@/lib/trends/keyword-cluster";

interface ClusterRequest {
  action?: "cluster" | "recalculate";
  similarityThreshold?: number;
}

/**
 * POST /api/admin/trends/cluster
 * Trigger keyword clustering
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: ClusterRequest = await request.json();
    const { action = "cluster", similarityThreshold } = body;

    const config = similarityThreshold
      ? {
          similarityThreshold,
          minClusterSize: 2,
          maxClusterSize: 50,
        }
      : undefined;

    let result;

    if (action === "recalculate") {
      // Recalculate all clusters from scratch
      result = await recalculateAllClusters(config);

      // Log admin action
      await prisma.adminAction.create({
        data: {
          actionType: "RECALCULATE",
          targetType: "trend_clusters",
          targetId: "all",
          details: {
            clustersCreated: result.clustersCreated,
            keywordsAssigned: result.keywordsAssigned,
            clustersRemoved: result.clustersRemoved,
            similarityThreshold,
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Recalculated clusters: ${result.clustersCreated} created, ${result.keywordsAssigned} keywords assigned, ${result.clustersRemoved} removed`,
        data: result,
      });
    } else {
      // Cluster new unclustered keywords
      result = await clusterKeywords(config);

      // Log admin action
      await prisma.adminAction.create({
        data: {
          actionType: "CLUSTER",
          targetType: "trend_clusters",
          targetId: "new",
          details: {
            clustersCreated: result.clustersCreated,
            keywordsAssigned: result.keywordsAssigned,
            similarityThreshold,
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Created ${result.clustersCreated} new clusters, assigned ${result.keywordsAssigned} keywords`,
        data: result,
      });
    }
  } catch (error) {
    console.error("Admin cluster trends API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to cluster keywords: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/trends/cluster
 * Get cluster list or details
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get("id");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    if (clusterId) {
      // Get specific cluster details
      const cluster = await getClusterDetails(clusterId);

      if (!cluster) {
        return NextResponse.json(
          { success: false, error: "Cluster not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: { cluster },
      });
    }

    // Get cluster list
    const skip = (page - 1) * limit;

    const [clusters, total] = await Promise.all([
      prisma.trendKeywordCluster.findMany({
        where: { isActive: true },
        include: {
          _count: { select: { members: true } },
          members: {
            include: {
              keyword: {
                select: { source: true },
              },
            },
            take: 10,
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.trendKeywordCluster.count({ where: { isActive: true } }),
    ]);

    // Calculate scores and source counts for each cluster
    const clustersWithScores = await Promise.all(
      clusters.map(async (cluster) => {
        const score = await calculateClusterScore(cluster.id);
        const sources = new Set(cluster.members.map((m) => m.keyword.source));

        return {
          id: cluster.id,
          name: cluster.name,
          memberCount: cluster._count.members,
          sourceCount: sources.size,
          sources: Array.from(sources),
          combinedScore: score,
          createdAt: cluster.createdAt,
          updatedAt: cluster.updatedAt,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        clusters: clustersWithScores,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Admin get clusters API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch clusters" },
      { status: 500 }
    );
  }
}
