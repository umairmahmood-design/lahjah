import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const RECIPIENTS = [
  "yasser.nazmy@hungerstation.com",
  "umair.mahmood@hungerstation.com",
];

// NOTE: The `from` address must be from a domain verified in your Resend account.
// During development you can use "onboarding@resend.dev" to test without a verified domain.
const FROM = "Lahjah <onboarding@resend.dev>";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { entityName, requesterName, requesterSlack, email, languages, reason } = body;

  if (!entityName || !requesterName || !requesterSlack || !email || !languages || !reason) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: FROM,
      to: RECIPIENTS,
      subject: `New Lahjah Adaptation Request - ${entityName}`,
      html: `
        <h2>New Lahjah Adaptation Request</h2>
        <table style="border-collapse:collapse;width:100%;max-width:600px;">
          <tr><td style="padding:8px 0;font-weight:600;width:180px;">Entity Name</td><td>${entityName}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600;">Requester Name</td><td>${requesterName}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600;">Requester Slack</td><td>${requesterSlack}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600;">Official DH Email</td><td>${email}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600;">Languages Required</td><td>${languages}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600;vertical-align:top;">Why Lahjah?</td><td style="white-space:pre-wrap;">${reason}</td></tr>
        </table>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[adapt] Resend error:", err);
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
