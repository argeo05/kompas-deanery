import { describe, expect, it } from "vitest";
import type { ClassDTO, ScheduleChangeDTO } from "@/contracts/api";
import { pickHero } from "@/lib/today";

// DS-07 · Hero-карточка «Сегодня» (порядок приоритета SPEC §6.2, AC-2.2). Тесты готовы, их не менять.
//
// Правила (решение D-003). «Активная» пара — пара сегодня без изменения типа cancelled.
// 1. change — есть изменение из unseenChanges, пара которого (todayClasses[i].change.id) ещё
//    не началась: now < startsAt (startsAt уже после переноса). Из нескольких — пара, что начнётся
//    раньше. Изменение пары, которой нет в todayClasses, и изменение уже начавшейся пары не показываются.
// 2. now — идёт активная пара: startsAt ≤ now < endsAt.
// 3. soon — ближайшая активная пара начнётся не позже чем через 3 ч: startsAt − now ≤ 3 ч.
// 4. Активная пара сегодня ещё будет, но позже чем через 3 ч → day_off, nextClassAt = её начало
//    («Пар пока нет. Ближайшая — сегодня в 19:00»). SPEC этот случай не описывает, см. D-003.
// 5. done_today — активные пары сегодня были и все закончились (now ≥ endsAt), nextClassAt из аргумента.
// 6. day_off — активных пар сегодня нет, nextClassAt из аргумента.
// Время в ответе — строки из ClassDTO как есть.

const DAY = "2026-11-12"; // четверг
const TOMORROW_FIRST = "2026-11-13T09:30:00+03:00";
const at = (time: string, date = DAY) => `${date}T${time}:00+03:00`;

const change = (id: string, patch: Partial<ScheduleChangeDTO> = {}): ScheduleChangeDTO => ({
  id,
  type: "moved",
  previous: { startsAt: at("12:40"), endsAt: at("14:00"), roomNumber: "4012" },
  reason: null,
  createdAt: at("18:00", "2026-11-11"),
  seen: false,
  ...patch,
});

const cls = (
  id: string,
  start: string,
  end: string,
  ch: ScheduleChangeDTO | null = null,
): ClassDTO => ({
  id,
  course: { id: `course-${id}`, title: "Макроэкономика", shortTitle: "Макро", colorIndex: 1 },
  type: "seminar",
  startsAt: at(start),
  endsAt: at(end),
  room: { id: "room-1", building: "А", number: "4012", floor: 4, hint: null },
  teacher: { id: "t-1", fullName: "Петров А. В.", email: null, officeHours: null },
  weekParity: null,
  change: ch,
  note: null,
});

const c1 = cls("c1", "09:30", "10:50");
const c2 = cls("c2", "11:10", "12:30");
const c3 = cls("c3", "12:40", "14:00");
const day = [c1, c2, c3];

describe("pickHero · 1. изменение в расписании", () => {
  const moved = change("ch-moved");
  const c3moved = cls("c3", "15:20", "16:40", moved); // 12:40 → 15:20

  it("непросмотренный перенос важнее идущей пары", () => {
    expect(pickHero(at("10:00"), [c1, c2, c3moved], [moved], TOMORROW_FIRST)).toEqual({
      kind: "change",
      classId: "c3",
      change: moved,
    });
  });

  it("просмотренный перенос не всплывает", () => {
    expect(pickHero(at("10:00"), [c1, c2, c3moved], [], TOMORROW_FIRST)).toEqual({
      kind: "now",
      classId: "c1",
      endsAt: c1.endsAt,
    });
  });

  it("показывается до начала изменённой пары, но не дольше (ровно в начало — уже «сейчас»)", () => {
    expect(pickHero(at("15:19"), [c1, c2, c3moved], [moved], TOMORROW_FIRST).kind).toBe("change");
    expect(pickHero(at("15:20"), [c1, c2, c3moved], [moved], TOMORROW_FIRST)).toEqual({
      kind: "now",
      classId: "c3",
      endsAt: c3moved.endsAt,
    });
  });

  it("отмена пары — тоже изменение; отменённая пара не бывает «сейчас» и «скоро»", () => {
    const cancelled = change("ch-cancel", { type: "cancelled", previous: null });
    const c2cancelled = cls("c2", "11:10", "12:30", cancelled);
    expect(pickHero(at("10:00"), [c1, c2cancelled, c3], [cancelled], TOMORROW_FIRST)).toEqual({
      kind: "change",
      classId: "c2",
      change: cancelled,
    });
    // Время отменённой пары: её не показываем, ближайшая активная — c3 в 12:40.
    expect(pickHero(at("11:30"), [c1, c2cancelled, c3], [cancelled], TOMORROW_FIRST)).toEqual({
      kind: "soon",
      classId: "c3",
      startsAt: c3.startsAt,
    });
  });

  it("из нескольких изменений — то, чья пара начнётся раньше", () => {
    const room = change("ch-room", { type: "room_changed" });
    const c2room = cls("c2", "11:10", "12:30", room);
    expect(pickHero(at("09:00"), [c1, c2room, c3moved], [moved, room], TOMORROW_FIRST)).toEqual({
      kind: "change",
      classId: "c2",
      change: room,
    });
  });

  it("изменение пары не из сегодняшнего списка игнорируется", () => {
    expect(pickHero(at("10:00"), day, [change("ch-other")], TOMORROW_FIRST).kind).toBe("now");
  });
});

