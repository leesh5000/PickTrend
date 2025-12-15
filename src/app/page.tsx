import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ProductGrid } from "@/components/products/product-grid";
import { VideoGrid } from "@/components/videos/video-grid";

const TREND_SERVICES = [
  {
    name: "상품 트렌드",
    description: "유튜브 리뷰 기반 실시간 쇼핑 상품 순위",
    icon: "🛒",
    href: "/rankings",
    active: true,
  },
  {
    name: "검색어 트렌드",
    description: "지금 가장 많이 검색되는 키워드",
    icon: "🔍",
    href: "#",
    active: false,
  },
  {
    name: "기사 트렌드",
    description: "화제의 뉴스와 핫한 기사",
    icon: "📰",
    href: "#",
    active: false,
  },
  {
    name: "커뮤니티 트렌드",
    description: "인기 커뮤니티 글과 화제의 게시물",
    icon: "💬",
    href: "#",
    active: false,
  },
];

const PRODUCT_CATEGORIES = [
  { name: "전자기기/IT", slug: "electronics", icon: "💻" },
  { name: "뷰티/화장품", slug: "beauty", icon: "💄" },
  { name: "가전제품", slug: "appliances", icon: "🏠" },
  { name: "음식", slug: "food", icon: "🍽️" },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 px-4">
          <div className="max-w-6xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="text-primary">Pick</span>Ranky
            </h1>
            <p className="text-xl text-muted-foreground mb-4 max-w-2xl mx-auto">
              모든 트렌드를 한눈에
            </p>
            <p className="text-muted-foreground max-w-xl mx-auto">
              상품, 검색어, 기사, 커뮤니티까지
              <br />
              지금 가장 핫한 트렌드를 확인하세요
            </p>
          </div>
        </section>

        {/* 지금 뜨는 인기 상품 */}
        <section className="py-8 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">🔥 지금 뜨는 인기 상품</h2>
              <Link
                href="/rankings"
                className="text-sm text-muted-foreground hover:text-primary transition"
              >
                전체보기 →
              </Link>
            </div>
            <ProductGrid
              apiUrl="/api/products/popular?limit=20"
              queryKey="popularProducts"
              itemsPerPage={5}
              rotationInterval={5000}
            />
            <p className="text-[11px] text-blue-500 mt-4 leading-relaxed">
              이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
            </p>
          </div>
        </section>

        {/* 신규 상품 */}
        <section className="py-8 px-4 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">✨ 신규 상품</h2>
              <Link
                href="/rankings"
                className="text-sm text-muted-foreground hover:text-primary transition"
              >
                전체보기 →
              </Link>
            </div>
            <ProductGrid
              apiUrl="/api/products/new?limit=20"
              queryKey="newProducts"
              itemsPerPage={5}
              rotationInterval={7000}
            />
            <p className="text-[11px] text-blue-500 mt-4 leading-relaxed">
              이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
            </p>
          </div>
        </section>

        {/* 지금 뜨는 영상 */}
        <section className="py-8 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">🎬 지금 뜨는 영상</h2>
              <Link
                href="/rankings"
                className="text-sm text-muted-foreground hover:text-primary transition"
              >
                전체보기 →
              </Link>
            </div>
            <VideoGrid
              apiUrl="/api/videos/popular?limit=20"
              queryKey="popularVideos"
              itemsPerPage={5}
              rotationInterval={6000}
            />
          </div>
        </section>

        {/* Trend Services Section */}
        <section className="py-16 px-4 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">트렌드 서비스</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {TREND_SERVICES.map((service) => (
                <div key={service.name} className="relative">
                  {service.active ? (
                    <Link
                      href={service.href}
                      className="block bg-card p-8 rounded-xl border hover:shadow-lg hover:border-primary/50 transition group"
                    >
                      <div className="text-5xl mb-4">{service.icon}</div>
                      <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition">
                        {service.name}
                      </h3>
                      <p className="text-muted-foreground">{service.description}</p>
                      <div className="mt-4 text-sm text-primary font-medium">
                        바로가기 →
                      </div>
                    </Link>
                  ) : (
                    <div className="bg-card/50 p-8 rounded-xl border border-dashed cursor-not-allowed">
                      <div className="text-5xl mb-4 opacity-50">{service.icon}</div>
                      <h3 className="text-xl font-bold mb-2 text-muted-foreground">
                        {service.name}
                      </h3>
                      <p className="text-muted-foreground/70">{service.description}</p>
                      <div className="mt-4">
                        <span className="inline-block text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                          Coming Soon
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Product Categories Section */}
        <section className="py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-2 text-center">상품 트렌드 카테고리</h2>
            <p className="text-muted-foreground text-center mb-8">
              관심 있는 카테고리의 인기 상품을 확인해보세요
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {PRODUCT_CATEGORIES.map((category) => (
                <Link
                  key={category.slug}
                  href={`/categories/${category.slug}`}
                  className="bg-card p-6 rounded-lg text-center hover:shadow-md hover:border-primary/50 transition border"
                >
                  <div className="text-4xl mb-2">{category.icon}</div>
                  <div className="font-medium">{category.name}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="py-16 px-4 bg-muted/30">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">실시간 트렌드 분석</h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              PickRanky는 다양한 소스에서 데이터를 수집하여
              <br />
              실시간으로 트렌드를 분석하고 순위를 제공합니다
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="p-6 rounded-lg border bg-card">
                <div className="text-3xl font-bold text-primary mb-2">실시간</div>
                <div className="text-muted-foreground">트렌드 업데이트</div>
              </div>
              <div className="p-6 rounded-lg border bg-card">
                <div className="text-3xl font-bold text-primary mb-2">4가지</div>
                <div className="text-muted-foreground">트렌드 서비스</div>
              </div>
              <div className="p-6 rounded-lg border bg-card">
                <div className="text-3xl font-bold text-primary mb-2">다양한</div>
                <div className="text-muted-foreground">데이터 소스</div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
