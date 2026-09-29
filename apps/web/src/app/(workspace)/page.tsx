"use client";
import { useApp } from "@/components/providers";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
export default function Home() {
  const { user } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (user) router.replace(user.isAdmin ? "/dashboard" : "/my-leads");
  }, [user, router]);
  return null;
}
