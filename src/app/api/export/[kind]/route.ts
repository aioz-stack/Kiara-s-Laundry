import { NextResponse, type NextRequest } from "next/server";
import { dateRangeSchema } from "@/lib/validation";
import { getActor } from "@/server/auth";
import { ForbiddenError } from "@/server/errors";
import { buildExport, EXPORT_KINDS, type ExportKind } from "@/server/exports";

export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { kind } = await context.params;
  if (!EXPORT_KINDS.includes(kind as ExportKind)) {
    return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  }

  const range = dateRangeSchema.safeParse({
    from: request.nextUrl.searchParams.get("from"),
    to: request.nextUrl.searchParams.get("to"),
  });
  if (!range.success) {
    return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  }

  try {
    const { filename, csv } = await buildExport(actor, kind as ExportKind, range.data);
    // The BOM makes Excel read UTF-8 names correctly.
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
