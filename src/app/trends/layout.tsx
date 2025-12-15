import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "검색어 트렌드 랭킹 | PickRanky",
  description:
    "현재 인기 있는 검색어와 관련 상품을 확인하세요. Naver, Google, 다음의 실시간 트렌드 데이터를 기반으로 한 검색어 랭킹입니다.",
  openGraph: {
    title: "검색어 트렌드 랭킹 | PickRanky",
    description:
      "현재 인기 있는 검색어와 관련 상품을 확인하세요. 실시간 트렌드 데이터를 기반으로 한 검색어 랭킹입니다.",
    type: "website",
  },
};

export default function TrendsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
