import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Disable caching to always return fresh data
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get active categories from database
    const dbCategories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    // Get product counts by category
    const categoryCounts = await prisma.product.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: { id: true },
    });

    const categories = dbCategories.map((cat) => {
      const countData = categoryCounts.find((c) => c.category === cat.key);
      return {
        id: cat.key,
        key: cat.key,
        name: cat.name,
        description: cat.description,
        productCount: countData?._count.id || 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Categories API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