describe("pickHero · 2. идёт пара", () => {
  it("посреди пары", () => {
    expect(pickHero(at("10:00"), day, [], TOMORROW_FIRST)).toEqual({
      kind: "now",
      classId: "c1",
      endsAt: c1.endsAt,
    });
  });

  it("ровно в начало пары — «сейчас», а не «скоро»", () => {
    expect(pickHero(at("09:30"), day, [], TOMORROW_FIRST)).toEqual({
      kind: "now",
      classId: "c1",
      endsAt: c1.endsAt,
    });
  });

  it("открыл через 10 минут после начала — «сейчас»", () => {
    expect(pickHero(at("09:40"), day, [], TOMORROW_FIRST).kind).toBe("now");
  });

  it("ровно в конец пары она уже не идёт — «скоро» следующая", () => {
    expect(pickHero(at("10:50"), day, [], TOMORROW_FIRST)).toEqual({
      kind: "soon",
      classId: "c2",
      startsAt: c2.startsAt,
    });
  });

  it("now в UTC сравнивается по моменту, а не по строке", () => {
    // 07:00Z = 10:00 МСК
    expect(pickHero("2026-11-12T07:00:00Z", day, [], TOMORROW_FIRST).kind).toBe("now");
  });
});

describe("pickHero · 3. скоро пара (≤ 3 ч)", () => {
  it("утром до первой пары", () => {
    expect(pickHero(at("08:00"), day, [], TOMORROW_FIRST)).toEqual({
      kind: "soon",
      classId: "c1",
      startsAt: c1.startsAt,
    });
  });

  it("ровно за 3 ч — «скоро», за 3 ч 1 мин — ещё нет", () => {
    expect(pickHero(at("06:30"), day, [], TOMORROW_FIRST).kind).toBe("soon");
    expect(pickHero(at("06:29"), day, [], TOMORROW_FIRST)).toEqual({
      kind: "day_off",
      nextClassAt: c1.startsAt,
    });
  });

  it("перерыв между парами", () => {
    expect(pickHero(at("12:35"), day, [], TOMORROW_FIRST)).toEqual({
      kind: "soon",
      classId: "c3",
      startsAt: c3.startsAt,
    });
  });

  it("вечерняя пара позже чем через 3 ч — ближайшая сегодня (решение D-003)", () => {
    const evening = [cls("e1", "19:00", "20:20")];
    expect(pickHero(at("12:00"), evening, [], TOMORROW_FIRST)).toEqual({
      kind: "day_off",
      nextClassAt: at("19:00"),
    });
  });
});

describe("pickHero · 4. пары закончились", () => {
  it("после последней пары", () => {
    expect(pickHero(at("14:30"), day, [], TOMORROW_FIRST)).toEqual({
      kind: "done_today",
      nextClassAt: TOMORROW_FIRST,
    });
  });

  it("ровно в конец последней пары", () => {
    expect(pickHero(at("14:00"), day, [], TOMORROW_FIRST).kind).toBe("done_today");
  });

  it("следующих занятий нет — nextClassAt null", () => {
    expect(pickHero(at("14:30"), day, [], null)).toEqual({ kind: "done_today", nextClassAt: null });
  });
});

describe("pickHero · 5. выходной", () => {
  it("пар сегодня нет", () => {
    expect(pickHero(at("10:00", "2026-11-15"), [], [], "2026-11-16T09:30:00+03:00")).toEqual({
      kind: "day_off",
      nextClassAt: "2026-11-16T09:30:00+03:00",
    });
  });

  it("каникулы без ближайших занятий", () => {
    expect(pickHero(at("10:00", "2026-12-31"), [], [], null)).toEqual({
      kind: "day_off",
      nextClassAt: null,
    });
  });

  it("единственная пара отменена и изменение просмотрено — выходной", () => {
    const cancelled = change("ch-cancel", { type: "cancelled", previous: null, seen: true });
    expect(
      pickHero(at("08:00"), [cls("c1", "09:30", "10:50", cancelled)], [], TOMORROW_FIRST),
    ).toEqual({ kind: "day_off", nextClassAt: TOMORROW_FIRST });
  });
});

describe("pickHero · полночь и переход на следующий день", () => {
  it("23:59 после пар — «на сегодня всё», завтра первая пара", () => {
    expect(pickHero(at("23:59"), day, [], TOMORROW_FIRST)).toEqual({
      kind: "done_today",
      nextClassAt: TOMORROW_FIRST,
    });
  });

  it("00:00 нового дня: пары этого дня уже «сегодня», до первой больше 3 ч", () => {
    const friday = [cls("f1", "09:30", "10:50")].map((c) => ({
      ...c,
      startsAt: at("09:30", "2026-11-13"),
      endsAt: at("10:50", "2026-11-13"),
    }));
    expect(pickHero(at("00:00", "2026-11-13"), friday, [], "2026-11-16T09:30:00+03:00")).toEqual({
      kind: "day_off",
      nextClassAt: friday[0].startsAt,
    });
  });

  it("завтрашняя пара в 02:00 не становится «скоро» в 23:30: в списке только сегодняшние", () => {
    // Завтрашние пары в todayClasses не передаются: в 23:30 после пар — done_today.
    expect(pickHero(at("23:30"), day, [], "2026-11-13T02:00:00+03:00")).toEqual({
      kind: "done_today",
      nextClassAt: "2026-11-13T02:00:00+03:00",
    });
  });
});
