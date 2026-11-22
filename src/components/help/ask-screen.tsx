"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CONTROL, Field } from "@/components/ui/field";
import { InlineError } from "@/components/ui/error-state";
import { Announce } from "@/components/ui/status-region";
import type { AssistantAnswerDTO, AssistantMode, AssistantRefusal } from "@/contracts/api";
import { sendJson } from "@/lib/send-json";

// «Спросить Компас» (SPEC §6.8.2, AC-8.1–8.3). Отвечает только по справочнику, всегда со ссылкой на источник.
// Если ответа нет, предлагает написать в деканат с уже заполненным вопросом. Ни ключей, ни обращений к
// провайдеру в браузере нет: экран ходит только на /api/me/assistant.

const EXAMPLES = [
  "Как пересдать экзамен?",
  "Как оформить академический отпуск?",
  "Какие бывают справки?",
];

const REFUSAL_TEXT: Record<AssistantRefusal, string> = {
  injection:
    "На это я не отвечу. Я работаю только по справочнику студента и не меняю свои правила. Спросите о пересдачах, справках или академическом отпуске.",
  foreign_data:
    "Данные других людей я не показываю. Свои оценки и расписание откройте в разделах «Учёба» и «Расписание».",
  promise:
    "Я не принимаю решений и не обещаю результат: это решает деканат. Условия и шаги есть в справочнике, а по вашему случаю напишите в деканат.",
};

const ticketHref = (question: string) =>
  `/support/new?topic=other&text=${encodeURIComponent(question.slice(0, 500))}`;

function signature(a: AssistantAnswerDTO): string {
  if (a.fallback)
    return "ИИ временно недоступен, вот что нашлось в справочнике. Проверьте в источнике.";
  return a.mode === "ai"
    ? "Ответ сформирован ИИ по справочнику. Проверьте в источнике."
    : "Ответ найден в справочнике. Проверьте в источнике.";
}

type Result =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done"; question: string; answer: AssistantAnswerDTO }
  | { state: "error"; question: string; reason: "offline" | "server" | "limit" };

export function AskScreen({ mode }: { mode: AssistantMode }) {
  const [question, setQuestion] = React.useState("");
  const [result, setResult] = React.useState<Result>({ state: "idle" });
  const answerRef = React.useRef<HTMLDivElement>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 2 || result.state === "loading") return;
    setResult({ state: "loading" });
    try {
      const res = await sendJson("POST", "/api/me/assistant", { question: q });
      if (res.status === 429) return setResult({ state: "error", question: q, reason: "limit" });
      if (!res.ok) return setResult({ state: "error", question: q, reason: "server" });
      setResult({ state: "done", question: q, answer: (await res.json()) as AssistantAnswerDTO });
    } catch {
      setResult({ state: "error", question: q, reason: "offline" });
    }
  }

  React.useEffect(() => {
    if (result.state === "done" || result.state === "error") answerRef.current?.focus();
  }, [result]);

  return (
    <>
      <header className="flex flex-col gap-2">
        <Button asChild variant="link" size="sm" className="self-start lg:min-h-11">
          <Link href="/help">
            <ArrowLeft aria-hidden className="size-4" />
            Справочник
          </Link>
        </Button>
        <h1 className="type-h1">Спросить Компас</h1>
        <p className="max-w-xl type-body text-ink-2">
          Отвечаю на вопросы о правилах только по справочнику и называю статью, откуда взят ответ.
          Правила в нём вымышленные: это демо-версия. Решений за деканат не принимаю и результат не
          обещаю.
          {mode === "deterministic" && " Сейчас ответ ищу по статьям, нейросеть отключена."}
        </p>
      </header>

      <form
        className="flex max-w-xl flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <Field label="Ваш вопрос" hint="Не пишите паспортные данные и пароли.">
          {(props) => (
            <textarea
              {...props}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              maxLength={500}
              className={CONTROL}
            />
          )}
        </Field>
        <Button
          type="submit"
          loading={result.state === "loading"}
          disabled={question.trim().length < 2}
          className="self-start"
        >
          Спросить
        </Button>
      </form>

      {result.state === "idle" && (
        <section aria-labelledby="ask-examples" className="flex max-w-xl flex-col gap-2">
          <h2 id="ask-examples" className="type-h3">
            Примеры вопросов
          </h2>
          <ul className="flex flex-col gap-2">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <Button
                  variant="secondary"
                  className="w-full justify-start py-2 text-left whitespace-normal"
                  onClick={() => {
                    setQuestion(ex);
                    void ask(ex);
                  }}
                >
                  {ex}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.state === "loading" && <Announce message="Ищем ответ в справочнике…" />}

      <div
        ref={answerRef}
        tabIndex={-1}
        role="region"
        aria-label="Ответ помощника"
        className="max-w-xl outline-none"
      >
        {result.state === "error" && (
          <section aria-labelledby="ask-error" className="flex flex-col gap-3">
            <InlineError>
              <span id="ask-error">
                {result.reason === "limit"
                  ? "На сегодня вопросы закончились: лимит 50 за 24 часа. Справочник по-прежнему открыт без ограничений."
                  : result.reason === "offline"
                    ? "Нет связи. Вопрос сохранён в поле. Когда появится интернет, нажмите «Спросить»."
                    : "Помощник сейчас не отвечает. Попробуйте через несколько минут или найдите ответ в справочнике."}
              </span>
            </InlineError>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href={`/search?q=${encodeURIComponent(result.question.slice(0, 80))}`}>
                  <Search aria-hidden />
                  Найти в справочнике
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/help">Открыть справочник</Link>
              </Button>
            </div>
          </section>
        )}

        {result.state === "done" && (
          <AnswerCard question={result.question} answer={result.answer} />
        )}
      </div>
    </>
  );
}

