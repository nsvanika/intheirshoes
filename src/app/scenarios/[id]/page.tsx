import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCharacter, getScenario, scenarios } from "@/data/scenarios";

export function generateStaticParams() {
  return scenarios.map((s) => ({ id: s.id }));
}

export async function generateMetadata(
  props: PageProps<"/scenarios/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const scenario = getScenario(id);
  return scenario
    ? { title: `${scenario.title} | InTheirShoes`, description: scenario.description }
    : {};
}

export default async function ScenarioPage(
  props: PageProps<"/scenarios/[id]">,
) {
  const { id } = await props.params;
  const scenario = getScenario(id);
  if (!scenario) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/"
        className="rounded-md text-teal-800 underline underline-offset-4 dark:text-teal-300"
      >
        &larr; All scenarios
      </Link>

      <p className="mt-6 text-xs font-medium uppercase tracking-wide text-teal-800 dark:text-teal-300">
        {scenario.theme}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
        {scenario.title}
      </h1>
      <p className="mt-3 text-lg text-slate-700 dark:text-slate-300">
        {scenario.description}
      </p>

      <h2 className="mt-8 text-xl font-semibold">Who is in this story</h2>
      <ul className="mt-3 space-y-2">
        {scenario.characters.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong>
            <span className="text-slate-700 dark:text-slate-300">
              {" "}
              &ndash; {c.role}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-semibold">What happens</h2>
      <ol className="mt-3 space-y-3">
        {scenario.steps.map((step, i) => (
          <li
            key={i}
            className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          >
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Step {i + 1} &middot; {getCharacter(scenario, step.characterId)?.name}
            </span>
            <span className="mt-1 block text-lg leading-relaxed">
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
