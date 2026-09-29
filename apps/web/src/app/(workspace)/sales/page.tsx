import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { LeadsPage } from "@/features/leads/leads-page";
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <LeadsPage mode="sales" />
    </Suspense>
  );
}
