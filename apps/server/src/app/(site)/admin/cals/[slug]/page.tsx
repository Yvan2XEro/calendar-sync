import { redirect } from "next/navigation";

type SlugPageParams = Promise<{ slug: string }>;

const page = async ({ params }: { params: SlugPageParams }) => {
	const { slug } = await params;
	redirect({ pathname: "/admin/cals/[slug]/settings", params: { slug } });
};

export default page;
