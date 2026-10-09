import { Outlet } from "react-router";

import type { Route } from "./+types/dinners";

import { metaText } from "~/features/site-content/site-text";

export const meta: Route.MetaFunction = ({ matches }) => [
  { title: metaText(matches, "dinners.metaTitle") },
];

export default function DinnersPage() {
  return <Outlet />;
}
