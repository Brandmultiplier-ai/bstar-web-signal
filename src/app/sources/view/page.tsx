import { Suspense } from "react";

import { SourceView } from "@/components/source-view";

export default function SourceViewRoute() {
  return (
    <Suspense>
      <SourceView />
    </Suspense>
  );
}
