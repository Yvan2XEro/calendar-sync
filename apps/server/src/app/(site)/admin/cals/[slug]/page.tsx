import { redirect } from "next/navigation";

const page = async ({ params }: PageProps<"/admin/cals/[slug]">) => {
  const { slug } = await params;
  redirect(`/admin/cals/${slug}/settings`);
};

export default page;
