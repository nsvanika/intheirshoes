import type { Metadata } from "next";
import Link from "next/link";
import ClearProgressButton from "@/components/ClearProgressButton";

export const metadata: Metadata = {
  title: "Privacy | InTheirShoes",
  description: "What InTheirShoes saves, where, and what it sends.",
};

const H2 = "mt-8 text-2xl font-semibold";
const LIST = "mt-3 list-disc space-y-2 pl-6 leading-relaxed";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="rounded-md text-teal-800 underline underline-offset-4 dark:text-teal-300">
        &larr; All scenarios
      </Link>
      <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Privacy</h1>
      <p className="mt-3 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
        Here is what InTheirShoes saves and sends, in plain words. We have tried to be exact, and we
        don&apos;t promise more than we can.
      </p>

      <h2 className={H2}>The short version</h2>
      <ul className={LIST}>
        <li>You don&apos;t need an account. We don&apos;t ask for your name or email.</li>
        <li>
          Your accessibility settings and your place in each scenario are saved in your own browser, on
          your own device.
        </li>
        <li>You can clear your saved progress whenever you like (the button is below).</li>
        <li>
          The app has no database, and it does not intentionally store the situations you describe on
          Make Your Own.
        </li>
        <li>Please don&apos;t type real names or private information. Use made-up ones.</li>
      </ul>

      <h2 className={H2}>What is saved in your browser</h2>
      <p className="mt-3 leading-relaxed">
        Your browser keeps two small things for this site, and only on your device:
      </p>
      <ul className={LIST}>
        <li>
          <strong>Your accessibility settings:</strong> large text, the reading-friendly font and high
          contrast, so they are still on when you come back.
        </li>
        <li>
          <strong>Your progress:</strong> for each built-in scenario, which step you reached, and which
          prediction questions you answered and which choice you picked. It is just numbers and
          choice letters, not any story text.
        </li>
      </ul>
      <p className="mt-3 leading-relaxed">
        Stories you make on Make Your Own are <strong>not</strong> saved at all, so they are gone when
        you refresh or leave the page. If your browser blocks saving, the app still works; it just
        won&apos;t remember anything.
      </p>
      <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-3 font-semibold">Clear what has been saved</p>
        <ClearProgressButton />
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          This removes your saved progress. Your accessibility settings are kept; you can reset those
          in the Accessibility settings panel at the top of any page.
        </p>
      </div>

      <h2 className={H2}>Make Your Own</h2>
      <ul className={LIST}>
        <li>
          <strong>Use made-up names.</strong> Please don&apos;t enter real names, school names,
          addresses, phone numbers, or private information. The page checks for some obvious things
          like emails and phone numbers, but it can&apos;t tell a real name from a made-up one, so it
          is up to you.
        </li>
        <li>
          <strong>Demo mode</strong> is what you see unless the site owner has switched on AI. Your
          text is sent to this app&apos;s own server only so it can check whether it is one of the
          built-in examples. It is <strong>not</strong> sent to an AI provider. The app doesn&apos;t
          save it, and it is not written in the app&apos;s logs.
        </li>
        <li>
          <strong>If AI mode is turned on,</strong> your description is sent to Anthropic, the company
          that makes the Claude AI model, so it can be turned into a story. That happens only after you
          see a notice and tick a box to say you understand. Anthropic handles it under its own
          policies, which we don&apos;t control, and it does not stay only on your device. The app
          itself still doesn&apos;t save it or put it in its logs.
        </li>
      </ul>

      <h2 className={H2}>Other things worth knowing</h2>
      <ul className={LIST}>
        <li>
          <strong>The website host and the network.</strong> Like any website, the company that hosts
          this site and the networks between you and it can see ordinary technical details, such as
          your device&apos;s address and which pages you open, and they may keep their own logs. So we
          can&apos;t say that nothing is ever sent anywhere.
        </li>
        <li>
          <strong>Read Aloud</strong> uses the speech built into your browser, and it only reads what
          is on the screen, only when you press the button. On some browsers and devices, certain
          voices are provided by an online service run by the browser or device maker. If you use one,
          the text being read may be sent to them. We don&apos;t control that.
        </li>
        <li>
          This app doesn&apos;t set cookies or add advertising or analytics trackers. The fonts,
          including the optional reading-friendly font, come from this site and are not loaded from
          another company while you use it.
        </li>
        <li>
          InTheirShoes is a practice tool, not therapy or diagnosis. If you are worried about how you
          or someone else is feeling, please talk to a trusted adult.
        </li>
      </ul>
    </main>
  );
}
