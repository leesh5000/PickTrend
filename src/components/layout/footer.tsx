export function Footer() {
  return (
    <footer className="border-t py-8">
      <div className="max-w-6xl mx-auto px-4 text-center text-muted-foreground text-sm">
        <p>© {new Date().getFullYear()} PickRanky. All rights reserved.</p>
        <p className="mt-2">유튜브 리뷰 기반 실시간 쇼핑 상품 트렌드 순위</p>
      </div>
    </footer>
  );
}
