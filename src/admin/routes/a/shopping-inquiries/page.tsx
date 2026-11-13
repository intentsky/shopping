// apps/medusa/src/admin/routes/a/shopping-inquiries/page.tsx
// Admin list view for Intentsky Shopping inquiries (RFQs) —
// /app/a/shopping-inquiries.
//
// This is the page the "New inquiry" notification email links to, so the route
// path is fixed (see subscribers/inquiry-created.ts).
//
// Status filter row + debounced search feed GET /admin/shopping/inquiries; the
// per-status counts come from GET /admin/shopping/inquiries/stats. Clicking a row
// opens the detail drawer; the reply icon buttons act without opening it.
//
// A plain <Table> is used rather than <DataTable> — the page owns its own
// filter row and search input, and the simple table keeps both wired to the
// same query key.
//
// Reference: ai/todo.md Phase 5

import { defineRouteConfig } from "@medusajs/admin-sdk";
import {
	ChatBubbleLeftRight,
	Envelope,
	MagnifyingGlass,
	Spinner,
} from "@medusajs/icons";
import {
	Button,
	Container,
	Heading,
	IconButton,
	Input,
	StatusBadge,
	Table,
	Text,
	Tooltip,
} from "@medusajs/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
	type AdminInquiry,
	type AdminInquiryListResponse,
	type AdminInquiryStatsResponse,
	formatDate,
	formatQuantity,
	INQUIRY_STATUSES,
	mailtoLink,
	openExternal,
	parseStatusFilter,
	replySubject,
	replyTemplate,
	STATUS_BADGE,
	type StatusFilter,
	statusBadge,
	truncate,
	waLink,
} from "../../../lib/inquiry";
import { sdk } from "../../../lib/sdk";
import { tenant } from "../../../lib/tenant";
import InquiryDrawer from "./inquiry-drawer";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const DESC_MAX_CHARS = 80;

// ---------------------------------------------------------------------------
// Row actions — reply without leaving the list
// ---------------------------------------------------------------------------

