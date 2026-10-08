import type { Metadata } from "next";
import MakeYourOwn from "@/components/MakeYourOwn";

export const metadata: Metadata = {
  title: "Make Your Own | InTheirShoes",
  description: "Describe a situation and explore what each person knows at every step.",
};

export default function MakeYourOwnPage() {
  return <MakeYourOwn />;
}
