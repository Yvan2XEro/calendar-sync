import { redirect } from "next/navigation";

const page = () => {
  redirect("/admin/overview");
};

export default page;
