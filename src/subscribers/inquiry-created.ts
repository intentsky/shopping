// apps/medusa/src/subscribers/inquiry-created.ts
// Subscriber for the "shopping.inquiry.created" event.
//
// Triggered immediately after a new inquiry is saved to the database.
//
// Actions:
//   1. Send confirmation email to the customer (via Resend)
//   2. Send notification email to the owner (via Resend)
//
// Email content:
//   Customer confirmation:
//     - Subject: "We received your inquiry [ref]"
//     - Body: thank you message in visitor's locale, full inquiry summary,
//             WhatsApp quick-connect link, expected response time
//
//   Owner notification:
//     - Subject: "New inquiry [ref] from [customer_name]"
//     - Body: full inquiry details, direct link to admin panel
//
// Graceful degradation:
//   - If RESEND_API_KEY is not set, logs a warning and skips email sending.
//   - Email send failures are logged but do NOT throw — the inquiry is already
//     saved and the customer already received a 201 response.
//
// Reference: ai/todo.md Phase 5 §5.3 / Phase 3 §3.7

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { adminInquiriesUrl, brandFor, tenant } from "../lib/tenant";
import {
	INQUIRY_CREATED_EVENT,
	type InquiryCreatedPayload,
} from "../modules/shopping-inquiry/events";

// ---------------------------------------------------------------------------
// Resend email client (lazy-initialised)
// ---------------------------------------------------------------------------

let resendClient: {
	emails: {
		send: (opts: ResendSendOptions) => Promise<{ error?: { message: string } }>;
	};
} | null = null;

interface ResendSendOptions {
	from: string;
	to: string | string[];
	subject: string;
	html: string;
	reply_to?: string;
}

function getResendClient() {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) return null;

	if (!resendClient) {
		// Dynamic import to avoid hard dependency when RESEND_API_KEY is absent
		try {
			// biome-ignore lint/security/noDangerouslySetInnerHtml: server-side only
			const { Resend } = require("resend") as {
				Resend: new (key: string) => typeof resendClient;
			};
			resendClient = new Resend(apiKey) as typeof resendClient;
		} catch {
			console.warn(
				"[inquiry-created] resend package not installed — email sending disabled",
			);
			return null;
		}
	}

	return resendClient;
}

// ---------------------------------------------------------------------------
// Translation strings for customer confirmation email
// (Static — no runtime i18n dependency on the server side)
//
// The copy is per-locale but brand-neutral in code: the tenant's name, support
// address and storefront host are injected from src/lib/tenant.ts, so a second
// store running Intentsky Shopping needs no new templates.
// ---------------------------------------------------------------------------

const CUSTOMER_EMAIL_TRANSLATIONS: Record<
	string,
	{
		subject: (ref: string) => string;
		greeting: (name: string) => string;
		body: string;
		detailsHeading: string;
		productLabel: string;
		quantityLabel: string;
		countryLabel: string;
		refLabel: string;
		whatsappCta: (number: string, ref: string) => string;
		closing: string;
	}
