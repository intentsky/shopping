// apps/medusa/src/admin/routes/a/shopping-inquiries/inquiry-drawer.tsx
// Detail drawer for a single Intentsky Shopping inquiry.
//
// A Drawer (not a FocusModal) because this edits an entity that already
// exists. Read-only contact/request context on top, the two reply actions in
// the middle, and the internal status + notes form at the bottom.
//
// Replies use the free wa.me deep link and a mailto: link — no WhatsApp
// Business account and no third-party service is involved, and no customer PII
// ever leaves Medusa.
//
// Reference: ai/todo.md Phase 5

import { ChatBubbleLeftRight, Envelope } from "@medusajs/icons";
import {
	Button,
	Drawer,
	Select,
	StatusBadge,
	Text,
	Textarea,
	toast,
} from "@medusajs/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
	type AdminInquiry,
	type AdminInquiryUpdateResponse,
	formatDate,
	formatQuantity,
	INQUIRY_STATUSES,
	type InquiryStatus,
	mailtoLink,
	openExternal,
	productUrl,
	replySubject,
	replyTemplate,
	STATUS_BADGE,
	statusBadge,
	waLink,
} from "../../../lib/inquiry";
import { sdk } from "../../../lib/sdk";

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const Section = ({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) => (
	<div className="flex flex-col gap-y-3">
		<Text
			size="small"
			leading="compact"
			weight="plus"
			className="text-ui-fg-muted uppercase tracking-wider"
		>
			{title}
		</Text>
		{children}
	</div>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
	<div className="flex flex-col gap-y-1">
		<Text size="small" leading="compact" weight="plus">
			{label}
		</Text>
		{children}
	</div>
);

const Value = ({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) => (
	<Text
		size="small"
		leading="compact"
		className={`text-ui-fg-subtle ${className ?? ""}`}
	>
		{children}
	</Text>
);

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

type InquiryDrawerProps = {
	inquiry: AdminInquiry | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const InquiryDrawer = ({ inquiry, open, onOpenChange }: InquiryDrawerProps) => {
	const queryClient = useQueryClient();

	// Radix keeps the drawer mounted through its close animation. Remembering
	// the last selected inquiry keeps the panel filled while it slides away
	// instead of flashing empty.
	const lastInquiry = useRef<AdminInquiry | null>(null);
	if (inquiry) {
		lastInquiry.current = inquiry;
	}
	const shown = inquiry ?? lastInquiry.current;

	const [status, setStatus] = useState<InquiryStatus>(shown?.status ?? "new");
	const [notes, setNotes] = useState<string>(shown?.admin_notes ?? "");

	// Reset the internal form when a different inquiry is opened, and whenever
	// the drawer is (re)opened. Keyed on the id rather than the object, so a
	// background list refetch never discards in-progress edits.
	const shownId = shown?.id ?? null;
	useEffect(() => {
		setStatus(shown?.status ?? "new");
		setNotes(shown?.admin_notes ?? "");
	}, [shownId, open]);

	const updateInquiry = useMutation({
		mutationFn: async (payload: {
			id: string;
			status: InquiryStatus;
			admin_notes: string;
		}) => {
			const { id, ...body } = payload;
			return sdk.client.fetch<AdminInquiryUpdateResponse>(
				`/admin/shopping/inquiries/${id}`,
				{ method: "POST", body },
			);
		},
		onSuccess: () => {
			// Both the list and the status counts change on every save.
			queryClient.invalidateQueries({ queryKey: ["shopping-inquiries"] });
			queryClient.invalidateQueries({ queryKey: ["shopping-inquiry-stats"] });
			toast.success("Inquiry updated");
		},
		onError: (error: unknown) => {
			toast.error("Could not update inquiry", {
				description:
					error instanceof Error ? error.message : "Please try again.",
			});
		},
	});

	const badge = shown ? statusBadge(shown.status) : null;
	const message = shown ? replyTemplate(shown) : "";
	const whatsappHref =
		shown?.whatsapp && message ? waLink(shown.whatsapp, message) : null;
	const emailHref =
		shown?.customer_email && message
			? mailtoLink(shown.customer_email, replySubject(shown), message)
			: null;

	const handleSave = () => {
		if (!shown) {
			return;
		}
		updateInquiry.mutate({
			id: shown.id,
			status,
			admin_notes: notes,
		});
	};

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<Drawer.Content>
				<Drawer.Header>
					<div className="flex items-center gap-x-3">
						<Drawer.Title asChild>
							<Text size="base" weight="plus" family="mono" as="span">
								{shown?.ref ?? "Inquiry"}
							</Text>
						</Drawer.Title>
						{badge ? (
							<StatusBadge color={badge.color}>{badge.label}</StatusBadge>
						) : null}
					</div>
					<Drawer.Description className="sr-only">
						Inquiry details, reply actions and internal notes.
					</Drawer.Description>
				</Drawer.Header>

				<Drawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
					{shown ? (
						<>
							{/* ── Contact ────────────────────────────────────────────── */}
							<Section title="Contact">
								<div className="flex flex-col gap-y-3">
									<Field label="Name">
										<Value>{shown.customer_name}</Value>
									</Field>
									<Field label="Email">
										<Value>{shown.customer_email ?? "—"}</Value>
									</Field>
									<Field label="WhatsApp">
										<Value>{shown.whatsapp ?? "—"}</Value>
									</Field>
									<Field label="Preferred channel">
										<Value>{shown.contact_method}</Value>
									</Field>
									<Field label="Country">
										<Value>{shown.country ?? "—"}</Value>
									</Field>
									<Field label="Language">
										<Value>{shown.locale}</Value>
									</Field>
								</div>
							</Section>

							{/* ── Request ────────────────────────────────────────────── */}
							<Section title="Request">
								<div className="flex flex-col gap-y-3">
									<Field label="Product description">
										<Value className="whitespace-pre-wrap">
											{shown.product_desc}
										</Value>
									</Field>
									<Field label="Material">
										<Value>{shown.material ?? "—"}</Value>
									</Field>
									<Field label="Quantity">
										<Value>{formatQuantity(shown)}</Value>
									</Field>
									<Field label="Special requirements">
										<Value className="whitespace-pre-wrap">
											{shown.special ?? "—"}
										</Value>
									</Field>
									<Field label="From product page">
										{shown.product_slug ? (
											<a
												href={productUrl(shown.product_slug)}
												target="_blank"
												rel="noopener noreferrer"
												className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small w-fit"
											>
												{shown.product_slug}
											</a>
										) : (
											<Value>—</Value>
										)}
									</Field>
								</div>
							</Section>

							{/* ── Reply ──────────────────────────────────────────────── */}
							<Section title="Reply">
								<div className="flex flex-col gap-y-2">
									<Button
										size="small"
										variant="secondary"
										className="w-full"
										disabled={!whatsappHref}
										onClick={() => {
											if (whatsappHref) {
												openExternal(whatsappHref);
											}
										}}
									>
										<ChatBubbleLeftRight />
										Reply on WhatsApp
									</Button>
									<Button
										size="small"
										variant="secondary"
										className="w-full"
										disabled={!emailHref}
										onClick={() => {
											if (emailHref) {
												openExternal(emailHref);
											}
										}}
									>
										<Envelope />
										Reply by email
									</Button>
									<Text
										size="small"
										leading="compact"
										className="text-ui-fg-subtle"
									>
										Opens WhatsApp with a prefilled message. No WhatsApp
										Business account needed.
									</Text>
								</div>
							</Section>

							{/* ── Internal ───────────────────────────────────────────── */}
							<Section title="Internal">
								<div className="flex flex-col gap-y-3">
									<Field label="Status">
										<Select
											size="small"
											value={status}
											onValueChange={(value) =>
												setStatus(value as InquiryStatus)
											}
											disabled={updateInquiry.isPending}
										>
											<Select.Trigger>
												<Select.Value placeholder="Select a status" />
											</Select.Trigger>
											<Select.Content>
												{INQUIRY_STATUSES.map((value) => (
													<Select.Item key={value} value={value}>
														{STATUS_BADGE[value].label}
													</Select.Item>
												))}
											</Select.Content>
										</Select>
									</Field>

									<Field label="Internal notes">
										<Textarea
											rows={5}
											value={notes}
											placeholder="Only visible to you — quoted price, lead time, follow-up date…"
											disabled={updateInquiry.isPending}
											onChange={(event) => setNotes(event.target.value)}
										/>
									</Field>

									<div className="flex justify-end">
										<Button
											size="small"
											disabled={updateInquiry.isPending}
											isLoading={updateInquiry.isPending}
											onClick={handleSave}
										>
											Save
										</Button>
									</div>
								</div>
							</Section>

							{/* ── Meta ───────────────────────────────────────────────── */}
							<Text
								size="small"
								leading="compact"
								className="text-ui-fg-muted border-ui-border-base border-t pt-4"
							>
								Received {formatDate(shown.created_at)} · Updated{" "}
								{formatDate(shown.updated_at)}
							</Text>
						</>
					) : null}
				</Drawer.Body>
			</Drawer.Content>
		</Drawer>
	);
};

export default InquiryDrawer;
