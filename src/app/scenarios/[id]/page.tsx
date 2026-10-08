import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ScenarioLens from "@/components/ScenarioLens";
import { scenarios } from "@/data/scenarios";
import { trackBeliefs } from "@/engine/engine";
import { promptAfterStep } from "@/engine/prediction";
import { getBeliefStory } from "@/engine/stories";
import { buildStepView } from "@/engine/view";

export function generateStaticParams() {
  return scenarios.map((s) => ({ id: s.id }));
}

export async function generateMetadata(
  props: PageProps<"/scenarios/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const scenario = scenarios.find((s) => s.id === id);
  return scenario ? { title: `${scenario.title} | InTheirShoes` } : {};
}

export default async function ScenarioPage(props: PageProps<"/scenarios/[id]">) {
  const { id } = await props.params;
  const scenario = scenarios.find((s) => s.id === id);
  const story = getBeliefStory(id);
  if (!scenario || !story) notFound();

  // Only step 1 is rendered on the server; later steps are requested one at a time
  // from /api/belief-tracking when the student presses Next Step.
  const initialView = buildStepView(
    story,
    trackBeliefs(story),
    scenario,
    1,
    promptAfterStep(scenario.id, 1, story),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/"
        className="rounded-md text-teal-800 underline underline-offset-4 dark:text-teal-300"
      >
        &larr; All scenarios
      </Link>
      <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">{scenario.title}</h1>
      <ScenarioLens scenarioId={scenario.id} initialView={initialView} />
    </main>
  );
}
