import { useSearchParams } from "next/navigation";

export const useCallbackSP = () => {
	const searchParams = useSearchParams();

	const callbackURL = searchParams.get("redirect") || "/dashboard";
	return {
		callbackURL,
	};
};
