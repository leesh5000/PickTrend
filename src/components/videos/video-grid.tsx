"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";

interface VideoItem {
  id: string;
  rank: number;
  video: {
    id: string;
    youtubeId: string;
    title: string;
    channelName: string;
    thumbnailUrl: string | null;
    videoType: "REGULAR" | "SHORTS";
    viewCount: number;
    likeCount: number;
  };
  product: {
    id: string;
    name: string;
    affiliateUrl: string | null;
  } | null;
}

interface VideoGridProps {
  apiUrl: string;
  queryKey: string;
  itemsPerPage?: number;
  rotationInterval?: number;
}

async function fetchVideos(apiUrl: string) {
  const res = await fetch(apiUrl);
  const data = await res.json();
  return data.data?.videos || [];
}

function formatViewCount(count: number): string {
  if (count >= 100000000) {
    return `${(count / 100000000).toFixed(1)}억회`;
  }
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}만회`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}천회`;
  }
  return `${count}회`;
}

export function VideoGrid({
  apiUrl,
  queryKey,
  itemsPerPage = 5,
  rotationInterval = 6000,
}: VideoGridProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: videos = [], isLoading } = useQuery<VideoItem[]>({
    queryKey: [queryKey],
    queryFn: () => fetchVideos(apiUrl),
    staleTime: 5 * 60 * 1000,
  });

  // 페이지 수 계산
  const totalPages = Math.ceil(videos.length / itemsPerPage);

  // 자동 로테이션
  useEffect(() => {
    if (isPaused || totalPages <= 1) return;

    const timer = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, rotationInterval);

    return () => clearInterval(timer);
  }, [isPaused, totalPages, rotationInterval]);

  const goToPrev = () => {
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  };

  const goToNext = () => {
    setCurrentPage((prev) => (prev + 1) % totalPages);
  };

  const handleVideoClick = (youtubeId: string, videoType: string) => {
    const url =
      videoType === "SHORTS"
        ? `https://www.youtube.com/shorts/${youtubeId}`
        : `https://www.youtube.com/watch?v=${youtubeId}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[...Array(itemsPerPage)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-video bg-muted rounded-lg mb-2" />
            <div className="h-4 bg-muted rounded w-3/4 mb-1" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        등록된 영상이 없습니다.
      </p>
    );
  }

  // 페이지별로 영상 그룹화
  const pages = [];
  for (let i = 0; i < totalPages; i++) {
    pages.push(videos.slice(i * itemsPerPage, (i + 1) * itemsPerPage));
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 슬라이드 컨테이너 */}
      <div className="overflow-hidden" ref={containerRef}>
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentPage * 100}%)` }}
        >
          {pages.map((pageVideos, pageIndex) => (
            <div key={pageIndex} className="w-full flex-shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {pageVideos.map((item) => (
                  <div
                    key={item.id}
                    className="group cursor-pointer"
                    onClick={() =>
                      handleVideoClick(item.video.youtubeId, item.video.videoType)
                    }
                  >
                    {/* 썸네일 */}
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-muted mb-2 border group-hover:border-primary/50 transition">
                      {item.video.thumbnailUrl ? (
                        <img
                          src={item.video.thumbnailUrl}
                          alt={item.video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                          No Image
                        </div>
                      )}
                      {/* 재생 아이콘 오버레이 */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
                        <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
                          <Play className="w-6 h-6 text-white fill-white ml-1" />
                        </div>
                      </div>
                      {/* Shorts 뱃지 */}
                      {item.video.videoType === "SHORTS" && (
                        <span className="absolute top-1 left-1 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                          Shorts
                        </span>
                      )}
                    </div>

                    {/* 영상 제목 */}
                    <h3 className="text-sm font-medium line-clamp-2 group-hover:text-primary transition">
                      {item.video.title}
                    </h3>

                    {/* 채널명 & 조회수 */}
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span>{item.video.channelName}</span>
                      <span className="mx-1">•</span>
                      <span>조회수 {formatViewCount(item.video.viewCount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 네비게이션 (페이지가 2개 이상일 때만 표시) */}
      {totalPages > 1 && (
        <>
          {/* 좌우 버튼 */}
          <button
            onClick={goToPrev}
            className="absolute -left-3 top-1/3 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-background border shadow-sm hover:bg-muted transition z-10"
            aria-label="이전"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToNext}
            className="absolute -right-3 top-1/3 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-background border shadow-sm hover:bg-muted transition z-10"
            aria-label="다음"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* 페이지 인디케이터 */}
          <div className="flex justify-center gap-1.5 mt-4">
            {[...Array(totalPages)].map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentPage(index)}
                className={`w-2 h-2 rounded-full transition ${
                  index === currentPage
                    ? "bg-primary"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                aria-label={`페이지 ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
