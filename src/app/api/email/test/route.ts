import { NextResponse } from "next/server";
import { sendLeadEmail } from "@/lib/email";

export async function GET() {
  try {
    await sendLeadEmail(
      {
        id: "test",
        name: "Lucas (test)",
        branch: "tømrer",
        city: "Ikast",
        email: "shadowporo123@gmail.com",
        websiteStatus: "old",
        websiteQualityTier: "old",
      },
      "cold"
    );
    return NextResponse.json({ ok: true, message: "Testmail sendt til shadowporo123@gmail.com" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
