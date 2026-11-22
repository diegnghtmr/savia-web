"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function JobPoll() {
  const router = useRouter();
  useEffect(() => {
    let remaining = 20;
    const timer = setInterval(() => {
      router.refresh();
      if (--remaining === 0) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <button className="submit" type="button" onClick={() => router.refresh()}>
      Actualizar estado
    </button>
  );
}
