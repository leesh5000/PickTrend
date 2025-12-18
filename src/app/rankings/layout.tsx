import { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pickranky.com";

export const metadata: Metadata = {
  title: "상품 랭킹",
  description:
    "유튜브 리뷰 기반 실시간 쇼핑 상품 트렌드 순위. 전자기기, 뷰티, 가전제품, 음식 카테고리별 인기 상품 랭킹을 확인하세요.",
  openGraph: {
    title: "상품 랭킹 | PickRanky",
    description:
      "유튜브 리뷰 기반 실시간 쇼핑 상품 트렌드 순위. 지금 가장 핫한 상품을 확인하세요.",
    url: `${SITE_URL}/rankings`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "상품 랭킹 | PickRanky",
    description:
      "유튜브 리뷰 기반 실시간 쇼핑 상품 트렌드 순위. 지금 가장 핫한 상품을 확인하세요.",
  },
  alternates: {
    canonical: `${SITE_URL}/rankings`,
  },
};

export default function RankingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // JSON-LD for ItemList
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "상품 랭킹",
    description: "유튜브 리뷰 기반 실시간 쇼핑 상품 트렌드 순위",
    url: `${SITE_URL}/rankings`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