> = {
	en: {
		subject: (ref) => `We received your inquiry — ${ref} | ${tenant.brand}`,
		greeting: (name) => `Dear ${name},`,
		body: `Thank you for contacting ${tenant.brand}. We have received your inquiry and our team will review it promptly. You can expect a response within 1 business day.`,
		detailsHeading: "Your inquiry details:",
		productLabel: "Product / Description:",
		quantityLabel: "Quantity:",
		countryLabel: "Destination:",
		refLabel: "Reference number:",
		whatsappCta: (number, ref) =>
			`For a faster response, you can also reach us on WhatsApp: https://wa.me/${number}?text=${encodeURIComponent(`Hi, I submitted an inquiry on ${tenant.storefrontHost} (Ref: ${ref})`)}`,
		closing: `Best regards,\nThe ${tenant.brand} Team\n${tenant.ownerEmail}`,
	},
	de: {
		subject: (ref) => `Ihre Anfrage ist eingegangen — ${ref} | ${tenant.brand}`,
		greeting: (name) => `Sehr geehrte(r) ${name},`,
		body: `Vielen Dank für Ihre Kontaktaufnahme mit ${tenant.brand}. Wir haben Ihre Anfrage erhalten und unser Team wird diese umgehend bearbeiten. Sie können innerhalb von 1 Werktag mit einer Antwort rechnen.`,
		detailsHeading: "Ihre Anfragedaten:",
		productLabel: "Produkt / Beschreibung:",
		quantityLabel: "Menge:",
		countryLabel: "Lieferland:",
		refLabel: "Referenznummer:",
		whatsappCta: (number, ref) =>
			`Für eine schnellere Antwort erreichen Sie uns auch auf WhatsApp: https://wa.me/${number}?text=${encodeURIComponent(`Hallo, ich habe eine Anfrage auf ${tenant.storefrontHost} gestellt (Ref: ${ref})`)}`,
		closing: `Mit freundlichen Grüßen,\nDas ${tenant.brand} Team\n${tenant.ownerEmail}`,
	},
	es: {
		subject: (ref) => `Hemos recibido su consulta — ${ref} | ${tenant.brand}`,
		greeting: (name) => `Estimado/a ${name},`,
		body: `Gracias por ponerse en contacto con ${tenant.brand}. Hemos recibido su consulta y nuestro equipo la revisará de inmediato. Puede esperar una respuesta en un plazo de 1 día hábil.`,
		detailsHeading: "Detalles de su consulta:",
		productLabel: "Producto / Descripción:",
		quantityLabel: "Cantidad:",
		countryLabel: "Destino:",
		refLabel: "Número de referencia:",
		whatsappCta: (number, ref) =>
			`Para una respuesta más rápida, también puede contactarnos por WhatsApp: https://wa.me/${number}?text=${encodeURIComponent(`Hola, envié una consulta en ${tenant.storefrontHost} (Ref: ${ref})`)}`,
		closing: `Atentamente,\nEl equipo de ${tenant.brand}\n${tenant.ownerEmail}`,
	},
	it: {
		subject: (ref) =>
			`Abbiamo ricevuto la sua richiesta — ${ref} | ${tenant.brand}`,
		greeting: (name) => `Gentile ${name},`,
		body: `Grazie per aver contattato ${tenant.brand}. Abbiamo ricevuto la sua richiesta e il nostro team la esaminerà tempestivamente. Può aspettarsi una risposta entro 1 giorno lavorativo.`,
		detailsHeading: "Dettagli della sua richiesta:",
		productLabel: "Prodotto / Descrizione:",
		quantityLabel: "Quantità:",
		countryLabel: "Destinazione:",
		refLabel: "Numero di riferimento:",
		whatsappCta: (number, ref) =>
			`Per una risposta più rapida, può contattarci anche su WhatsApp: https://wa.me/${number}?text=${encodeURIComponent(`Ciao, ho inviato una richiesta su ${tenant.storefrontHost} (Rif: ${ref})`)}`,
		closing: `Cordiali saluti,\nIl team di ${tenant.brand}\n${tenant.ownerEmail}`,
	},
	zh: {
		subject: (ref) => `我们已收到您的询盘 — ${ref} | ${brandFor("zh")}`,
		greeting: (name) => `尊敬的 ${name}，`,
		body: `感谢您联系${brandFor("zh")}（${tenant.brand}）。我们已收到您的询盘，团队将尽快处理。请您在1个工作日内等待我们的回复。`,
		detailsHeading: "您的询盘详情：",
		productLabel: "产品/描述：",
		quantityLabel: "数量：",
		countryLabel: "目的地：",
		refLabel: "询盘编号：",
		whatsappCta: (number, ref) =>
			`如需更快回复，您也可以通过WhatsApp联系我们：https://wa.me/${number}?text=${encodeURIComponent(`您好，我在${tenant.storefrontHost}提交了询盘（编号：${ref}）`)}`,
		closing: `此致\n${brandFor("zh")}团队\n${tenant.ownerEmail}`,
	},
};

