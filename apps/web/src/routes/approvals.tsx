import { createFileRoute } from "@tanstack/react-router";
import { ApprovalScreen } from "../ui/approval-screen.js";

export const Route = createFileRoute("/approvals")({ component: ApprovalScreen });
