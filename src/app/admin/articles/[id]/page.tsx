"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCategories } from "@/hooks/useCategories";
import { formatDistanceToNow, format } from "date-fns";
import { ko } from "date-fns/locale";

interface Article {
  id: string;
  title: string;
  summary: string | null;
  originalUrl: string;
  thumbnailUrl: string | null;
  source: "NAVER" | "GOOGLE";
  category: string | null;
  publishedAt: string;
  collectedAt: string;
  isActive: boolean;
  createdAt: string;
  products: {
    product: {
      id: string;
      name: string;
      category: string | null;
      thumbnailUrl: string | null;
      _count: { videos: number; clicks: number };
    };
  }[];
  _count: {
    views: number;
    shares: number;
  };
}

interface Product {
  id: string;
  name: string;
  category: string | null;
  thumbnailUrl: string | null;
  _count: { videos: number; clicks: number };
}

async function fetchArticle(id: string): Promise<{ data: { article: Article } }> {
  const res = await fetch(`/api/admin/articles/${id}`);
  if (!res.ok) throw new Error("Failed to fetch article");
  return res.json();
}

async function updateArticle(id: string, data: Partial<Article>) {
  const res = await fetch(`/api/admin/articles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function deleteArticle(id: string) {
  const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
  return res.json();
}

async function addProducts(articleId: string, productIds: string[]) {
  const res = await fetch(`/api/admin/articles/${articleId}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productIds }),
  });
  return res.json();
}

async function removeProducts(articleId: string, productIds: string[]) {
  const res = await fetch(`/api/admin/articles/${articleId}/products`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productIds }),
  });
  return res.json();
}

async function fetchProducts(category?: string): Promise<{ data: { products: Product[] } }> {
  const params = new URLSearchParams({ limit: "100" });
  if (category) params.set("category", category);
  const res = await fetch(`/api/admin/products?${params}`);
  return res.json();
}

export default function EditArticlePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [category, setCategory] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [productSearchCategory, setProductSearchCategory] = useState("");

  const { data: articleData, isLoading } = useQuery({
    queryKey: ["admin-article", id],
    queryFn: () => fetchArticle(id),
  });

  const { data: productsData } = useQuery({
    queryKey: ["admin-products-for-article", productSearchCategory],
    queryFn: () => fetchProducts(productSearchCategory || undefined),
  });

  const article = articleData?.data?.article;
  const allProducts = productsData?.data?.products || [];
  const linkedProductIds = article?.products.map((p) => p.product.id) || [];

  useEffect(() => {
    if (article) {
      setTitle(article.title);
      setSummary(article.summary || "");
      setThumbnailUrl(article.thumbnailUrl || "");
      setCategory(article.category || "");
      setIsActive(article.isActive);
      setProductSearchCategory(article.category || "");
    }
  }, [article]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Article>) => updateArticle(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-article", id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteArticle(id),
    onSuccess: () => {
      router.push("/admin/articles");
    },
  });

  const addProductsMutation = useMutation({
    mutationFn: (productIds: string[]) => addProducts(id, productIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-article", id] });
    },
  });

  const removeProductsMutation = useMutation({
    mutationFn: (productIds: string[]) => removeProducts(id, productIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-article", id] });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      title: title.trim(),
      summary: summary.trim() || null,
      thumbnailUrl: thumbnailUrl.trim() || null,
      category: category || null,
      isActive,
    });
  };

  const handleDelete = () => {
    if (confirm("정말로 이 기사를 삭제하시겠습니까?")) {
      deleteMutation.mutate();
    }
  };

  const handleAddProduct = (productId: string) => {
    addProductsMutation.mutate([productId]);
  };

  const handleRemoveProduct = (productId: string) => {
    removeProductsMutation.mutate([productId]);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">기사를 찾을 수 없습니다.</p>
        <Button onClick={() => router.back()} className="mt-4">
          돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">기사 편집</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open(article.originalUrl, "_blank")}>
            원본 기사
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            삭제
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>기사 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">소스:</span>
              <Badge className="ml-2" variant={article.source === "NAVER" ? "default" : "secondary"}>
                {article.source === "NAVER" ? "네이버" : "구글"}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">조회수:</span>
              <span className="ml-2 font-medium">{article._count.views}</span>
            </div>
            <div>
              <span className="text-muted-foreground">공유수:</span>
              <span className="ml-2 font-medium">{article._count.shares}</span>
            </div>
            <div>
              <span className="text-muted-foreground">발행일:</span>
              <span className="ml-2">{format(new Date(article.publishedAt), "yyyy.MM.dd HH:mm")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>편집</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">제목</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">AI 요약</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">썸네일 URL</label>
            <Input value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} />
            {thumbnailUrl && (
              <img src={thumbnailUrl} alt="썸네일" className="mt-2 w-32 h-20 object-cover rounded" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">카테고리</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">선택 안함</option>
                {categories.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">상태</label>
              <select
                value={isActive ? "active" : "inactive"}
                onChange={(e) => setIsActive(e.target.value === "active")}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="active">활성</option>
                <option value="inactive">비활성</option>
              </select>
            </div>
          </div>

          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "저장 중..." : "변경사항 저장"}
          </Button>
          {updateMutation.isSuccess && (
            <span className="ml-2 text-sm text-green-600">저장되었습니다.</span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>연관 상품 ({article.products.length}개)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {article.products.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">현재 연결된 상품</h4>
              <div className="flex flex-wrap gap-2">
                {article.products.map(({ product }) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-2 p-2 border rounded bg-muted/50"
                  >
                    {product.thumbnailUrl && (
                      <img src={product.thumbnailUrl} alt="" className="w-8 h-8 object-cover rounded" />
                    )}
                    <span className="text-sm">{product.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveProduct(product.id)}
                      disabled={removeProductsMutation.isPending}
                    >
                      X
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium">상품 추가</h4>
            <select
              value={productSearchCategory}
              onChange={(e) => setProductSearchCategory(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm"
            >
              <option value="">전체 카테고리</option>
              {categories.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {cat.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {allProducts
                .filter((p) => !linkedProductIds.includes(p.id))
                .map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleAddProduct(product.id)}
                    disabled={addProductsMutation.isPending}
                    className="flex items-center gap-2 p-2 border rounded hover:bg-muted/50 text-left"
                  >
                    {product.thumbnailUrl && (
                      <img src={product.thumbnailUrl} alt="" className="w-8 h-8 object-cover rounded" />
                    )}
                    <span className="text-sm truncate">{product.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={() => router.back()}>
        목록으로
      </Button>
    </div>
  );
}
