// apps/medusa/src/admin/widgets/shopping-new-inquiries.tsx
// "New inquiries" callout on the admin landing page.
//
// The dashboard exposes no home-page injection zone, but /app redirects to the
// order list — so "order.list.before" is the first thing the owner sees after
// signing in, which is exactly where an unanswered RFQ needs to surface.
//
// Reads GET /admin/shopping/inquiries/stats (the endpoint written for this widget)
// and links straight into the pre-filtered list. It shares the query key with
// the list page, so saving a status in the drawer updates both.
//
// Renders nothing on a store with no inquiries at all, or when the request
// fails — the order list must never carry a broken panel for an unrelated
// feature.
//
// Reference: ai/todo.md Phase 5

import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { ArrowLongRight, BellAlert } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
	type AdminInquiryStatsResponse,
	inquiriesPath,
	STATUS_BADGE,
} from "../lib/inquiry";
import { sdk } from "../lib/sdk";

// Inquiries arrive by email too; a slow poll is enough to keep the badge honest
// for an owner who leaves the dashboard open.
const REFETCH_INTERVAL_MS = 60_000;

const ShoppingNewInquiriesWidget = () => {
	const { data, isError } = useQuery({
		queryFn: () =>
			sdk.client.fetch<AdminInquiryStatsResponse>(
				"/admin/shopping/inquiries/stats",
			),
		queryKey: ["shopping-inquiry-stats"],
		refetchInterval: REFETCH_INTERVAL_MS,
	});

	// Stay invisible until there is something worth saying.
	if (isError || !data || data.active_total === 0) {
		return null;
	}

	const newCount = data.counts.new;
	const openCount = newCount + data.counts.reviewed + data.counts.quoted;
	const waiting = newCount > 0;

	return (
		<Container className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div className="flex items-start gap-x-3">
				<div className="bg-ui-bg-base shadow-borders-base flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
					<BellAlert className="text-ui-fg-subtle" />
				</div>

				<div className="flex flex-col gap-y-1">
					<div className="flex items-center gap-x-2">
						<Heading level="h2">Quote requests</Heading>
						{waiting ? (
							<Badge size="2xsmall" color={STATUS_BADGE.new.color}>
								{newCount} new
							</Badge>
						) : null}
					</div>

					<Text size="small" leading="compact" className="text-ui-fg-subtle">
						{waiting
							? `${newCount === 1 ? "A request is" : `${newCount} requests are`} waiting for a first reply.`
							: `No new requests — ${openCount} still open.`}
					</Text>
				</div>
			</div>

			<Button size="small" variant="secondary" asChild>
				<Link to={waiting ? inquiriesPath("new") : inquiriesPath()}>
					{waiting ? "Review" : "Open list"}
					<ArrowLongRight />
				</Link>
			</Button>
		</Container>
	);
};

export const config = defineWidgetConfig({
	zone: "order.list.before",
});

export default ShoppingNewInquiriesWidget;
