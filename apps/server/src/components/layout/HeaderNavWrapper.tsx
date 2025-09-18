import React, { type PropsWithChildren } from "react";

export const HeaderNavWrapper = ({ children }: PropsWithChildren) => {
	return (
		<header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-6 backdrop-blur">
			{children}
		</header>
	);
};
