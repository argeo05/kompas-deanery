import { describe, expect, it } from "vitest";
import { freeWindows } from "@/lib/windows";

// DS-05 · Свободные окна для планов (SPEC §6.7 п.3, AC-7.1). Тесты готовы, их не менять.
//
// Правила (решение D-003):
// - рассматриваются `days` календарных дней подряд, начиная с московского дня `from`
//   (выходные не исключаются: планировать можно и в субботу);
// - в каждом дне окно — промежуток [dayStart, dayEnd] (по умолчанию 09:00–22:00 МСК)
//   за вычетом пар; пары могут пересекаться и идти не по порядку;
// - окно не начинается раньше `from`; окна короче minMinutes (по умолчанию 60) отбрасываются,
//   ровно minMinutes — подходит;
// - результат по возрастанию, ISODateTime +03:00.

const at = (date: string, time: string) => `${date}T${time}:00+03:00`;
const THU = "2026-11-12";
const FRI = "2026-11-13";
const SAT = "2026-11-14";
const pair = (date: string, start: string, end: string) => ({
  startsAt: at(date, start),
  endsAt: at(date, end),
});
const win = pair;

const thursday = [
  pair(THU, "09:30", "10:50"),
  pair(THU, "11:10", "12:30"),
  pair(THU, "12:40", "14:00"),
  pair(THU, "15:20", "16:40"),
];

describe("freeWindows", () => {
  it("промежутки между парами короче часа не предлагаются", () => {
    expect(freeWindows(thursday, at(THU, "08:00"), 1)).toEqual([
      win(THU, "14:00", "15:20"),
      win(THU, "16:40", "22:00"),
    ]);
  });

  it("окно не начинается раньше from; остаток короче часа отбрасывается", () => {
    expect(freeWindows(thursday, at(THU, "14:30"), 1)).toEqual([win(THU, "16:40", "22:00")]);
    expect(freeWindows(thursday, at(THU, "13:50"), 1)).toEqual([
      win(THU, "14:00", "15:20"),
      win(THU, "16:40", "22:00"),
    ]);
  });

  it("from посреди пары — первое окно после её конца", () => {
    expect(freeWindows(thursday, at(THU, "15:30"), 1)).toEqual([win(THU, "16:40", "22:00")]);
  });

  it("from посреди свободного времени — окно начинается с from", () => {
    expect(freeWindows([], at(THU, "15:10"), 1)).toEqual([win(THU, "15:10", "22:00")]);
  });

  it("окно ровно minMinutes подходит", () => {
    const classes = [pair(THU, "09:00", "14:00"), pair(THU, "15:00", "22:00")];
    expect(freeWindows(classes, at(THU, "08:00"), 1)).toEqual([win(THU, "14:00", "15:00")]);
  });

  it("minMinutes настраивается", () => {
    expect(freeWindows(thursday, at(THU, "08:00"), 1, { minMinutes: 20 })).toEqual([
      win(THU, "09:00", "09:30"),
      win(THU, "10:50", "11:10"),
      win(THU, "14:00", "15:20"),
      win(THU, "16:40", "22:00"),
    ]);
  });

  it("границы учебного дня настраиваются", () => {
    expect(
      freeWindows(thursday, at(THU, "08:00"), 1, { dayStart: "10:00", dayEnd: "18:00" }),
    ).toEqual([win(THU, "14:00", "15:20"), win(THU, "16:40", "18:00")]);
  });

  it("несколько дней: свободный день целиком, суббота тоже", () => {
    expect(freeWindows(thursday, at(THU, "08:00"), 3)).toEqual([
      win(THU, "14:00", "15:20"),
      win(THU, "16:40", "22:00"),
      win(FRI, "09:00", "22:00"),
      win(SAT, "09:00", "22:00"),
    ]);
  });

  it("from после конца учебного дня — окна со следующего дня", () => {
    expect(freeWindows([], at(THU, "22:30"), 2)).toEqual([win(FRI, "09:00", "22:00")]);
  });

  it("пересекающиеся и неотсортированные пары объединяются", () => {
    const classes = [pair(THU, "12:00", "13:30"), pair(THU, "09:00", "12:30")];
    expect(freeWindows(classes, at(THU, "08:00"), 1)).toEqual([win(THU, "13:30", "22:00")]);
  });

  it("пара, начавшаяся до начала учебного дня, сдвигает первое окно", () => {
    expect(freeWindows([pair(THU, "08:00", "09:40")], at(THU, "07:00"), 1)).toEqual([
      win(THU, "09:40", "22:00"),
    ]);
  });

  it("пары в UTC учитываются по московскому времени", () => {
    // 06:30Z–11:00Z = 09:30–14:00 МСК
    const classes = [{ startsAt: "2026-11-12T06:30:00Z", endsAt: "2026-11-12T11:00:00Z" }];
    expect(freeWindows(classes, at(THU, "08:00"), 1)).toEqual([win(THU, "14:00", "22:00")]);
  });

  it("AC-7.1: ни одно окно не пересекается с парами (неделя расписания)", () => {
    // Детерминированная «неделя»: по 2–4 пары в день в разных слотах, с наложениями.
    const slots = [
      ["09:00", "10:20"],
      ["10:30", "11:50"],
      ["12:40", "14:00"],
      ["14:10", "15:30"],
      ["15:40", "17:00"],
      ["17:10", "18:30"],
      ["18:40", "20:00"],
      ["20:10", "21:30"],
      ["11:30", "13:00"],
    ];
    const dates = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];
    const classes = dates.flatMap((d, i) =>
      [0, 1, 2, 3]
        .filter((k) => (i + k) % 3 !== 0 || k === 0)
        .map((k) => slots[(i * 2 + k * 3) % slots.length])
        .map(([s, e]) => pair(d, s, e)),
    );
    const from = at("2026-11-16", "10:00");
    const windows = freeWindows(classes, from, 7);
    expect(windows.length).toBeGreaterThan(0);

    const ms = (iso: string) => new Date(iso).getTime();
    windows.forEach((w, i) => {
      expect(w.startsAt).toMatch(/\+03:00$/);
      expect(w.endsAt).toMatch(/\+03:00$/);
      expect(ms(w.endsAt) - ms(w.startsAt)).toBeGreaterThanOrEqual(60 * 60_000);
      expect(ms(w.startsAt)).toBeGreaterThanOrEqual(ms(from));
      const time = (iso: string) =>
        new Date(iso).toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow" });
      expect(time(w.startsAt) >= "09:00:00").toBe(true);
      expect(time(w.endsAt) <= "22:00:00").toBe(true);
      if (i > 0) expect(ms(w.startsAt)).toBeGreaterThanOrEqual(ms(windows[i - 1].endsAt));
      for (const c of classes) {
        const overlaps = ms(w.startsAt) < ms(c.endsAt) && ms(c.startsAt) < ms(w.endsAt);
        expect(overlaps, `${w.startsAt}–${w.endsAt} × ${c.startsAt}–${c.endsAt}`).toBe(false);
      }
    });
  });
});