function AnswerCard({ question, answer }: { question: string; answer: AssistantAnswerDTO }) {
  const [first, ...rest] = answer.sources;
  return (
    <Card className="gap-3 p-4">
      <p className="type-caption text-ink-2">Ваш вопрос: {question}</p>
      {answer.kind === "answer" && first && (
        <>
          <h2 className="type-h3">Ответ по справочнику</h2>
          <p className="type-body whitespace-pre-line">{answer.text}</p>
          <p className="type-body">
            Источник:{" "}
            <Link href={first.href}>
              {first.title}
              {first.section ? `, раздел «${first.section}»` : ""}
            </Link>
          </p>
          {rest.length > 0 && (
            <p className="type-caption text-ink-2">
              Ещё по теме:{" "}
              {rest.map((s, i) => (
                <React.Fragment key={s.slug}>
                  {i > 0 && ", "}
                  <Link href={s.href}>{s.title}</Link>
                </React.Fragment>
              ))}
            </p>
          )}
          <p className="type-caption text-ink-2">{signature(answer)}</p>
        </>
      )}
      {answer.kind === "not_found" && (
        <>
          <h2 className="type-h3">В справочнике ответа нет</h2>
          <p className="type-body">Я не нашёл это в справочнике. Написать в деканат?</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={ticketHref(question)}>
                <MessageSquare aria-hidden />
                Написать в деканат
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/help">Открыть справочник</Link>
            </Button>
          </div>
        </>
      )}
      {answer.kind === "refused" && answer.refusal && (
        <>
          <h2 className="type-h3">Здесь я не помогу</h2>
          <p className="type-body">{REFUSAL_TEXT[answer.refusal]}</p>
          {answer.refusal === "promise" && (
            <Button asChild className="self-start">
              <Link href={ticketHref(question)}>
                <MessageSquare aria-hidden />
                Написать в деканат
              </Link>
            </Button>
          )}
        </>
      )}
      <p className="type-caption text-ink-2">Сегодня можно задать ещё: {answer.remaining}.</p>
    </Card>
  );
}
