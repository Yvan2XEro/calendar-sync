import { redirect } from "next/navigation";

type SlugPageParams = Promise<{ slug: string }>;

const page = async ({ params }: { params: SlugPageParams }) => {
  const { slug } = await params;
  redirect(`/admin/cals/${slug}/settings`);
};

export default page;
