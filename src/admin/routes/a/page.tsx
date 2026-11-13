// apps/medusa/src/admin/routes/a/page.tsx
// Parent "Shopping" section in the admin sidebar.
//
// Exists purely so /app/a/shopping-inquiries nests under a labelled section
// rather than sitting at the sidebar root. Visiting /app/a itself redirects to
// the inquiries list.
//
// Note: the dashboard router is mounted with basename "/app", so `to` is
// router-relative ("/a/shopping-inquiries"); the browser URL is
// /app/a/shopping-inquiries.
//
// Reference: ai/todo.md Phase 5

import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ChatBubbleLeftRight } from "@medusajs/icons";
import { Navigate } from "react-router-dom";

const ShoppingSectionPage = () => {
	return <Navigate to="/a/shopping-inquiries" replace />;
};

export const config = defineRouteConfig({
	label: "Shopping",
	icon: ChatBubbleLeftRight,
});

export default ShoppingSectionPage;
