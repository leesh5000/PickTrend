"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategoryMap } from "@/hooks/useCategories";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ScoreBreakdown } from "@/components/score-breakdown";

async function fetchProduct(id: string) {
  const res = await fetch(`/api/products/${id}`);
  return res.json();
}

async function trackClick(productId: string, videoId?: string) {
  await fetch("/api/track/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, videoId }),
  });
}

export default function ProductPage({ params }: { params: { id: string } }) {
  const { categoryMap } = useCategoryMap();
  const { data, isLoading } = useQuery({
    queryKey: ["product", params.id],
    queryFn: () => fetchProduct(params.id),
  });

  const product = data?.data;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">상품을 찾을 수 없습니다</h1>
            <Link href="/rankings" className="text-primary hover:underline">
              랭킹으로 돌아가기
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-4">
          <Link href="/" className="hover:text-foreground">
            홈
          </Link>
          {" > "}
          <Link href="/rankings" className="hover:text-foreground">
            랭킹
          </Link>
          {" > "}
          <span>{product.name}</span>
        </nav>

        {/* Product Header */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <div className="w-full md:w-64 flex-shrink-0">
            <div
              className={`w-full h-48 md:h-64 bg-muted rounded-lg overflow-hidden ${
                product.affiliateUrl ? "cursor-pointer hover:opacity-90 transition" : ""
              }`}
              onClick={() => {
                if (product.affiliateUrl) {
                  trackClick(product.id);
                  window.open(product.affiliateUrl, "_blank");
                }
              }}
            >
              {product.thumbnailUrl ? (
                <img
                  src={product.thumbnailUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No Image
                </div>
              )}
            </div>
            <p className="hidden md:block text-[11px] text-blue-500 mt-3 leading-relaxed">
              이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
            </p>
          </div>

          <div className="flex-1">
            <h1
              className={`text-xl sm:text-2xl md:text-3xl font-bold mb-2 ${
                product.affiliateUrl ? "cursor-pointer hover:text-primary transition-colors" : ""
              }`}
              onClick={() => {
                if (product.affiliateUrl) {
                  trackClick(product.id);
                  window.open(product.affiliateUrl, "_blank");
                }
              }}
            >
              {product.name}
            </h1>

            {/* Price Info */}
            {(product.price || product.originalPrice) && (
              <div className="flex items-center gap-3 mb-3">
                {product.discountRate && (
                  <span className="text-lg sm:text-xl font-bold text-red-500">
                    {product.discountRate}%
                  </span>
                )}
                {product.originalPrice && product.originalPrice !== product.price && (
                  <span className="text-sm sm:text-base text-muted-foreground line-through">
                    {product.originalPrice.toLocaleString()}원
                  </span>
                )}
                {product.price && (
                  <span className="text-xl sm:text-2xl font-bold text-foreground">
                    {product.price.toLocaleString()}원
                  </span>
                )}
              </div>
            )}

            {product.category && (
              <Badge variant="secondary" className="mb-4">
                {categoryMap[product.category] || product.category}
              </Badge>
            )}

            {/* Current Ranking */}
            {product.rankings && product.rankings.length > 0 && (
              <div className="bg-muted rounded-lg p-4 mb-4">
                <div className="text-sm text-muted-foreground mb-1">
                  현재 순위
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-primary">
                  #{product.rankings[0].rank}
                </div>
                <div className="text-sm text-muted-foreground">
                  점수: {product.rankings[0].score.toFixed(1)}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="text-center p-2 sm:p-3 bg-muted rounded-lg">
                <div className="text-xl sm:text-2xl font-bold">{product.videos.length}</div>
                <div className="text-xs text-muted-foreground">관련 영상</div>
              </div>
              <div className="text-center p-2 sm:p-3 bg-muted rounded-lg">
                <div className="text-xl sm:text-2xl font-bold">
                  {formatNumber(
                    product.videos.reduce(
                      (sum: number, v: any) => sum + (v.latestMetric?.viewCount || 0),
                      0
                    )
                  )}
                </div>
                <div className="text-xs text-muted-foreground">총 조회수</div>
              </div>
              <div className="text-center p-2 sm:p-3 bg-muted rounded-lg">
                <div className="text-xl sm:text-2xl font-bold">
                  {formatNumber(
                    product.videos.reduce(
                      (sum: number, v: any) => sum + (v.latestMetric?.likeCount || 0),
                      0
                    )
                  )}
                </div>
                <div className="text-xs text-muted-foreground">총 좋아요</div>
              </div>
            </div>

            {product.affiliateUrl && (
              <Button
                size="lg"
                className="w-full mt-6 h-14 text-lg font-bold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                onClick={() => {
                  trackClick(product.id);
                  window.open(product.affiliateUrl, "_blank");
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                상품 구매하러 가기
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 ml-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </Button>
            )}
          </div>
        </div>

        {/* Related Videos */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>관련 영상</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {product.videos.map((video: any) => (
                <a
                  key={video.id}
                  href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackClick(product.id, video.id)}
                  className="block group"
                >
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden mb-2 relative">
                    {video.thumbnailUrl ? (
                      <Image
                        src={video.thumbnailUrl}
                        alt={video.title}
                        fill
                        className="object-cover group-hover:scale-105 transition"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        No Thumbnail
                      </div>
                    )}
                    <div className="absolute top-2 left-2 flex gap-1">
                      {video.videoType === "SHORTS" && (
                        <Badge variant="destructive">
                          Shorts
                        </Badge>
                      )}
                      {(video.scoreBreakdown?.totalScore >= 70 || (video.latestMetric?.viewCount || 0) >= 100000) && (
                        <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black">
                          인기
                        </Badge>
                      )}
                    </div>
                  </div>
                  <h3 className="font-medium line-clamp-2 group-hover:text-primary transition">
                    {video.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {video.channelName}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-2">
                    <span className="flex items-center gap-1 text-foreground/80">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span className="font-medium">{formatNumber(video.latestMetric?.viewCount || 0)}</span>
                    </span>
                    <span className="flex items-center gap-1 text-red-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      <span className="font-medium">{formatNumber(video.latestMetric?.likeCount || 0)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {format(new Date(video.publishedAt), "yyyy.M.d", {
                        locale: ko,
                      })}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Score Breakdown */}
        {product.productScoreBreakdown && (
          <ScoreBreakdown
            productScoreBreakdown={product.productScoreBreakdown}
            videos={product.videos.map((v: any) => ({
              id: v.id,
              title: v.title,
              scoreBreakdown: v.scoreBreakdown,
            }))}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}
