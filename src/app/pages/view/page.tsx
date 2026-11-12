import { Suspense } from "react";

import { PageView } from "@/components/page-view";

export default function PageViewRoute() {
  return (
    <Suspense>
      <PageView />
    </Suspense>
  );
}
