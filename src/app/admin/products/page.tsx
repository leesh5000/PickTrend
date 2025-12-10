"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCategoryMap } from "@/hooks/useCategories";

const SORT_OPTIONS = [
  { value: "createdAtDesc", label: "등록일 (최신순)" },
  { value: "createdAtAsc", label: "등록일 (오래된순)" },
  { value: "name", label: "이름 (가나다순)" },
  { value: "nameDesc", label: "이름 (역순)" },
] as const;
type SortOption = (typeof SORT_OPTIONS)[number]["value"];

async function fetchProducts(params: {
  page: number;
  search?: string;
  category?: string;
  sortBy?: string;
}) {
  const searchParams = new URLSearchParams({
    page: params.page.toString(),
    limit: "20",
  });
  if (params.search) searchParams.set("search", params.search);
  if (params.category) searchParams.set("category", params.category);
  if (params.sortBy) searchParams.set("sortBy", params.sortBy);

  const res = await fetch(`/api/admin/products?${searchParams}`);
  return res.json();
}

export default function AdminProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<SortOption>("createdAtDesc");
  const { categoryMap, categories } = useCategoryMap();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-products", page, search, category, sortBy],
    queryFn: () => fetchProducts({ page, search, category, sortBy }),
  });

  const products = data?.data?.products || [];
  const pagination = data?.data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">상품 관리</h1>
        <Link href="/admin/products/new">
          <Button>상품 등록</Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Input
              placeholder="상품 검색..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-xs"
            />
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortOption);
                setPage(1);
              }}
              className="px-3 py-2 border rounded-lg text-sm bg-background"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={!category ? "default" : "outline"}
                onClick={() => {
                  setCategory(undefined);
                  setPage(1);
                }}
                size="sm"
              >
                전체
              </Button>
              {categories?.map((cat) => (
                <Button
                  key={cat.key}
                  variant={category === cat.key ? "default" : "outline"}
                  onClick={() => {
                    setCategory(cat.key);
                    setPage(1);
                  }}
                  size="sm"
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>상품 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : products.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              상품이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">상품명</th>
                    <th className="text-left py-3 px-2">카테고리</th>
                    <th className="text-center py-3 px-2">영상 수</th>
                    <th className="text-center py-3 px-2">클릭 수</th>
                    <th className="text-center py-3 px-2">상태</th>
                    <th className="text-right py-3 px-2">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product: any) => (
                    <tr key={product.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <div className="max-w-xs truncate">{product.name}</div>
                      </td>
                      <td className="py-3 px-2">
                        {product.category ? (
                          <Badge variant="secondary">
                            {categoryMap[product.category] || product.category}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {product._count.videos}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {product._count.clicks}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge
                          variant={product.isActive ? "success" : "secondary"}
                        >
                          {product.isActive ? "활성" : "비활성"}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Link href={`/admin/products/${product.id}`}>
                          <Button variant="outline" size="sm">
                            편집
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                이전
              </Button>
              <span className="flex items-center px-4">
                {page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page === pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
