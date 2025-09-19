"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
        const router = useRouter();
        const { data: session, isPending } = authClient.useSession();
        const [isAuthorized, setIsAuthorized] = React.useState(false);
        const [hasChecked, setHasChecked] = React.useState(false);

        React.useEffect(() => {
                if (isPending) return;

                setHasChecked(true);
                if (!session) {
                        router.replace("/auth/sign-in");
                        return;
                }

                const roles = Array.isArray(session.user?.roles)
                        ? session.user?.roles
                        : session.user?.role
                                ? [session.user.role]
                                : [];

                if (!roles?.includes("admin")) {
                        toast.error("Administrator access required");
                        router.replace("/");
                        return;
                }

                setIsAuthorized(true);
        }, [isPending, router, session]);

        if (!hasChecked || isPending) {
                return (
                        <div className="flex w-full justify-center py-16 text-muted-foreground">
                                <Loader2 className="size-5 animate-spin" aria-label="Checking permissions" />
                        </div>
                );
        }

        if (!isAuthorized) {
                return null;
        }

        return <>{children}</>;
}
