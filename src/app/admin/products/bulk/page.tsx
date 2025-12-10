"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCategories } from "@/hooks/useCategories";
import { parseCoupangHtml, CoupangProduct, ParseResult } from "@/lib/coupang/parser";
import { useMultiFormPersist } from "@/hooks/useFormPersist";

interface VideoResult {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number;
  isShorts: boolean;
  subscriberCount: number | null;
  previewScore: number;
}

interface ProductWithVideos extends CoupangProduct {
  id: string;
  selected: boolean;
  category: string;
  affiliateUrl: string;
  videos: VideoResult[];
  searchQuery: string;
  isSearching: boolean;
  isRegistered: boolean;
  error?: string;
}

async function searchYouTubeVideos(query: string) {
  const res = await fetch("/api/admin/youtube/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      maxResults: 10,
      order: "viewCount",
      publishedAfter: "any",
    }),
  });
  return res.json();
}

async function createProduct(data: {
  name: string;
  category: string;
  affiliateUrl: string;
  thumbnailUrl?: string;
  videos: VideoResult[];
}) {
  const payload = {
    ...data,
    videos: data.videos.map((v) => ({
      youtubeId: v.videoId,
      title: v.title,
      description: v.description,
      channelId: v.channelId,
      channelName: v.channelName,
      thumbnailUrl: v.thumbnailUrl,
      publishedAt: v.publishedAt,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
      duration: v.duration,
      isShorts: v.isShorts,
      subscriberCount: v.subscriberCount,
    })),
  };

  const res = await fetch("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Sort videos by score -> viewCount -> likeCount
const sortVideos = (videos: VideoResult[]): VideoResult[] => {
  return [...videos].sort((a, b) => {
    if (b.previewScore !== a.previewScore) return b.previewScore - a.previewScore;
    if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
    return b.likeCount - a.likeCount;
  });
};

export default function BulkProductPage() {
  const router = useRouter();
  const { data: categories, refetch: refetchCategories, isFetching: isFetchingCategories } = useCategories();

  // Persistent form state
  const {
    values: persistedState,
    setValue: setPersistedValue,
    setValues: setPersistedState,
    clearSavedData,
    isInitialized,
  } = useMultiFormPersist<{
    htmlInput: string;
    defaultCategory: string;
    products: ProductWithVideos[];
    activeProductId: string | null;
    searchResults: Record<string, VideoResult[]>;
  }>("admin-bulk-product-form", {
    htmlInput: "",
    defaultCategory: "",
    products: [],
    activeProductId: null,
    searchResults: {},
  });

  // Extract values
  const htmlInput = persistedState.htmlInput;
  const defaultCategory = persistedState.defaultCategory;
  const products = persistedState.products;
  const activeProductId = persistedState.activeProductId;
  const searchResults = persistedState.searchResults;

  // Setters
  const setHtmlInput = (value: string) => setPersistedValue("htmlInput", value);
  const setDefaultCategory = (value: string) => setPersistedValue("defaultCategory", value);
  const setProducts = (value: ProductWithVideos[] | ((prev: ProductWithVideos[]) => ProductWithVideos[])) => {
    if (typeof value === "function") {
      setPersistedState((prev) => ({ ...prev, products: value(prev.products) }));
    } else {
      setPersistedValue("products", value);
    }
  };
  const setActiveProductId = (value: string | null) => setPersistedValue("activeProductId", value);
  const setSearchResults = (value: Record<string, VideoResult[]> | ((prev: Record<string, VideoResult[]>) => Record<string, VideoResult[]>)) => {
    if (typeof value === "function") {
      setPersistedState((prev) => ({ ...prev, searchResults: value(prev.searchResults) }));
    } else {
      setPersistedValue("searchResults", value);
    }
  };

  // Non-persistent state
  const [parseError, setParseError] = useState("");
  const [parseWarning, setParseWarning] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationResults, setRegistrationResults] = useState<{
    success: number;
    failed: number;
  } | null>(null);

  // Parse HTML
  const handleParse = () => {
    setParseError("");
    setParseWarning("");
    try {
      const { pageType, products: parsed, warning, totalContainers, hiddenContainers } = parseCoupangHtml(htmlInput);

      if (parsed.length === 0) {
        setParseError("상품을 찾을 수 없습니다. HTML을 확인해주세요.");
        return;
      }

      // Show warning if some products were not loaded
      if (warning) {
        setParseWarning(warning);
      }

      const productsWithMeta: ProductWithVideos[] = parsed.map((p, idx) => ({
        ...p,
        id: `product-${idx}-${Date.now()}`,
        selected: true,
        category: defaultCategory,
        affiliateUrl: p.productUrl, // Use product URL as affiliate URL for now
        videos: [],
        searchQuery: p.name,
        isSearching: false,
        isRegistered: false,
      }));

      setProducts(productsWithMeta);
    } catch (err) {
      setParseError("HTML 파싱 중 오류가 발생했습니다.");
      console.error(err);
    }
  };

  // Toggle product selection
  const toggleProduct = (id: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  };

  // Update product field
  const updateProduct = (id: string, updates: Partial<ProductWithVideos>) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  // Search videos for a product
  const handleSearchVideos = async (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    updateProduct(productId, { isSearching: true });

    try {
      const result = await searchYouTubeVideos(product.searchQuery);
      if (result.success && result.data?.videos) {
        // Sort by score -> viewCount -> likeCount
        const sortedVideos = sortVideos(result.data.videos);
        setSearchResults((prev) => ({
          ...prev,
          [productId]: sortedVideos,
        }));
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      updateProduct(productId, { isSearching: false });
    }
  };

  // Toggle video selection for a product
  const toggleVideo = (productId: string, video: VideoResult) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;

        const exists = p.videos.some((v) => v.videoId === video.videoId);
        if (exists) {
          return { ...p, videos: p.videos.filter((v) => v.videoId !== video.videoId) };
        } else {
          return { ...p, videos: [...p.videos, video] };
        }
      })
    );
  };

  // Register all selected products
  const handleRegisterAll = async () => {
    const toRegister = products.filter(
      (p) => p.selected && p.videos.length > 0 && p.category && p.affiliateUrl && !p.isRegistered
    );

    if (toRegister.length === 0) {
      alert("등록할 상품이 없습니다. 카테고리, Affiliate URL, 영상을 모두 입력해주세요.");
      return;
    }

    setIsRegistering(true);
    let success = 0;
    let failed = 0;

    for (const product of toRegister) {
      try {
        const result = await createProduct({
          name: product.name,
          category: product.category,
          affiliateUrl: product.affiliateUrl,
          thumbnailUrl: product.imageUrl,
          videos: product.videos,
        });

        if (result.success) {
          success++;
          updateProduct(product.id, { isRegistered: true });
        } else {
          failed++;
          updateProduct(product.id, { error: result.error });
        }
      } catch (err) {
        failed++;
        updateProduct(product.id, { error: "등록 실패" });
      }
    }

    setIsRegistering(false);
    setRegistrationResults({ success, failed });

    // Clear saved data if all products are registered
    if (failed === 0 && success > 0) {
      clearSavedData();
    }
  };

  const selectedCount = products.filter((p) => p.selected).length;
  const readyCount = products.filter(
    (p) => p.selected && p.videos.length > 0 && p.category && p.affiliateUrl
  ).length;
  const registeredCount = products.filter((p) => p.isRegistered).length;

  if (!isInitialized) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">상품 일괄 등록</h1>
          <p className="text-sm text-muted-foreground">
            쿠팡 페이지에서 복사한 HTML로 여러 상품을 한번에 등록합니다.
          </p>
        </div>
        <Link href="/admin/products">
          <Button variant="outline" size="sm">상품 목록</Button>
        </Link>
      </div>

      {/* Step 1: HTML Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Step 1: HTML 붙여넣기</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
              <p className="font-medium mb-2">사용 방법 (Console 스크립트):</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>쿠팡 골드박스 페이지 접속</li>
                <li>F12 (개발자 도구) → Console 탭</li>
                <li>allow pasting 입력 후 Enter (최초 1회)</li>
                <li>아래 코드를 복사하여 붙여넣기 후 Enter (자동 스크롤 시작)</li>
              </ol>
              <pre className="mt-2 p-2 bg-background rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
{`(async()=>{const d={};const get=()=>{document.querySelectorAll('.product-item').forEach(item=>{const nameEl=item.querySelector('.product-description .LinesEllipsis');const name=nameEl?.textContent?.trim();if(!name||d[name])return;const img=item.querySelector('.product-picture img');const priceEl=item.querySelector('.sale-price .currency-label');const discountEl=item.querySelector('.discount');const price=priceEl?.textContent?.match(/[\\d,]+/)?.[0];const discountMatch=discountEl?.textContent?.match(/(\\d+)%.*?([\\d,]+)/);d[name]={name,image:img?.src||'',price,originalPrice:discountMatch?.[2],discount:discountMatch?.[1]}});return Object.keys(d).length};console.log('스크롤 시작...');let prev=0,cnt=0;while(cnt<100){const n=get();console.log('현재:',n,'개');window.scrollBy(0,600);await new Promise(r=>setTimeout(r,250));if(window.scrollY===prev)break;prev=window.scrollY;cnt++}get();window.scrollTo(0,0);const arr=Object.values(d);const json=JSON.stringify(arr,null,2);window._coupangData=json;console.log('완료!',arr.length,'개');const copyToClip=async(t)=>{try{await navigator.clipboard.writeText(t);return true}catch(e){try{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;left:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);return true}catch(e2){return false}}};if(await copyToClip(json)){alert(arr.length+'개 상품이 클립보드에 복사되었습니다!\\n\\n이제 PickRanky 일괄등록 페이지에 붙여넣기(Ctrl+V)하세요.')}else{console.log(json);alert(arr.length+'개 파싱 완료!\\n\\n아래 방법 중 하나로 복사하세요:\\n1. 콘솔에서 copy(_coupangData) 입력\\n2. 콘솔 출력된 JSON 직접 선택 후 복사')}})();`}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground">※ 자동으로 클립보드에 복사됩니다</p>
              <p className="mt-1 text-xs text-muted-foreground">※ 새 골드박스 페이지용 (product-item 구조)</p>
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">이전 버전 스크립트 (discount-product-unit 구조)</summary>
                <pre className="mt-2 p-2 bg-background rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
{`(async()=>{const d={};const get=()=>{document.querySelectorAll('a[href*="/products/"]').forEach(a=>{let c=a.closest('.discount-product-unit')||a.closest('[class*="product"]');if(!c)return;let t=c.querySelector('.info_section__title');let name=t?.textContent?.trim();if(!name||d[name])return;const i=c.querySelector('img[src*="coupangcdn"]');d[name]={name,url:a.href,image:i?.src||''}});return Object.keys(d).length};console.log('스크롤 시작...');let prev=0,cnt=0;while(cnt<100){const n=get();console.log('현재:',n,'개');window.scrollBy(0,600);await new Promise(r=>setTimeout(r,250));if(window.scrollY===prev)break;prev=window.scrollY;cnt++}get();window.scrollTo(0,0);const arr=Object.values(d);const json=JSON.stringify(arr,null,2);window._coupangData=json;console.log('완료!',arr.length,'개');const copyToClip=async(t)=>{try{await navigator.clipboard.writeText(t);return true}catch(e){try{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;left:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);return true}catch(e2){return false}}};if(await copyToClip(json)){alert(arr.length+'개 상품이 클립보드에 복사되었습니다!')}else{console.log(json);alert(arr.length+'개 파싱 완료! copy(_coupangData) 실행하세요')}})();`}
                </pre>
              </details>
              <p className="mt-2 text-xs">5. 자동 스크롤 완료 후 아래 입력창에 Ctrl+V로 붙여넣기</p>
            </div>

            <textarea
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
              placeholder="쿠팡 페이지 HTML을 붙여넣으세요..."
              className="w-full h-40 p-3 border rounded-lg font-mono text-sm resize-none"
            />

            {parseError && (
              <p className="text-sm text-destructive">{parseError}</p>
            )}

            {parseWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800 font-medium">
                  ⚠️ {parseWarning}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Tip: 쿠팡 페이지를 끝까지 스크롤하면 모든 상품이 로드됩니다.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">기본 카테고리:</label>
                <select
                  value={defaultCategory}
                  onChange={(e) => setDefaultCategory(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">선택 안함</option>
                  {categories?.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchCategories()}
                  disabled={isFetchingCategories}
                  className="h-8 px-2"
                  title="카테고리 새로고침"
                >
                  <svg
                    className={`w-4 h-4 ${isFetchingCategories ? "animate-spin" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </Button>
              </div>

              <Button onClick={handleParse} disabled={!htmlInput.trim()}>
                HTML 파싱하기
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 & 3: Product List and Video Selection */}
      {products.length > 0 && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base sm:text-lg">
                  Step 2: 상품 목록 ({products.length}개)
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                  <span>선택: {selectedCount}개</span>
                  <span>준비 완료: {readyCount}개</span>
                  {registeredCount > 0 && (
                    <span className="text-green-600">등록됨: {registeredCount}개</span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className={`border rounded-lg p-4 ${
                      product.isRegistered
                        ? "bg-green-50 border-green-200"
                        : product.selected
                        ? "bg-card"
                        : "bg-muted/50 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3 sm:gap-4">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={product.selected}
                        onChange={() => toggleProduct(product.id)}
                        disabled={product.isRegistered}
                        className="mt-1 flex-shrink-0"
                      />

                      {/* Image */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                            No Image
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm line-clamp-2 mb-2">
                          {product.name}
                        </h3>

                        <div className="flex items-center gap-4 mb-2">
                          {product.price && (
                            <span className="text-primary font-bold">
                              {product.price.toLocaleString()}원
                            </span>
                          )}
                          {product.discountRate && (
                            <Badge variant="destructive">{product.discountRate}%</Badge>
                          )}
                          {product.isRegistered && (
                            <Badge variant="success">등록 완료</Badge>
                          )}
                          {product.error && (
                            <Badge variant="destructive">{product.error}</Badge>
                          )}
                        </div>

                        {product.selected && !product.isRegistered && (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Category */}
                              <select
                                value={product.category}
                                onChange={(e) =>
                                  updateProduct(product.id, { category: e.target.value })
                                }
                                className="px-2 py-1 border rounded text-sm"
                              >
                                <option value="">카테고리 선택</option>
                                {categories?.map((cat) => (
                                  <option key={cat.key} value={cat.key}>
                                    {cat.name}
                                  </option>
                                ))}
                              </select>

                              {/* Video count */}
                              <Badge variant={product.videos.length > 0 ? "default" : "outline"}>
                                영상 {product.videos.length}개
                              </Badge>

                              {/* Affiliate URL status */}
                              {!product.affiliateUrl && (
                                <Badge variant="outline" className="text-amber-600 border-amber-300">
                                  URL 필요
                                </Badge>
                              )}

                              {/* Search button */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveProductId(
                                    activeProductId === product.id ? null : product.id
                                  );
                                  if (!searchResults[product.id]) {
                                    handleSearchVideos(product.id);
                                  }
                                }}
                                disabled={product.isSearching}
                              >
                                {product.isSearching
                                  ? "검색 중..."
                                  : activeProductId === product.id
                                  ? "영상 선택 닫기"
                                  : "영상 검색"}
                              </Button>
                            </div>

                            {/* Affiliate URL Input */}
                            <div className="flex items-center gap-2">
                              <Input
                                value={product.affiliateUrl}
                                onChange={(e) =>
                                  updateProduct(product.id, { affiliateUrl: e.target.value })
                                }
                                placeholder="Affiliate URL (쿠팡 파트너스에서 생성)"
                                className="flex-1 h-8 text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Video Selection Panel */}
                    {activeProductId === product.id && searchResults[product.id] && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center gap-2 mb-3">
                          <Input
                            value={product.searchQuery}
                            onChange={(e) =>
                              updateProduct(product.id, { searchQuery: e.target.value })
                            }
                            placeholder="검색어 수정"
                            className="flex-1 h-8 text-sm"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSearchVideos(product.id)}
                          >
                            재검색
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                          {searchResults[product.id].map((video) => {
                            const isSelected = product.videos.some(
                              (v) => v.videoId === video.videoId
                            );
                            return (
                              <div
                                key={video.videoId}
                                onClick={() => toggleVideo(product.id, video)}
                                className={`flex items-start gap-2 p-2 rounded cursor-pointer border ${
                                  isSelected
                                    ? "bg-primary/10 border-primary"
                                    : "bg-muted/50 border-transparent hover:border-muted-foreground/30"
                                }`}
                              >
                                <div className="relative flex-shrink-0">
                                  <img
                                    src={video.thumbnailUrl}
                                    alt={video.title}
                                    className="w-24 h-14 object-cover rounded"
                                  />
                                  <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-xs px-1 rounded">
                                    {formatDuration(video.duration)}
                                  </span>
                                  {video.isShorts && (
                                    <Badge className="absolute top-0.5 left-0.5 text-xs px-1 py-0">
                                      Shorts
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium line-clamp-2">
                                    {video.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {video.channelName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    조회수 {formatNumber(video.viewCount)} · 점수{" "}
                                    {video.previewScore.toFixed(1)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Step 4: Register */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 3: 일괄 등록</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <p>
                    준비된 상품 {readyCount}개를 등록합니다.
                    {readyCount !== selectedCount && (
                      <span className="text-amber-600 ml-2">
                        (카테고리, Affiliate URL, 영상이 모두 입력되지 않은 상품은 제외됩니다)
                      </span>
                    )}
                  </p>
                </div>

                <Button
                  onClick={handleRegisterAll}
                  disabled={readyCount === 0 || isRegistering}
                  size="lg"
                >
                  {isRegistering
                    ? "등록 중..."
                    : `${readyCount}개 상품 일괄 등록`}
                </Button>
              </div>

              {registrationResults && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="font-medium">등록 완료</p>
                  <p className="text-sm">
                    성공: {registrationResults.success}개 / 실패:{" "}
                    {registrationResults.failed}개
                  </p>
                  {registrationResults.success > 0 && (
                    <Button
                      variant="link"
                      className="p-0 h-auto mt-2"
                      onClick={() => router.push("/admin/products")}
                    >
                      상품 목록 보기 →
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
