"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCategories, useCategoryMap } from "@/hooks/useCategories";
import { TrendSource } from "@prisma/client";

const SOURCE_OPTIONS: { value: TrendSource; label: string }[] = [
  { value: "MANUAL", label: "수동 등록" },
  { value: "NAVER_DATALAB", label: "Naver DataLab" },
  { value: "GOOGLE_TRENDS", label: "Google Trends" },
  { value: "DAUM", label: "다음" },
];

async function fetchTrendKeyword(id: string) {
  const res = await fetch(`/api/admin/trends/${id}`);
  return res.json();
}

async function updateTrendKeyword(
  id: string,
  data: {
    keyword?: string;
    category?: string | null;
    source?: TrendSource;
    isActive?: boolean;
  }
) {
  const res = await fetch(`/api/admin/trends/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function triggerMatch(keywordId: string) {
  const res = await fetch("/api/admin/trends/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywordId, clearExisting: true, preserveManual: true }),
  });
  return res.json();
}

async function deleteMatch(keywordId: string, matchId: string) {
  const res = await fetch(`/api/admin/trends/${keywordId}/matches?matchId=${matchId}`, {
    method: "DELETE",
  });
  return res.json();
}

async function searchProducts(search: string) {
  if (!search || search.length < 2) return { data: { products: [] } };
  const res = await fetch(`/api/admin/products?search=${encodeURIComponent(search)}&limit=10`);
  return res.json();
}

async function addManualMatch(keywordId: string, productId: string) {
  const res = await fetch(`/api/admin/trends/${keywordId}/matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, matchScore: 100 }),
  });
  return res.json();
}

export default function EditTrendKeywordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const { categoryMap } = useCategoryMap();

  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string>("");
  const [source, setSource] = useState<TrendSource>("MANUAL");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-trend", id],
    queryFn: () => fetchTrendKeyword(id),
  });

  const productSearchQuery = useQuery({
    queryKey: ["product-search", productSearch],
    queryFn: () => searchProducts(productSearch),
    enabled: productSearch.length >= 2,
  });

  useEffect(() => {
    if (data?.data?.keyword) {
      const kw = data.data.keyword;
      setKeyword(kw.keyword);
      setCategory(kw.category || "");
      setSource(kw.source);
      setIsActive(kw.isActive);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (updateData: any) => updateTrendKeyword(id, updateData),
    onSuccess: (data) => {
      if (data.success) {
        refetch();
        alert("저장되었습니다.");
      } else {
        setError(data.error || "저장에 실패했습니다.");
      }
    },
    onError: () => {
      setError("저장 중 오류가 발생했습니다.");
    },
  });

  const matchMutation = useMutation({
    mutationFn: () => triggerMatch(id),
    onSuccess: (data) => {
      if (data.success) {
        refetch();
        alert(`매칭 완료: ${data.message}`);
      } else {
        alert(`매칭 실패: ${data.error}`);
      }
    },
  });

  const deleteMatchMutation = useMutation({
    mutationFn: (matchId: string) => deleteMatch(id, matchId),
    onSuccess: () => {
      refetch();
    },
  });

  const addMatchMutation = useMutation({
    mutationFn: (productId: string) => addManualMatch(id, productId),
    onSuccess: (data) => {
      if (data.success) {
        refetch();
        setProductSearch("");
      } else {
        alert(`매칭 추가 실패: ${data.error}`);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!keyword.trim()) {
      setError("키워드를 입력해주세요.");
      return;
    }

    updateMutation.mutate({
      keyword: keyword.trim(),
      category: category || null,
      source,
      isActive,
    });
  };

  const trendData = data?.data?.keyword;
  const matches = trendData?.productMatches || [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!trendData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">키워드를 찾을 수 없습니다.</p>
        <Button className="mt-4" onClick={() => router.push("/admin/trends")}>
          목록으로
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">키워드 편집</h1>
        <Button variant="outline" onClick={() => router.push("/admin/trends")}>
          목록으로
        </Button>
      </div>

      {/* Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle>키워드 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="keyword">키워드 *</Label>
              <Input
                id="keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="max-w-md"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">카테고리</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">카테고리 없음</option>
                {categories?.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">데이터 소스</Label>
              <select
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value as TrendSource)}
                className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isActive">활성화</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Product Matches */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>연관 상품 ({matches.length})</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => matchMutation.mutate()}
            disabled={matchMutation.isPending}
          >
            {matchMutation.isPending ? "매칭 중..." : "자동 매칭 실행"}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Add manual match */}
          <div className="mb-6">
            <Label className="mb-2 block">수동 매칭 추가</Label>
            <div className="flex gap-2 max-w-md">
              <Input
                placeholder="상품명 검색..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            {productSearchQuery.data?.data?.products?.length > 0 && (
              <div className="mt-2 border rounded-lg max-w-md max-h-48 overflow-y-auto">
                {productSearchQuery.data.data.products.map((product: any) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-2 hover:bg-muted cursor-pointer"
                    onClick={() => addMatchMutation.mutate(product.id)}
                  >
                    <span className="text-sm truncate">{product.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={addMatchMutation.isPending}
                    >
                      추가
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Matches list */}
          {matches.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              연관된 상품이 없습니다. 자동 매칭을 실행하거나 수동으로 추가하세요.
            </p>
          ) : (
            <div className="space-y-2">
              {matches.map((match: any) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {match.product.thumbnailUrl && (
                      <img
                        src={match.product.thumbnailUrl}
                        alt=""
                        className="w-10 h-10 object-cover rounded"
                      />
                    )}
                    <div>
                      <div className="font-medium">{match.product.name}</div>
                      <div className="text-sm text-muted-foreground flex gap-2">
                        {match.product.category && (
                          <Badge variant="outline" className="text-xs">
                            {categoryMap[match.product.category] ||
                              match.product.category}
                          </Badge>
                        )}
                        <span>점수: {match.matchScore.toFixed(1)}</span>
                        <span>타입: {match.matchType}</span>
                        {match.isManual && (
                          <Badge variant="secondary" className="text-xs">
                            수동
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMatchMutation.mutate(match.id)}
                    disabled={deleteMatchMutation.isPending}
                  >
                    제거
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metrics History */}
      {trendData.metrics && trendData.metrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>검색량 기록</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">수집일시</th>
                    <th className="text-left py-2">소스</th>
                    <th className="text-right py-2">검색량</th>
                    <th className="text-right py-2">순위</th>
                  </tr>
                </thead>
                <tbody>
                  {trendData.metrics.slice(0, 10).map((metric: any) => (
                    <tr key={metric.id} className="border-b">
                      <td className="py-2">
                        {new Date(metric.collectedAt).toLocaleString("ko-KR")}
                      </td>
                      <td className="py-2">
                        <Badge variant="outline">{metric.source}</Badge>
                      </td>
                      <td className="py-2 text-right">{metric.searchVolume}</td>
                      <td className="py-2 text-right">{metric.rank ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