const DEFAULT_LOCALE_STRINGS = CUSTOMER_EMAIL_TRANSLATIONS.en!;

// ---------------------------------------------------------------------------
// HTML email builders
// ---------------------------------------------------------------------------

function nl2br(text: string): string {
	return text.replace(/\n/g, "<br>");
}

function buildCustomerEmailHtml(
	payload: InquiryCreatedPayload,
	whatsappNumber: string,
): string {
	const strings =
		CUSTOMER_EMAIL_TRANSLATIONS[payload.locale] ?? DEFAULT_LOCALE_STRINGS;

	const quantityStr = payload.quantity
		? `${payload.quantity} ${payload.quantity_unit}`
		: "—";

	const countryStr = payload.country ?? "—";

	return `<!DOCTYPE html>
<html lang="${payload.locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${strings.subject(payload.ref)}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:16px 16px 0 0;padding:32px 40px;border-bottom:1px solid #334155;">
              <p style="margin:0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#6366f1;">${brandFor(payload.locale)}</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#f8fafc;">
                ${strings.subject(payload.ref)}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#1e293b;padding:32px 40px;">
              <p style="margin:0 0 16px;line-height:1.6;">${strings.greeting(payload.customer_name)}</p>
              <p style="margin:0 0 24px;line-height:1.6;color:#cbd5e1;">${strings.body}</p>

              <!-- Details box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;border:1px solid #334155;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6366f1;">${strings.detailsHeading}</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#94a3b8;width:40%;vertical-align:top;">${strings.productLabel}</td>
                        <td style="padding:6px 0;font-size:13px;color:#e2e8f0;font-weight:500;">${payload.product_desc.substring(0, 300)}${payload.product_desc.length > 300 ? "…" : ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#94a3b8;">${strings.quantityLabel}</td>
                        <td style="padding:6px 0;font-size:13px;color:#e2e8f0;font-weight:500;">${quantityStr}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#94a3b8;">${strings.countryLabel}</td>
                        <td style="padding:6px 0;font-size:13px;color:#e2e8f0;font-weight:500;">${countryStr}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#94a3b8;">${strings.refLabel}</td>
                        <td style="padding:6px 0;font-size:13px;color:#6366f1;font-weight:700;font-family:monospace;">${payload.ref}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- WhatsApp CTA -->
              <p style="margin:0 0 24px;font-size:13px;line-height:1.7;color:#94a3b8;">
                ${nl2br(strings.whatsappCta(whatsappNumber, payload.ref))}
              </p>

              <p style="margin:0;font-size:14px;line-height:1.8;color:#cbd5e1;">${nl2br(strings.closing)}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;border-radius:0 0 16px 16px;padding:20px 40px;border-top:1px solid #334155;text-align:center;">
              <p style="margin:0;font-size:12px;color:#475569;">
                ${tenant.brand} &mdash; ${tenant.legalName}<br>
                ${tenant.postalAddress}<br>
                <a href="${tenant.storefrontUrl}" style="color:#6366f1;text-decoration:none;">${tenant.storefrontHost}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOwnerEmailHtml(payload: InquiryCreatedPayload): string {
	const inquiriesUrl = adminInquiriesUrl();

	const rows = [
		[
			"Ref",
			`<strong style="color:#6366f1;font-family:monospace;">${payload.ref}</strong>`,
		],
		["Name", payload.customer_name],
		["Email", payload.customer_email ?? "—"],
		["WhatsApp", payload.whatsapp ?? "—"],
		["Contact method", payload.contact_method],
		["Product / Description", payload.product_desc.replace(/\n/g, "<br>")],
		[
			"Quantity",
			payload.quantity ? `${payload.quantity} ${payload.quantity_unit}` : "—",
		],
		["Destination country", payload.country ?? "—"],
		["Locale", payload.locale],
		["Product page", payload.product_slug ?? "—"],
	];

	const rowsHtml = rows
		.map(
			([label, value]) => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#94a3b8;width:40%;vertical-align:top;">${label}:</td>
        <td style="padding:8px 0;font-size:13px;color:#e2e8f0;font-weight:500;">${value}</td>
      </tr>`,
		)
		.join("");

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>New inquiry ${payload.ref}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:16px 16px 0 0;padding:32px 40px;border-bottom:1px solid #334155;">
              <p style="margin:0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#f59e0b;">🔔 New Inquiry</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#f8fafc;">
                ${payload.ref} — ${payload.customer_name}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#1e293b;padding:32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;border:1px solid #334155;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${rowsHtml}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Admin CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#6366f1;border-radius:8px;padding:12px 24px;">
                    <a href="${inquiriesUrl}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px;">
                      View in Admin Panel →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;border-radius:0 0 16px 16px;padding:20px 40px;border-top:1px solid #334155;text-align:center;">
              <p style="margin:0;font-size:12px;color:#475569;">
                This is an automated notification from Intentsky Shopping (${tenant.brand}).
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Subscriber handler
// ---------------------------------------------------------------------------

