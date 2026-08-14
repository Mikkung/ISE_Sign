import { redirect } from "next/navigation";

export default function StudentRegisterRedirectPage() {
  redirect("/login");
}