const RowActions = ({ inquiry }: { inquiry: AdminInquiry }) => {
	const message = replyTemplate(inquiry);
	const whatsappHref = inquiry.whatsapp
		? waLink(inquiry.whatsapp, message)
		: null;
	const emailHref = inquiry.customer_email
		? mailtoLink(inquiry.customer_email, replySubject(inquiry), message)
		: null;

	return (
		<div className="flex items-center justify-end gap-x-1">
			{whatsappHref ? (
				<Tooltip content="Reply on WhatsApp">
					<IconButton
						size="small"
						variant="transparent"
						onClick={(event) => {
							event.stopPropagation();
							openExternal(whatsappHref);
						}}
					>
						<ChatBubbleLeftRight />
					</IconButton>
				</Tooltip>
			) : null}
			{emailHref ? (
				<Tooltip content="Reply by email">
					<IconButton
						size="small"
						variant="transparent"
						onClick={(event) => {
							event.stopPropagation();
							openExternal(emailHref);
						}}
					>
						<Envelope />
					</IconButton>
				</Tooltip>
			) : null}
		</div>
	);
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ShoppingInquiriesPage = () => {
	// `?q=` makes a filtered view linkable. The Intentsky shopping console
	// deep-links here by inquiry ref (getShoppingRecordUrl) precisely so the
	// customer's contact details never have to leave Medusa.
	const [searchParams, setSearchParams] = useSearchParams();
	const initialQuery = searchParams.get("q") ?? "";

	// The status filter is read from the URL rather than mirrored in state, so
	// the landing-page widget can link straight into the "new" pile and the
	// sidebar entry (which drops the param) always resets the view.
	const statusFilter = parseStatusFilter(searchParams.get("status"));

	const [search, setSearch] = useState(initialQuery);
	const [debouncedSearch, setDebouncedSearch] = useState(initialQuery);
	const [pageIndex, setPageIndex] = useState(0);
	const [selected, setSelected] = useState<AdminInquiry | null>(null);

	// Debounce the search box so typing does not fire a request per keystroke,
	// and mirror the settled value into the URL so the view stays shareable.
	useEffect(() => {
		const timeout = setTimeout(() => {
			const next = search.trim();
			setDebouncedSearch(next);
			setPageIndex(0);
			setSearchParams(
				(current) => {
					const params = new URLSearchParams(current);
					if (next) {
						params.set("q", next);
					} else {
						params.delete("q");
					}
					return params;
				},
				{ replace: true },
			);
		}, SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timeout);
	}, [search, setSearchParams]);

	const offset = pageIndex * PAGE_SIZE;

	// Status counts — loads on mount, drives the filter row labels.
	const { data: stats } = useQuery({
		queryFn: () =>
			sdk.client.fetch<AdminInquiryStatsResponse>(
				"/admin/shopping/inquiries/stats",
			),
		queryKey: ["shopping-inquiry-stats"],
	});

	// The list itself — loads on mount, refetches on filter/search/page change.
	const { data, isLoading } = useQuery({
		queryFn: () =>
			sdk.client.fetch<AdminInquiryListResponse>("/admin/shopping/inquiries", {
				query: {
					limit: PAGE_SIZE,
					offset,
					...(statusFilter === "all" ? {} : { status: statusFilter }),
					...(debouncedSearch ? { q: debouncedSearch } : {}),
				},
			}),
		queryKey: ["shopping-inquiries", statusFilter, debouncedSearch, offset],
		placeholderData: keepPreviousData,
	});

	const inquiries = data?.inquiries ?? [];
	const total = data?.total ?? 0;
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

	// Prefer the freshest copy from the list so the drawer reflects saved
	// changes, falling back to the snapshot taken when the row was clicked.
	const selectedInquiry = selected
		? (inquiries.find((inquiry) => inquiry.id === selected.id) ?? selected)
		: null;

	const applyStatusFilter = (value: StatusFilter) => {
		setPageIndex(0);
		setSearchParams(
			(current) => {
				const params = new URLSearchParams(current);
				if (value === "all") {
					params.delete("status");
				} else {
					params.set("status", value);
				}
				return params;
			},
			{ replace: true },
		);
	};

	return (
		<Container className="divide-y p-0">
			{/* ── Header ──────────────────────────────────────────────────────── */}
			<div className="flex flex-col gap-y-1 px-6 py-4">
				<Heading level="h2">Inquiries</Heading>
				<Text size="small" leading="compact" className="text-ui-fg-subtle">
					Pre-sale requests submitted from {tenant.storefrontHost}. Reply on
					WhatsApp or by email, then record the outcome.
				</Text>
			</div>

			{/* ── Filters ─────────────────────────────────────────────────────── */}
			<div className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-wrap items-center gap-1">
					<Button
						size="small"
						variant={statusFilter === "all" ? "secondary" : "transparent"}
						onClick={() => applyStatusFilter("all")}
					>
						All · {stats?.active_total ?? 0}
					</Button>
					{INQUIRY_STATUSES.map((value) => (
						<Button
							key={value}
							size="small"
							variant={statusFilter === value ? "secondary" : "transparent"}
							onClick={() => applyStatusFilter(value)}
						>
							{STATUS_BADGE[value].label} · {stats?.counts[value] ?? 0}
						</Button>
					))}
				</div>

				<div className="relative w-full md:w-72">
					<MagnifyingGlass className="text-ui-fg-muted -translate-y-1/2 pointer-events-none absolute top-1/2 left-2" />
					<Input
						size="small"
						className="pl-8"
						placeholder="Search ref, name, email, request…"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
				</div>
			</div>

			{/* ── Table ───────────────────────────────────────────────────────── */}
			{isLoading ? (
				<div className="flex items-center justify-center px-6 py-16">
					<Spinner className="animate-spin" />
				</div>
			) : inquiries.length === 0 ? (
				<div className="flex items-center justify-center px-6 py-16">
					<Text size="small" leading="compact" className="text-ui-fg-subtle">
						No inquiries match these filters.
					</Text>
				</div>
			) : (
				<div>
					<Table>
						<Table.Header>
							<Table.Row>
								<Table.HeaderCell>Ref</Table.HeaderCell>
								<Table.HeaderCell>Customer</Table.HeaderCell>
								<Table.HeaderCell>Request</Table.HeaderCell>
								<Table.HeaderCell>Qty</Table.HeaderCell>
								<Table.HeaderCell>Country</Table.HeaderCell>
								<Table.HeaderCell>Status</Table.HeaderCell>
								<Table.HeaderCell>Received</Table.HeaderCell>
								<Table.HeaderCell className="text-right">
									Actions
								</Table.HeaderCell>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{inquiries.map((inquiry) => {
								const badge = statusBadge(inquiry.status);

								return (
									<Table.Row
										key={inquiry.id}
										className="cursor-pointer"
										onClick={() => setSelected(inquiry)}
									>
										<Table.Cell>
											<Text
												size="small"
												leading="compact"
												family="mono"
												className="whitespace-nowrap"
											>
												{inquiry.ref}
											</Text>
										</Table.Cell>

										<Table.Cell>
											<div className="flex flex-col">
												<Text size="small" leading="compact" weight="plus">
													{inquiry.customer_name}
												</Text>
												<Text
													size="small"
													leading="compact"
													className="text-ui-fg-subtle"
												>
													{inquiry.customer_email ?? inquiry.whatsapp ?? "—"}
												</Text>
											</div>
										</Table.Cell>

										<Table.Cell>
											<Text
												size="small"
												leading="compact"
												className="text-ui-fg-subtle"
											>
												{truncate(inquiry.product_desc, DESC_MAX_CHARS)}
											</Text>
										</Table.Cell>

										<Table.Cell>
											<Text
												size="small"
												leading="compact"
												className="whitespace-nowrap"
											>
												{formatQuantity(inquiry)}
											</Text>
										</Table.Cell>

										<Table.Cell>
											<Text size="small" leading="compact">
												{inquiry.country ?? "—"}
											</Text>
										</Table.Cell>

										<Table.Cell>
											<StatusBadge color={badge.color}>
												{badge.label}
											</StatusBadge>
										</Table.Cell>

										<Table.Cell>
											<Text
												size="small"
												leading="compact"
												className="text-ui-fg-subtle whitespace-nowrap"
											>
												{formatDate(inquiry.created_at)}
											</Text>
										</Table.Cell>

										<Table.Cell>
											<RowActions inquiry={inquiry} />
										</Table.Cell>
									</Table.Row>
								);
							})}
						</Table.Body>
					</Table>

					<Table.Pagination
						count={total}
						pageSize={PAGE_SIZE}
						pageIndex={pageIndex}
						pageCount={pageCount}
						canPreviousPage={pageIndex > 0}
						canNextPage={pageIndex < pageCount - 1}
						previousPage={() =>
							setPageIndex((current) => Math.max(0, current - 1))
						}
						nextPage={() =>
							setPageIndex((current) => Math.min(pageCount - 1, current + 1))
						}
					/>
				</div>
			)}

			<InquiryDrawer
				inquiry={selectedInquiry}
				open={selected !== null}
				onOpenChange={(open) => {
					if (!open) {
						setSelected(null);
					}
				}}
			/>
		</Container>
	);
};

export const config = defineRouteConfig({
	label: "Inquiries",
});

export default ShoppingInquiriesPage;
