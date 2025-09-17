import { HeaderNavWrapper } from "@/components/layout/HeaderNavWrapper";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <HeaderNavWrapper>
        <div className="flex-auto flex items-center justify-between">
          <span className="text-lg font-semibold">Calendar Sync</span>
          <div>
            <Link href="/auth/sign-in">Sign in</Link>
          </div>
        </div>
      </HeaderNavWrapper>
    </>
  );
}