export default async function inquiryCreatedHandler({
	event,
	container,
}: SubscriberArgs<InquiryCreatedPayload>): Promise<void> {
	const payload = event.data;

	const resend = getResendClient();
	if (!resend) {
		console.warn(
			`[inquiry-created] RESEND_API_KEY not set — skipping email notifications for inquiry ${payload.ref}`,
		);
		return;
	}

	const fromAddress = tenant.fromEmail;
	const ownerEmail = tenant.ownerEmail;
	const whatsappNumber = (
		process.env.OWNER_WHATSAPP ?? "8613912345678"
	).replace(/[^0-9]/g, "");

	const strings =
		CUSTOMER_EMAIL_TRANSLATIONS[payload.locale] ?? DEFAULT_LOCALE_STRINGS;

	// ── 1. Customer confirmation email ───────────────────────────────────────
	if (payload.customer_email) {
		try {
			const { error } = await resend.emails.send({
				from: `${brandFor(payload.locale)} <${fromAddress}>`,
				to: payload.customer_email,
				subject: strings.subject(payload.ref),
				html: buildCustomerEmailHtml(payload, whatsappNumber),
				reply_to: ownerEmail,
			});

			if (error) {
				console.error(
					`[inquiry-created] Customer email failed for ${payload.ref}:`,
					error.message,
				);
			} else {
				console.info(
					`[inquiry-created] Customer confirmation sent to ${payload.customer_email} for ${payload.ref}`,
				);
			}
		} catch (err) {
			console.error(
				`[inquiry-created] Customer email threw for ${payload.ref}:`,
				err,
			);
		}
	}

	// ── 2. Owner notification email ──────────────────────────────────────────
	try {
		const ownerSubject = `[${tenant.brandShort} Inquiry] ${payload.ref} — ${payload.customer_name} (${payload.locale.toUpperCase()})`;

		const { error } = await resend.emails.send({
			from: `${tenant.brandShort} Inquiry System <${fromAddress}>`,
			to: ownerEmail,
			subject: ownerSubject,
			html: buildOwnerEmailHtml(payload),
			reply_to: payload.customer_email ?? undefined,
		});

		if (error) {
			console.error(
				`[inquiry-created] Owner email failed for ${payload.ref}:`,
				error.message,
			);
		} else {
			console.info(
				`[inquiry-created] Owner notification sent to ${ownerEmail} for ${payload.ref}`,
			);
		}
	} catch (err) {
		console.error(
			`[inquiry-created] Owner email threw for ${payload.ref}:`,
			err,
		);
	}
}

// ---------------------------------------------------------------------------
// Subscriber config — registers this handler for the inquiry.created event
// ---------------------------------------------------------------------------

export const config: SubscriberConfig = {
	event: INQUIRY_CREATED_EVENT,
};
