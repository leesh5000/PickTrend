import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // 이번 주 시작일 계산
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    // 이번 주 수집된 메트릭 중 조회수가 높은 영상들 조회
    const popularVideos = await prisma.video.findMany({
      where: {
        isActive: true,
      },
      include: {
        metrics: {
          orderBy: {
            collectedAt: "desc",
          },
          take: 1,
        },
        product: {
          select: {
            id: true,
            name: true,
            affiliateUrl: true,
          },
        },
      },
    });

    // 조회수 기준으로 정렬
    const sortedVideos = popularVideos
      .filter((video) => video.metrics.length > 0)
      .sort((a, b) => {
        const aViews = a.metrics[0]?.viewCount || 0;
        const bViews = b.metrics[0]?.viewCount || 0;
        return bViews - aViews;
      })
      .slice(0, limit);

    // 응답 형태 변환
    const formattedVideos = sortedVideos.map((video, index) => ({
      id: `video-${video.id}`,
      rank: index + 1,
      video: {
        id: video.id,
        youtubeId: video.youtubeId,
        title: video.title,
        channelName: video.channelName,
        thumbnailUrl: video.thumbnailUrl,
        videoType: video.videoType,
        viewCount: video.metrics[0]?.viewCount || 0,
        likeCount: video.metrics[0]?.likeCount || 0,
      },
      product: video.product,
    }));

    return NextResponse.json({
      success: true,
      data: {
        videos: formattedVideos,
      },
    });
  } catch (error) {
    console.error("Popular videos API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch popular videos" },
      { status: 500 }
    );
  }
}
