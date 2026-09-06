import { useEffect, useState } from "react";
import { fetchAuthenticatedBlob } from "@/lib/echat-api";

export function useAuthenticatedImage(source?: string) {
  const [resolved, setResolved] = useState(source || "");

  useEffect(() => {
    if (!source || !source.startsWith("/api/")) {
      setResolved(source || "");
      return;
    }
    let active = true;
    let objectUrl = "";
    setResolved("");
    fetchAuthenticatedBlob(source)
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      })
      .catch(() => active && setResolved(""));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  return resolved;
}
