import Link from "next/link";
import { scenarios } from "@/data/scenarios";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        InTheirShoes
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-slate-700 dark:text-slate-300">
        Everyday situations, told one step at a time. Read each story and
        think about what each person knew, felt, and expected.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Choose a scenario</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((scenario) => (
          <li key={scenario.id} className="flex">
            <Link
              href={`/scenarios/${scenario.id}`}
              className="flex w-full flex-col rounded-xl border border-slate-300 bg-white p-5 transition-colors hover:border-teal-700 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-teal-400 dark:hover:bg-slate-800"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-teal-800 dark:text-teal-300">
                {scenario.theme}
              </span>
              <span className="mt-2 text-lg font-semibold">
                {scenario.title}
              </span>
              <span className="mt-1 text-slate-700 dark:text-slate-300">
                {scenario.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
