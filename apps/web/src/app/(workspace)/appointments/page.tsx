import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { AppointmentsPage } from "@/features/appointments/appointments-page";
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AppointmentsPage />
    </Suspense>
  );
}
