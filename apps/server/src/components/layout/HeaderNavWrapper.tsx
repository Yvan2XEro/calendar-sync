import React, { PropsWithChildren } from "react";

export const HeaderNavWrapper = ({ children }: PropsWithChildren) => {
  return (
    <header className="border-b bg-background/80 sticky top-0 z-10 flex h-16 items-center gap-4 px-6 backdrop-blur">
      {children}
    </header>
  );
};
