import { createFileRoute } from "@tanstack/react-router";
import { EditorScreen } from "../ui/editor-screen.js";

export const Route = createFileRoute("/")({ component: EditorScreen });
