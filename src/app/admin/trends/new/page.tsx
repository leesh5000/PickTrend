"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCategories } from "@/hooks/useCategories";
import { TrendSource } from "@prisma/client";

const SOURCE_OPTIONS: { value: TrendSource; label: string }[] = [
  { value: "MANUAL", label: "수동 등록" },
  { value: "NAVER_DATALAB", label: "Naver DataLab" },
  { value: "GOOGLE_TRENDS", label: "Google Trends" },
  { value: "DAUM", label: "다음" },
];

async function createTrendKeyword(data: {
  keyword: string;
  category?: string;
  source: TrendSource;
  isActive: boolean;
}) {
  const res = await fetch("/api/admin/trends", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function searchProducts(search: string) {
  if (!search || search.length < 2) return { data: { products: [] } };
  const res = await fetch(`/api/admin/products?search=${encodeURIComponent(search)}&limit=10`);
  return res.json();
}

async function triggerMatch(keywordId: string) {
  const res = await fetch("/api/admin/trends/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywordId }),
  });
  return res.json();
}

export default function NewTrendKeywordPage() {
  const router = useRouter();
  const { data: categories } = useCategories();

  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string>("");
  const [source, setSource] = useState<TrendSource>("MANUAL");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createdKeywordId, setCreatedKeywordId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createTrendKeyword,
    onSuccess: async (data) => {
      if (data.success) {
        setCreatedKeywordId(data.data.keyword.id);
        // Auto-run matching
        await triggerMatch(data.data.keyword.id);
        router.push("/admin/trends");
      } else {
        setError(data.error || "등록에 실패했습니다.");
      }
    },
    onError: () => {
      setError("등록 중 오류가 발생했습니다.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!keyword.trim()) {
      setError("키워드를 입력해주세요.");
      return;
    }

    createMutation.mutate({
      keyword: keyword.trim(),
      category: category || undefined,
      source,
      isActive,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">트렌드 키워드 등록</h1>
      </div>

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
                placeholder="예: 아이폰16, 다이슨 에어랩"
                className="max-w-md"
              />
              <p className="text-sm text-muted-foreground">
                검색어 트렌드로 추적할 키워드를 입력하세요.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">카테고리</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">카테고리 선택 (선택사항)</option>
                {categories?.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                특정 카테고리와 연결하면 해당 카테고리 상품만 매칭됩니다.
              </p>
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
              <p className="text-sm text-muted-foreground">
                수동 등록 시 "수동 등록"을 선택하세요.
              </p>
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
              <Button
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "등록 중..." : "키워드 등록"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                취소
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle>키워드 등록 팁</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• 구체적인 상품명이나 브랜드명을 입력하면 더 정확한 매칭이 가능합니다.</p>
          <p>• 등록 후 자동으로 상품 매칭이 실행됩니다.</p>
          <p>• Naver DataLab이나 Google Trends에서 검색량 데이터를 수집하려면 해당 소스를 선택하세요.</p>
          <p>• 매칭된 상품은 편집 화면에서 확인하고 수정할 수 있습니다.</p>
        </CardContent>
      </Card>
    </div>
  );
}
