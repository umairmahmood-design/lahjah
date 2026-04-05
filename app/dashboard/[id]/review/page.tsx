"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ReviewRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/dashboard/${id}`);
  }, [id, router]);

  return null;
}
